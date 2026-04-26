import {
	createServer,
	doCreateDroplet,
	doEnsureSSHKey,
	doGetDroplet,
	doListRegions,
	doListSizes,
	findSSHKeyById,
	getDigitalOceanToken,
	upsertDigitalOceanToken,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTRPCRouter,
	withPermission,
} from "@/server/api/trpc";
import {
	apiLaunchDroplet,
	apiSaveDigitalOceanToken,
} from "@/server/db/schema";

export const digitalOceanRouter = createTRPCRouter({
	saveToken: withPermission("server", "create")
		.input(apiSaveDigitalOceanToken)
		.mutation(async ({ input, ctx }) => {
			await upsertDigitalOceanToken(
				ctx.session.activeOrganizationId,
				input.apiToken,
			);
		}),

	getTokenStatus: withPermission("server", "read").query(async ({ ctx }) => {
		const token = await getDigitalOceanToken(ctx.session.activeOrganizationId);
		if (!token) return { configured: false, maskedToken: null };
		return { configured: true, maskedToken: `••••••••${token.slice(-4)}` };
	}),

	listRegions: withPermission("server", "read").query(async ({ ctx }) => {
		const token = await getDigitalOceanToken(ctx.session.activeOrganizationId);
		if (!token)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "DigitalOcean API token not configured",
			});
		return doListRegions(token);
	}),

	listSizes: withPermission("server", "read")
		.input(z.object({ region: z.string() }))
		.query(async ({ input, ctx }) => {
			const token = await getDigitalOceanToken(
				ctx.session.activeOrganizationId,
			);
			if (!token)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DigitalOcean API token not configured",
				});
			const sizes = await doListSizes(token);
			return sizes.filter((s) => s.regions.includes(input.region));
		}),

	launchDroplet: withPermission("server", "create")
		.input(apiLaunchDroplet)
		.mutation(async ({ input, ctx }) => {
			const token = await getDigitalOceanToken(
				ctx.session.activeOrganizationId,
			);
			if (!token)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DigitalOcean API token not configured",
				});
			const sshKey = await findSSHKeyById(input.sshKeyId);
			const doKeyId = await doEnsureSSHKey(
				token,
				sshKey.publicKey,
				sshKey.name,
			);
			const dropletId = await doCreateDroplet(token, {
				name: input.name,
				region: input.region,
				size: input.size,
				sshKeyIds: [doKeyId],
			});
			return { dropletId };
		}),

	getDropletStatus: withPermission("server", "read")
		.input(z.object({ dropletId: z.number() }))
		.query(async ({ input, ctx }) => {
			const token = await getDigitalOceanToken(
				ctx.session.activeOrganizationId,
			);
			if (!token)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DigitalOcean API token not configured",
				});
			return doGetDroplet(token, input.dropletId);
		}),

	createServerFromDroplet: withPermission("server", "create")
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
				ipAddress: z.string().min(1),
				sshKeyId: z.string().min(1),
				serverType: z.enum(["deploy", "build"]).default("deploy"),
				dropletId: z.number(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			return createServer(
				{
					name: input.name,
					description: input.description ?? "",
					ipAddress: input.ipAddress,
					port: 22,
					username: "root",
					sshKeyId: input.sshKeyId,
					serverType: input.serverType,
					providerServerId: String(input.dropletId),
				},
				ctx.session.activeOrganizationId,
			);
		}),
});
