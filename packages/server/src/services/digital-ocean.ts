import { db } from "@dokploy/server/db";
import { digitalocean } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

const DO_API = "https://api.digitalocean.com/v2";

async function doFetch<T>(
	token: string,
	path: string,
	options?: RequestInit,
): Promise<T> {
	const res = await fetch(`${DO_API}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options?.headers,
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `DigitalOcean API error (${res.status}): ${body}`,
		});
	}
	return res.json() as Promise<T>;
}

export const upsertDigitalOceanToken = async (
	organizationId: string,
	apiToken: string,
) => {
	const existing = await db.query.digitalocean.findFirst({
		where: eq(digitalocean.organizationId, organizationId),
	});
	if (existing) {
		await db
			.update(digitalocean)
			.set({ apiToken })
			.where(eq(digitalocean.organizationId, organizationId));
	} else {
		await db.insert(digitalocean).values({
			apiToken,
			organizationId,
			createdAt: new Date().toISOString(),
		});
	}
};

export const getDigitalOceanToken = async (organizationId: string) => {
	const record = await db.query.digitalocean.findFirst({
		where: eq(digitalocean.organizationId, organizationId),
	});
	return record?.apiToken ?? null;
};

export interface DORegion {
	slug: string;
	name: string;
	available: boolean;
}

export interface DOSize {
	slug: string;
	description: string;
	memory: number;
	vcpus: number;
	disk: number;
	price_monthly: number;
	available: boolean;
	regions: string[];
}

export type DropletStatus = "new" | "active" | "off" | "archive";

export const doListRegions = async (token: string): Promise<DORegion[]> => {
	const data = await doFetch<{ regions: DORegion[] }>(token, "/regions");
	return data.regions.filter((r) => r.available);
};

export const doListSizes = async (token: string): Promise<DOSize[]> => {
	const data = await doFetch<{ sizes: DOSize[] }>(token, "/sizes");
	return data.sizes.filter((s) => s.available);
};

export const doEnsureSSHKey = async (
	token: string,
	publicKey: string,
	name: string,
): Promise<number> => {
	const { ssh_keys } = await doFetch<{
		ssh_keys: { id: number; name: string; public_key: string }[];
	}>(token, "/account/keys");

	const existing = ssh_keys.find(
		(k) => k.public_key.trim() === publicKey.trim(),
	);
	if (existing) return existing.id;

	const { ssh_key } = await doFetch<{ ssh_key: { id: number } }>(
		token,
		"/account/keys",
		{
			method: "POST",
			body: JSON.stringify({ name, public_key: publicKey }),
		},
	);
	return ssh_key.id;
};

export const doCreateDroplet = async (
	token: string,
	opts: {
		name: string;
		region: string;
		size: string;
		sshKeyIds: number[];
	},
): Promise<number> => {
	const { droplet } = await doFetch<{ droplet: { id: number } }>(
		token,
		"/droplets",
		{
			method: "POST",
			body: JSON.stringify({
				name: opts.name,
				region: opts.region,
				size: opts.size,
				image: "ubuntu-24-04-x64",
				ssh_keys: opts.sshKeyIds,
				tags: ["dokploy"],
			}),
		},
	);
	return droplet.id;
};

export const doDeleteDroplet = async (
	token: string,
	dropletId: number,
): Promise<void> => {
	const res = await fetch(`${DO_API}/droplets/${dropletId}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok && res.status !== 404) {
		const body = await res.text();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `DigitalOcean API error (${res.status}): ${body}`,
		});
	}
};

export const doGetDroplet = async (
	token: string,
	dropletId: number,
): Promise<{ status: DropletStatus; ipAddress: string | null }> => {
	const { droplet } = await doFetch<{
		droplet: {
			status: DropletStatus;
			networks: { v4: { ip_address: string; type: string }[] };
		};
	}>(token, `/droplets/${dropletId}`);

	const publicNet = droplet.networks.v4.find((n) => n.type === "public");
	return {
		status: droplet.status,
		ipAddress: publicNet?.ip_address ?? null,
	};
};
