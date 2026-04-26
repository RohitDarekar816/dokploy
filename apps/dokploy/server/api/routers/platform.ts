/**
 * Platform router — powers the customer-facing platform (separate from Dokploy admin).
 *
 * Authentication model:
 *   - `platform.register` is a PUBLIC procedure that creates the user directly in
 *     the DB (bypassing Better Auth's sign-up guard which blocks new users once an
 *     admin exists). After the server creates the account the client calls
 *     authClient.signIn.email() to obtain a session.
 *   - All other procedures are protectedProcedure and look up the platformUser record
 *     via ctx.user.id.
 */

import {
	addServerToPool,
	runPlatformDeployment,
	getDigitalOceanToken,
	doListRegions,
	doListSizes,
	deleteProject,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import {
	account,
	apiAddPlatformServer,
	apiPlatformDeploy,
	apiPlatformDeploymentId,
	apiPlatformRegister,
	apiSavePlatformSettings,
	member,
	organization,
	platformDeployment,
	platformServer,
	platformSettings,
	platformUser,
	user,
} from "@/server/db/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Helper: get platformUser record for the current session user
// ──────────────────────────────────────────────────────────────────────────────
async function getPlatformUser(authUserId: string) {
	const pu = await db.query.platformUser.findFirst({
		where: eq(platformUser.authUserId, authUserId),
	});
	if (!pu) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Platform account not found. Please complete registration.",
		});
	}
	return pu;
}

