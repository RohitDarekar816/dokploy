import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { useState } from "react";
import {
	Plus,
	Loader2,
	Globe,
	Clock,
	CheckCircle2,
	AlertCircle,
	XCircle,
	Rocket,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PlatformNav } from "@/components/platform/platform-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/utils/api";
import { cn } from "@/lib/utils";
import type { NextPageWithLayout } from "../_app";

type DeploymentStatus = "queued" | "provisioning" | "deploying" | "running" | "failed" | "stopped";

const statusConfig: Record<DeploymentStatus, { icon: React.ElementType; label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
	queued: { icon: Clock, label: "Queued", variant: "secondary", color: "text-muted-foreground" },
	provisioning: { icon: Loader2, label: "Provisioning server…", variant: "default", color: "text-blue-500" },
	deploying: { icon: Loader2, label: "Deploying…", variant: "default", color: "text-blue-500" },
	running: { icon: CheckCircle2, label: "Running", variant: "default", color: "text-green-500" },
	failed: { icon: AlertCircle, label: "Failed", variant: "destructive", color: "text-destructive" },
	stopped: { icon: XCircle, label: "Stopped", variant: "outline", color: "text-muted-foreground" },
};

const PlatformDashboard: NextPageWithLayout = () => {
	const utils = api.useUtils();
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const { data: deployments, isLoading, refetch, isRefetching } = api.platform.listDeployments.useQuery(
		undefined,
		{ refetchInterval: (query) => {
			const data = query.state.data;
			const hasInProgress = Array.isArray(data) && data.some((d) =>
				["queued", "provisioning", "deploying"].includes(d.status),
			);
			return hasInProgress ? 5000 : false;
		}},
	);

	const hasInProgress = deployments?.some((d) =>
		["queued", "provisioning", "deploying"].includes(d.status),
	);

	const { mutateAsync: deleteDeployment } = api.platform.deleteDeployment.useMutation();

	const handleDelete = async (platformDeploymentId: string) => {
		setDeletingId(platformDeploymentId);
		try {
			await deleteDeployment({ platformDeploymentId });
			await utils.platform.listDeployments.invalidate();
			toast.success("Deployment deleted");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete deployment");
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<PlatformNav />

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-5xl px-6 py-8">
					<div className="flex items-center justify-between mb-6">
						<div>
							<h1 className="text-2xl font-semibold">Deployments</h1>
							<p className="text-muted-foreground text-sm mt-0.5">
								All your deployed applications
							</p>
						</div>
						<div className="flex items-center gap-2">
							{hasInProgress && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => refetch()}
									disabled={isRefetching}
								>
									<RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
									Refresh
								</Button>
							)}
							<Button asChild size="sm">
								<Link href="/platform/deploy">
									<Plus className="h-4 w-4 mr-2" />
									New deployment
								</Link>
							</Button>
						</div>
					</div>

					{isLoading ? (
						<div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span className="text-sm">Loading deployments…</span>
						</div>
					) : deployments?.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-24 gap-4 border rounded-xl bg-muted/20">
							<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
								<Rocket className="h-7 w-7 text-primary" />
							</div>
							<div className="text-center space-y-1">
								<p className="font-medium">No deployments yet</p>
								<p className="text-sm text-muted-foreground">
									Deploy your first application in seconds
								</p>
							</div>
							<Button asChild>
								<Link href="/platform/deploy">
									<Plus className="h-4 w-4 mr-2" />
									New deployment
								</Link>
							</Button>
						</div>
					) : (
						<div className="space-y-3">
							{deployments?.map((dep) => {
								const status = dep.status as DeploymentStatus;
								const cfg = statusConfig[status] ?? statusConfig.queued;
								const Icon = cfg.icon;
								const isInProgress = ["queued", "provisioning", "deploying"].includes(status);

								return (
									<div
										key={dep.platformDeploymentId}
										className="rounded-xl border bg-card p-4 flex items-center gap-4"
									>
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
											<Globe className="h-5 w-5 text-primary" />
										</div>

										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<p className="font-medium text-sm">{dep.appName}</p>
												<Badge variant={cfg.variant} className="gap-1 text-xs">
													<Icon className={cn("h-3 w-3", isInProgress && "animate-spin")} />
													{cfg.label}
												</Badge>
											</div>
											<p className="text-xs text-muted-foreground mt-0.5">
												{dep.projectName}
												{dep.githubUrl && (
													<span className="ml-2 font-mono">{dep.githubUrl.replace("https://", "")}</span>
												)}
												{dep.dockerImage && (
													<span className="ml-2 font-mono">{dep.dockerImage}</span>
												)}
											</p>
											{dep.errorMessage && (
												<p className="text-xs text-destructive mt-1 truncate max-w-lg">
													{dep.errorMessage}
												</p>
											)}
										</div>

										<div className="flex items-center gap-3 shrink-0">
											{dep.appUrl && (
												<a
													href={dep.appUrl}
													target="_blank"
													rel="noreferrer"
													className="text-xs text-primary hover:underline flex items-center gap-1"
												>
													<Globe className="h-3 w-3" />
													View app
												</a>
											)}
											<span className="text-xs text-muted-foreground">
												{new Date(dep.createdAt).toLocaleDateString()}
											</span>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 text-muted-foreground hover:text-destructive"
														disabled={deletingId === dep.platformDeploymentId}
													>
														{deletingId === dep.platformDeploymentId ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															<Trash2 className="h-3.5 w-3.5" />
														)}
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>Delete deployment?</AlertDialogTitle>
														<AlertDialogDescription>
															This will permanently delete{" "}
															<strong>{dep.appName}</strong> and remove all
															associated resources from the server. This action
															cannot be undone.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
															onClick={() => handleDelete(dep.platformDeploymentId)}
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

PlatformDashboard.getLayout = (page: ReactElement) => page;

export default PlatformDashboard;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/platform/login" } };
	}
	return { props: {} };
}
