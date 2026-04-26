import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const digitalocean = pgTable("digitalocean", {
	digitaloceanId: text("digitaloceanId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	apiToken: text("apiToken").notNull(),
	createdAt: text("createdAt").notNull(),
	organizationId: text("organizationId")
		.notNull()
		.unique()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const digitaloceanRelations = relations(digitalocean, ({ one }) => ({
	organization: one(organization, {
		fields: [digitalocean.organizationId],
		references: [organization.id],
	}),
}));

export const apiSaveDigitalOceanToken = z.object({
	apiToken: z.string().min(1, "API token is required"),
});

export const apiLaunchDroplet = z.object({
	name: z.string().min(1, "Server name is required"),
	region: z.string().min(1, "Region is required"),
	size: z.string().min(1, "Size is required"),
	sshKeyId: z.string().min(1, "SSH key is required"),
	serverType: z.enum(["deploy", "build"]).default("deploy"),
});