export const platformRouter = createTRPCRouter({
	// ── PUBLIC: Registration ──────────────────────────────────────────────────
	// Creates the auth user + org + platformUser entirely server-side so we
	// bypass Better Auth's sign-up hook that blocks new users after the first
	// admin is created. After this returns, the client calls signIn.email().
	register: publicProcedure
		.input(apiPlatformRegister)
		.mutation(async ({ input }) => {
			const normalizedEmail = input.email.trim().toLowerCase();

			// Check for duplicate email
			const existingUser = await db.query.user.findFirst({
				where: eq(user.email, normalizedEmail),
				columns: { id: true },
			});
			if (existingUser) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An account with this email already exists. Please sign in.",
				});
			}

			const now = new Date();
			const userId = nanoid();
			const orgId = nanoid();

			await db.transaction(async (tx) => {
				// 1. Create auth user
				await tx.insert(user).values({
					id: userId,
					email: normalizedEmail,
					firstName: input.name,
					emailVerified: false,
					updatedAt: now,
				} as typeof user.$inferInsert);

				// 2. Create credential account (hashed password)
				await tx.insert(account).values({
					id: nanoid(),
					userId,
					providerId: "credential",
					accountId: userId,
					password: bcrypt.hashSync(input.password, 10),
					createdAt: now,
					updatedAt: now,
				} as typeof account.$inferInsert);

				// 3. Create dedicated Dokploy organisation
				await tx.insert(organization).values({
					id: orgId,
					name: `${input.name}'s workspace`,
					slug: `ws-${nanoid(8)}`,
					createdAt: now,
					ownerId: userId,
				} as typeof organization.$inferInsert);

				// 4. Make user owner of their org
				await tx.insert(member).values({
					id: nanoid(),
					organizationId: orgId,
					userId,
					role: "owner",
					createdAt: now,
					isDefault: true,
				} as typeof member.$inferInsert);

				// 5. Create platform user record
				await tx.insert(platformUser).values({
					authUserId: userId,
					organizationId: orgId,
					email: normalizedEmail,
					name: input.name,
				});
			});

			return { success: true };
		}),

	// ── Get current platform user ─────────────────────────────────────────────
	me: protectedProcedure.query(async ({ ctx }) => {
		return getPlatformUser(ctx.user.id);
	}),

	// ── List user's deployments ───────────────────────────────────────────────
	listDeployments: protectedProcedure.query(async ({ ctx }) => {
		const pu = await getPlatformUser(ctx.user.id);
		return db.query.platformDeployment.findMany({
			where: eq(platformDeployment.platformUserId, pu.platformUserId),
			orderBy: desc(platformDeployment.createdAt),
		});
	}),

	// ── Get single deployment (for status polling) ────────────────────────────
	getDeployment: protectedProcedure
		.input(apiPlatformDeploymentId)
		.query(async ({ ctx, input }) => {
			const pu = await getPlatformUser(ctx.user.id);
			const dep = await db.query.platformDeployment.findFirst({
				where: and(
					eq(platformDeployment.platformDeploymentId, input.platformDeploymentId),
					eq(platformDeployment.platformUserId, pu.platformUserId),
				),
			});
			if (!dep)
				throw new TRPCError({ code: "NOT_FOUND", message: "Deployment not found" });
			return dep;
		}),

	// ── Deploy an application ─────────────────────────────────────────────────
	deploy: protectedProcedure
		.input(apiPlatformDeploy)
		.mutation(async ({ ctx, input }) => {
			const pu = await getPlatformUser(ctx.user.id);

			if (!input.githubUrl && !input.dockerImage) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Either a Git URL or a Docker image is required",
				});
			}

			const [dep] = await db
				.insert(platformDeployment)
				.values({
					platformUserId: pu.platformUserId,
					projectName: input.projectName,
					appName: input.appName,
					sourceType: input.sourceType,
					githubUrl: input.githubUrl,
					dockerImage: input.dockerImage,
					branch: input.branch,
					port: input.port,
					envVars: input.envVars ? JSON.stringify(input.envVars) : undefined,
					status: "queued",
				})
				.returning();

			if (!dep)
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create deployment record",
				});

			// Fire-and-forget
			runPlatformDeployment({
				platformDeploymentId: dep.platformDeploymentId,
				platformUserId: pu.platformUserId,
				projectName: input.projectName,
				appName: input.appName,
				sourceType: input.sourceType,
				githubUrl: input.githubUrl,
				dockerImage: input.dockerImage,
				branch: input.branch,
				port: input.port,
				envVars: input.envVars,
			}).catch((err) => {
				console.error("[platform] runPlatformDeployment error:", err);
			});

			return { platformDeploymentId: dep.platformDeploymentId };
		}),

	// ── Delete a deployment ───────────────────────────────────────────────────
	deleteDeployment: protectedProcedure
		.input(apiPlatformDeploymentId)
		.mutation(async ({ ctx, input }) => {
			const pu = await getPlatformUser(ctx.user.id);
			const dep = await db.query.platformDeployment.findFirst({
				where: and(
					eq(platformDeployment.platformDeploymentId, input.platformDeploymentId),
					eq(platformDeployment.platformUserId, pu.platformUserId),
				),
			});
			if (!dep) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Deployment not found" });
			}

			// Remove the Dokploy project (cascades to application, domains, etc.)
			if (dep.dokployProjectId) {
				await deleteProject(dep.dokployProjectId).catch(() => {});
			}

			await db
				.delete(platformDeployment)
				.where(eq(platformDeployment.platformDeploymentId, input.platformDeploymentId));
		}),

	// ── Admin: list platform server pool ─────────────────────────────────────
	listPoolServers: protectedProcedure.query(async () => {
		return db.query.platformServer.findMany({
			orderBy: desc(platformServer.createdAt),
		});
	}),

	// ── Admin: add existing Dokploy server to pool ────────────────────────────
	addPoolServer: protectedProcedure
		.input(apiAddPlatformServer)
		.mutation(async ({ input }) => {
			return addServerToPool({
				serverId: input.serverId,
				maxApps: input.maxApps,
				region: input.region,
			});
		}),

	// ── Admin: remove server from pool ────────────────────────────────────────
	removePoolServer: protectedProcedure
		.input(z.object({ platformServerId: z.string().min(1) }))
		.mutation(async ({ input }) => {
			await db
				.update(platformServer)
				.set({ isActive: false })
				.where(eq(platformServer.platformServerId, input.platformServerId));
		}),

	// ── Admin: get platform-wide settings ─────────────────────────────────────
	getSettings: protectedProcedure.query(async () => {
		const [settings] = await db.select().from(platformSettings).limit(1);
		if (!settings) {
			return {
				doApiToken: null,
				doApiTokenConfigured: false,
				sshKeyId: null,
				dropletSize: "s-2vcpu-4gb",
				dropletRegion: "nyc3",
				maxAppsPerServer: 20,
			};
		}
		return {
			doApiTokenConfigured: !!settings.doApiToken,
			doApiToken: settings.doApiToken
				? `••••••••${settings.doApiToken.slice(-4)}`
				: null,
			sshKeyId: settings.sshKeyId,
			dropletSize: settings.dropletSize,
			dropletRegion: settings.dropletRegion,
			maxAppsPerServer: settings.maxAppsPerServer,
		};
	}),

	// ── Admin: save platform-wide settings ────────────────────────────────────
	saveSettings: protectedProcedure
		.input(apiSavePlatformSettings)
		.mutation(async ({ input }) => {
			const [existing] = await db.select().from(platformSettings).limit(1);
			const now = new Date().toISOString();
			if (existing) {
				await db
					.update(platformSettings)
					.set({
						...(input.doApiToken !== undefined && input.doApiToken !== ""
							? { doApiToken: input.doApiToken }
							: {}),
						sshKeyId: input.sshKeyId ?? existing.sshKeyId,
						dropletSize: input.dropletSize,
						dropletRegion: input.dropletRegion,
						maxAppsPerServer: input.maxAppsPerServer,
						updatedAt: now,
					})
					.where(eq(platformSettings.platformSettingsId, existing.platformSettingsId));
			} else {
				await db.insert(platformSettings).values({
					doApiToken: input.doApiToken ?? null,
					sshKeyId: input.sshKeyId ?? null,
					dropletSize: input.dropletSize,
					dropletRegion: input.dropletRegion,
					maxAppsPerServer: input.maxAppsPerServer,
					updatedAt: now,
				});
			}
		}),

	// ── Admin: test DO connection and list regions ─────────────────────────────
	listDoRegions: protectedProcedure.query(async () => {
		const [settings] = await db.select().from(platformSettings).limit(1);
		if (!settings?.doApiToken) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "DigitalOcean API token not configured in platform settings",
			});
		}
		return doListRegions(settings.doApiToken);
	}),

	// ── Admin: list DO sizes for a region ─────────────────────────────────────
	listDoSizes: protectedProcedure
		.input(z.object({ region: z.string() }))
		.query(async ({ input }) => {
			const [settings] = await db.select().from(platformSettings).limit(1);
			if (!settings?.doApiToken) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DigitalOcean API token not configured in platform settings",
				});
			}
			const sizes = await doListSizes(settings.doApiToken);
			return sizes.filter((s) => s.regions.includes(input.region));
		}),
});
