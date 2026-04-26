import { nanoid } from "nanoid";
import {
	boolean,
	integer,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

// ──────────────────────────────────────────────────────────────────────────────
// Server pool: Dokploy-managed servers dedicated to the platform
// ──────────────────────────────────────────────────────────────────────────────
export const platformServer = pgTable("platform_server", {
	platformServerId: text("platform_server_id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	serverId: text("server_id")
		.notNull()
		.references(() => server.serverId, { onDelete: "cascade" }),
	maxApps: integer("max_apps").notNull().default(20),
	region: text("region"),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const platformServerRelations = relations(platformServer, ({ one, many }) => ({
	server: one(server, {
		fields: [platformServer.serverId],
		references: [server.serverId],
	}),
	deployments: many(platformDeployment),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Platform users: each user gets an isolated Dokploy organisation
// ──────────────────────────────────────────────────────────────────────────────
export const platformUser = pgTable("platform_user", {
	platformUserId: text("platform_user_id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	authUserId: text("auth_user_id").notNull().unique(),
	organizationId: text("organization_id")
		.notNull()
		.unique()
		.references(() => organization.id, { onDelete: "cascade" }),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	email: text("email").notNull(),
	name: text("name"),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const platformUserRelations = relations(platformUser, ({ many }) => ({
	deployments: many(platformDeployment),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Platform deployments: one record per app a platform user has deployed
// ──────────────────────────────────────────────────────────────────────────────
export type PlatformDeploymentStatus =
	| "queued"
	| "provisioning"
	| "deploying"
	| "running"
	| "failed"
	| "stopped";

export const platformDeployment = pgTable("platform_deployment", {
	platformDeploymentId: text("platform_deployment_id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	platformUserId: text("platform_user_id")
		.notNull()
		.references(() => platformUser.platformUserId, { onDelete: "cascade" }),
	platformServerId: text("platform_server_id").references(
		() => platformServer.platformServerId,
	),
	// Dokploy entity IDs created for this deployment
	dokployProjectId: text("dokploy_project_id"),
	dokployEnvironmentId: text("dokploy_environment_id"),
	dokployApplicationId: text("dokploy_application_id"),
	// User-supplied config
	projectName: text("project_name").notNull(),
	appName: text("app_name").notNull().unique(),
	sourceType: text("source_type").notNull().default("git"),
	githubUrl: text("github_url"),
	dockerImage: text("docker_image"),
	branch: text("branch").notNull().default("main"),
	port: integer("port").notNull().default(3000),
	envVars: text("env_vars"),
	// Runtime state
	status: text("status").notNull().default("queued"),
	appUrl: text("app_url"),
	errorMessage: text("error_message"),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const platformDeploymentRelations = relations(
	platformDeployment,
	({ one }) => ({
		platformUser: one(platformUser, {
			fields: [platformDeployment.platformUserId],
			references: [platformUser.platformUserId],
		}),
		platformServer: one(platformServer, {
			fields: [platformDeployment.platformServerId],
			references: [platformServer.platformServerId],
		}),
	}),
);

// ──────────────────────────────────────────────────────────────────────────────
// Usage records for pay-as-you-go billing
// ──────────────────────────────────────────────────────────────────────────────
export const platformUsageRecord = pgTable("platform_usage_record", {
	usageRecordId: text("usage_record_id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	platformUserId: text("platform_user_id")
		.notNull()
		.references(() => platformUser.platformUserId, { onDelete: "cascade" }),
	platformDeploymentId: text("platform_deployment_id").references(
		() => platformDeployment.platformDeploymentId,
	),
	stripeUsageRecordId: text("stripe_usage_record_id"),
	// Minutes of uptime billed
	quantity: integer("quantity").notNull().default(0),
	reportedAt: text("reported_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

// ──────────────────────────────────────────────────────────────────────────────
// Platform settings: singleton row holding admin-configured infra credentials
// ──────────────────────────────────────────────────────────────────────────────
export const platformSettings = pgTable("platform_settings", {
	platformSettingsId: text("platform_settings_id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	doApiToken: text("do_api_token"),
	sshKeyId: text("ssh_key_id"),
	dropletSize: text("droplet_size").notNull().default("s-2vcpu-4gb"),
	dropletRegion: text("droplet_region").notNull().default("nyc3"),
	maxAppsPerServer: integer("max_apps_per_server").notNull().default(20),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

// ──────────────────────────────────────────────────────────────────────────────
// Zod schemas for API input validation
// ──────────────────────────────────────────────────────────────────────────────
export const apiPlatformRegister = z.object({
	email: z.string().email("Invalid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	name: z.string().min(1, "Name is required"),
});

export const apiPlatformDeploy = z.object({
	projectName: z.string().min(1, "Project name is required"),
	appName: z
		.string()
		.min(2, "App name must be at least 2 characters")
		.max(40, "App name must be at most 40 characters")
		.regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
	sourceType: z.enum(["git", "docker"]).default("git"),
	githubUrl: z.string().url("Invalid URL").optional(),
	dockerImage: z.string().optional(),
	branch: z.string().default("main"),
	port: z.number().int().min(1).max(65535).default(3000),
	envVars: z.record(z.string(), z.string()).optional(),
});

export const apiPlatformDeploymentId = z.object({
	platformDeploymentId: z.string().min(1),
});

export const apiAddPlatformServer = z.object({
	serverId: z.string().min(1, "Server ID is required"),
	maxApps: z.number().int().min(1).max(100).default(20),
	region: z.string().optional(),
});

export const apiSavePlatformSettings = z.object({
	doApiToken: z.string().optional(),
	sshKeyId: z.string().optional(),
	dropletSize: z.string().default("s-2vcpu-4gb"),
	dropletRegion: z.string().default("nyc3"),
	maxAppsPerServer: z.number().int().min(1).max(100).default(20),
});
