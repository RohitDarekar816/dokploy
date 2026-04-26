/**
 * Admin page for managing the platform server pool.
 * Only accessible by Dokploy admins/owners — not platform users.
 * Located at /platform/admin/pool
 */
import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, Server, AlertCircle, Settings } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import type { NextPageWithLayout } from "../../_app";

const ServerPoolAdmin: NextPageWithLayout = () => {
	const utils = api.useUtils();
	const [serverId, setServerId] = useState("");
	const [maxApps, setMaxApps] = useState("20");
	const [region, setRegion] = useState("");

	const { data: poolServers, isLoading } = api.platform.listPoolServers.useQuery();
	const { data: allServers } = api.server.all.useQuery();
	const { mutateAsync: addServer, isPending: adding } = api.platform.addPoolServer.useMutation();
	const { mutateAsync: removeServer } = api.platform.removePoolServer.useMutation();

	const handleAdd = async () => {
		if (!serverId) {
			toast.error("Select a server");
			return;
		}
		try {
			await addServer({
				serverId,
				maxApps: Number(maxApps),
				region: region || undefined,
			});
			await utils.platform.listPoolServers.invalidate();
			toast.success("Server added to platform pool");
			setServerId("");
			setRegion("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to add server");
		}
	};

	const handleRemove = async (platformServerId: string) => {
		try {
			await removeServer({ platformServerId });
			await utils.platform.listPoolServers.invalidate();
			toast.success("Server removed from pool");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to remove server");
		}
	};

	const poolIds = new Set(poolServers?.map((ps) => ps.serverId));
	const eligibleServers = allServers?.filter(
		(s) => s.serverStatus === "active" && !poolIds.has(s.serverId),
	);

	return (
		<div className="space-y-6 p-6 max-w-3xl">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Platform Server Pool</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Servers in this pool are used for automatic platform deployments.
						When the pool is full, a new server is auto-provisioned via DigitalOcean.
					</p>
				</div>
				<Button variant="outline" size="sm" asChild>
					<Link href="/platform/admin/settings">
						<Settings className="h-4 w-4 mr-2" />
						DO Settings
					</Link>
				</Button>
			</div>

			{/* Add server to pool */}
			<div className="rounded-xl border bg-card p-5 space-y-4">
				<h2 className="font-medium">Add server to pool</h2>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div className="space-y-1.5">
						<Label>Server</Label>
						<select
							className="w-full h-9 rounded-md border bg-background px-3 text-sm"
							value={serverId}
							onChange={(e) => setServerId(e.target.value)}
						>
							<option value="">Select a server…</option>
							{eligibleServers?.map((s) => (
								<option key={s.serverId} value={s.serverId}>
									{s.name} ({s.ipAddress})
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1.5">
						<Label>Max apps</Label>
						<Input
							type="number"
							min={1}
							max={100}
							value={maxApps}
							onChange={(e) => setMaxApps(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Region label (optional)</Label>
						<Input
							placeholder="nyc3"
							value={region}
							onChange={(e) => setRegion(e.target.value)}
						/>
					</div>
				</div>
				<Button onClick={handleAdd} isLoading={adding} disabled={!serverId}>
					<Plus className="h-4 w-4 mr-2" />
					Add to pool
				</Button>
			</div>

			{/* Pool list */}
			<div className="rounded-xl border bg-card overflow-hidden">
				<div className="px-5 py-3 border-b bg-muted/30">
					<h2 className="font-medium text-sm">Pool servers</h2>
				</div>
				{isLoading ? (
					<div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>
				) : poolServers?.length === 0 ? (
					<div className="px-5 py-6 text-sm text-muted-foreground flex items-center gap-2">
						<AlertCircle className="h-4 w-4" />
						No servers in pool yet. Add one above.
					</div>
				) : (
					<div className="divide-y">
						{poolServers?.map((ps) => {
							const srv = allServers?.find((s) => s.serverId === ps.serverId);
							return (
								<div
									key={ps.platformServerId}
									className="px-5 py-3 flex items-center gap-4"
								>
									<Server className="h-4 w-4 text-muted-foreground shrink-0" />
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium">
											{srv?.name ?? ps.serverId}
										</p>
										<p className="text-xs text-muted-foreground">
											{srv?.ipAddress} · max {ps.maxApps} apps
											{ps.region && ` · ${ps.region}`}
										</p>
									</div>
									<Badge variant={ps.isActive ? "default" : "secondary"}>
										{ps.isActive ? "Active" : "Inactive"}
									</Badge>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground hover:text-destructive"
										onClick={() => handleRemove(ps.platformServerId)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};

ServerPoolAdmin.getLayout = (page: ReactElement) => (
	<DashboardLayout>{page}</DashboardLayout>
);

export default ServerPoolAdmin;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/" } };
	}
	return { props: {} };
}
