/**
 * Platform provisioning service
 *
 * Orchestrates the full lifecycle of a platform deployment:
 *   1. Find a server in the pool with headroom, or provision a new one on DO
 *   2. Wait for the server to become active and set it up (Docker, Traefik, etc.)
 *   3. Create the Dokploy project / environment / application for the user
 *   4. Trigger the build and return the public URL
 *
 * The public entry point is `runPlatformDeployment`, which runs asynchronously
 * (fire-and-forget) so the API can return a deploymentId immediately.
 */

import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { sshKeys } from "../db/schema/ssh-key";
import { nanoid } from "nanoid";
import {
	type PlatformDeploymentStatus,
	platformDeployment,
	platformServer,
	platformSettings,
	platformUser,
} from "../db/schema/platform";
import { createApplication, deployApplication, updateApplication } from "./application";
import { createDomain, generateTraefikMeDomain } from "./domain";
import { createProject } from "./project";
import { createServer } from "./server";
import { serverSetup } from "../setup/server-setup";
import {
	doCreateDroplet,
	doEnsureSSHKey,
	doGetDroplet,
} from "./digital-ocean";
import { findSSHKeyById } from "./ssh-key";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 8_000;
const POLL_MAX_ATTEMPTS = 30; // ~4 minutes

async function getPlatformConfig() {
	const [settings] = await db.select().from(platformSettings).limit(1);
	return {
		doApiToken: settings?.doApiToken ?? null,
		sshKeyId: settings?.sshKeyId ?? null,
		dropletSize: settings?.dropletSize ?? process.env.PLATFORM_DO_DROPLET_SIZE ?? "s-2vcpu-4gb",
		dropletRegion: settings?.dropletRegion ?? process.env.PLATFORM_DO_DROPLET_REGION ?? "nyc3",
		maxAppsPerServer: settings?.maxAppsPerServer ?? 20,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Status helpers
// ──────────────────────────────────────────────────────────────────────────────

async function setStatus(
	id: string,
	status: PlatformDeploymentStatus,
	extra: Partial<typeof platformDeployment.$inferInsert> = {},
) {
	await db
		.update(platformDeployment)
		.set({ status, updatedAt: new Date().toISOString(), ...extra })
		.where(eq(platformDeployment.platformDeploymentId, id));
}

// ──────────────────────────────────────────────────────────────────────────────
// Server pool helpers
// ──────────────────────────────────────────────────────────────────────────────

async function countDeploymentsOnServer(platformServerId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(platformDeployment)
		.where(eq(platformDeployment.platformServerId, platformServerId));
	return row?.n ?? 0;
}

async function findAvailablePoolServer(): Promise<string | null> {
	const servers = await db.query.platformServer.findMany({
		where: eq(platformServer.isActive, true),
	});

	for (const ps of servers) {
		const appCount = await countDeploymentsOnServer(ps.platformServerId);
		if (appCount < ps.maxApps) {
			return ps.platformServerId;
		}
	}
	return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// DO droplet provisioning
// ──────────────────────────────────────────────────────────────────────────────

async function pollUntilActive(
	token: string,
	dropletId: number,
): Promise<string> {
	for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		const droplet = await doGetDroplet(token, dropletId);
		if (droplet.status === "active" && droplet.ipAddress) {
			return droplet.ipAddress;
		}
		if (droplet.status === "off" || droplet.status === "archive") {
			throw new Error(`Droplet ${dropletId} entered status "${droplet.status}" unexpectedly`);
		}
	}
	throw new Error("Timed out waiting for droplet to become active");
}

async function provisionNewServer(serverName: string): Promise<string> {
	const cfg = await getPlatformConfig();

	if (!cfg.doApiToken) {
		throw new Error(
			"No DigitalOcean API token configured. " +
			"Go to /platform/admin/settings to add your DO token, " +
			"or add an existing server to the pool at /platform/admin/pool.",
		);
	}
	if (!cfg.sshKeyId) {
		throw new Error(
			"No SSH key selected in platform settings. " +
			"Go to /platform/admin/settings and choose an SSH key.",
		);
	}

	const sshKey = await findSSHKeyById(cfg.sshKeyId);
	const doKeyId = await doEnsureSSHKey(cfg.doApiToken, sshKey.publicKey, sshKey.name);

	const dropletId = await doCreateDroplet(cfg.doApiToken, {
		name: serverName,
		region: cfg.dropletRegion,
		size: cfg.dropletSize,
		sshKeyIds: [doKeyId],
	});

	const ipAddress = await pollUntilActive(cfg.doApiToken, dropletId);

	// Need an org to register the server under — use the SSH key's org
	const sshKeyRecord = await db.query.sshKeys.findFirst({
		where: eq(sshKeys.sshKeyId, cfg.sshKeyId),
		columns: { organizationId: true },
	});
	if (!sshKeyRecord?.organizationId) {
		throw new Error("Could not determine organization for SSH key");
	}

	const newServer = await createServer(
		{
			name: serverName,
			description: "Auto-provisioned platform server",
			ipAddress,
			port: 22,
			username: "root",
			sshKeyId: cfg.sshKeyId,
			serverType: "deploy",
			providerServerId: String(dropletId),
		},
		sshKeyRecord.organizationId,
	);

	// Run Dokploy server setup (installs Docker, Traefik, etc.)
	await serverSetup(newServer.serverId);

	// Add to platform server pool
	const [ps] = await db
		.insert(platformServer)
		.values({
			serverId: newServer.serverId,
			maxApps: cfg.maxAppsPerServer,
			region: cfg.dropletRegion,
		})
		.returning();

	if (!ps) throw new Error("Failed to insert platform server record");
	return ps.platformServerId;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dokploy resource creation
// ──────────────────────────────────────────────────────────────────────────────

async function ensureDokployProject(
	organizationId: string,
	projectName: string,
	existingProjectId: string | null | undefined,
): Promise<{ projectId: string; environmentId: string }> {
	if (existingProjectId) {
		const env = await db.query.environments.findFirst({
			where: (e, { eq }) => eq(e.projectId, existingProjectId),
			columns: { environmentId: true },
		});
		if (env) {
			return { projectId: existingProjectId, environmentId: env.environmentId };
		}
	}

	// createProject auto-creates a "production" environment
	const { project, environment } = await createProject(
		{ name: projectName, description: "" },
		organizationId,
	);

	return { projectId: project.projectId, environmentId: environment.environmentId };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type PlatformDeployParams = {
	platformDeploymentId: string;
	platformUserId: string;
	projectName: string;
	appName: string;
	sourceType: "git" | "docker";
	githubUrl?: string;
	dockerImage?: string;
	branch: string;
	port: number;
	envVars?: Record<string, string>;
};

/**
 * Fire-and-forget: call this without await from the tRPC mutation.
 * Updates platformDeployment.status as it progresses.
 */
export async function runPlatformDeployment(params: PlatformDeployParams) {
	const {
		platformDeploymentId,
		platformUserId,
		projectName,
		appName,
		sourceType,
		githubUrl,
		dockerImage,
		branch,
		port,
		envVars,
	} = params;

	try {
		// ── 1. Find or provision a server ──────────────────────────────────────
		await setStatus(platformDeploymentId, "provisioning");

		let availablePlatformServerId = await findAvailablePoolServer();

		if (!availablePlatformServerId) {
			const serverName = `platform-server-${nanoid(8)}`;
			availablePlatformServerId = await provisionNewServer(serverName);
		}

		// Get the Dokploy serverId from the pool entry
		const poolEntry = await db.query.platformServer.findFirst({
			where: eq(platformServer.platformServerId, availablePlatformServerId),
		});
		if (!poolEntry) throw new Error("Platform server pool entry not found");

		// Save server assignment
		await db
			.update(platformDeployment)
			.set({ platformServerId: availablePlatformServerId, updatedAt: new Date().toISOString() })
			.where(eq(platformDeployment.platformDeploymentId, platformDeploymentId));

		// ── 2. Ensure Dokploy project & environment exist ───────────────────────
		await setStatus(platformDeploymentId, "deploying");

		const platformUserRecord = await db.query.platformUser.findFirst({
			where: eq(platformUser.platformUserId, platformUserId),
		});
		if (!platformUserRecord) throw new Error("Platform user not found");

		const existingDeployment = await db.query.platformDeployment.findFirst({
			where: eq(platformDeployment.platformDeploymentId, platformDeploymentId),
		});

		const { projectId, environmentId } = await ensureDokployProject(
			platformUserRecord.organizationId,
			projectName,
			existingDeployment?.dokployProjectId,
		);

		await db
			.update(platformDeployment)
			.set({ dokployProjectId: projectId, dokployEnvironmentId: environmentId, updatedAt: new Date().toISOString() })
			.where(eq(platformDeployment.platformDeploymentId, platformDeploymentId));

		// ── 3. Create the application ───────────────────────────────────────────
		const application = await createApplication({
			name: appName,
			appName,
			environmentId,
			serverId: poolEntry.serverId,
		});

		await db
			.update(platformDeployment)
			.set({ dokployApplicationId: application.applicationId, updatedAt: new Date().toISOString() })
			.where(eq(platformDeployment.platformDeploymentId, platformDeploymentId));

		// ── 4. Configure source ─────────────────────────────────────────────────
		const envString = envVars
			? Object.entries(envVars)
					.map(([k, v]) => `${k}=${v}`)
					.join("\n")
			: undefined;

		if (sourceType === "git" && githubUrl) {
			await updateApplication(application.applicationId, {
				sourceType: "git",
				customGitUrl: githubUrl,
				customGitBranch: branch,
				buildType: "nixpacks",
				env: envString,
			});
		} else if (sourceType === "docker" && dockerImage) {
			await updateApplication(application.applicationId, {
				sourceType: "docker",
				dockerImage,
				env: envString,
			});
		}

		// ── 5. Assign a traefik.me domain ───────────────────────────────────────
		const domainHost = await generateTraefikMeDomain(appName, platformUserId, poolEntry.serverId);

		await createDomain({
			host: domainHost,
			https: false,
			port,
			path: "/",
			certificateType: "none",
			applicationId: application.applicationId,
		});

		// ── 6. Trigger deployment ───────────────────────────────────────────────
		await deployApplication({
			applicationId: application.applicationId,
			titleLog: `Platform deploy: ${appName}`,
			descriptionLog: `Deployed by platform user ${platformUserId}`,
		});

		// ── 7. Mark running ─────────────────────────────────────────────────────
		await setStatus(platformDeploymentId, "running", {
			appUrl: `http://${domainHost}`,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await setStatus(platformDeploymentId, "failed", { errorMessage: message }).catch(() => {});
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin: add an existing Dokploy server to the platform pool
// ──────────────────────────────────────────────────────────────────────────────
export async function addServerToPool(params: {
	serverId: string;
	maxApps?: number;
	region?: string;
}): Promise<typeof platformServer.$inferSelect> {
	const existing = await db.query.platformServer.findFirst({
		where: eq(platformServer.serverId, params.serverId),
	});
	if (existing) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Server is already in the platform pool",
		});
	}

	const [ps] = await db
		.insert(platformServer)
		.values({
			serverId: params.serverId,
			maxApps: params.maxApps ?? 20,
			region: params.region,
		})
		.returning();

	if (!ps) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add server to pool" });
	return ps;
}
