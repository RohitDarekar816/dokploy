import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import { useState, useCallback, useMemo } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/router";
import { ChevronDown } from "lucide-react";
import { PlatformNav } from "@/components/platform/platform-nav";
import { ProjectCanvas } from "@/components/platform/canvas/project-canvas";
import { ServiceDetailPanel } from "@/components/platform/service-detail-panel";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import type { NextPageWithLayout } from "../_app";
import type { DatabaseType } from "@/components/platform/canvas/nodes/database-node";

type ServiceType = "application" | DatabaseType | "compose";
type Status = "idle" | "running" | "done" | "error";

interface SelectedService {
	nodeId: string;
	serviceType: ServiceType;
	serviceId: string;
}

const ProjectCanvasPage: NextPageWithLayout = () => {
	const router = useRouter();
	const projectId = router.query.projectId as string;

	const { data: project, isLoading } = api.project.one.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);

	const environments = project?.environments ?? [];
	const defaultEnv = environments.find((e) => e.isDefault) ?? environments[0];
	const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
	const activeEnvId = selectedEnvId ?? defaultEnv?.environmentId ?? null;
	const activeEnv = environments.find((e) => e.environmentId === activeEnvId);

	const [selected, setSelected] = useState<SelectedService | null>(null);

	const handleNodeClick = useCallback((nodeId: string, serviceType: string, serviceId: string) => {
		setSelected((prev) =>
			prev?.nodeId === nodeId ? null : { nodeId, serviceType: serviceType as ServiceType, serviceId },
		);
	}, []);

	const closePanel = useCallback(() => setSelected(null), []);

	const selectedServiceName = useMemo(() => {
		if (!selected || !activeEnv) return "";
		const { serviceType, serviceId } = selected;
		switch (serviceType) {
			case "application": return activeEnv.applications.find((a) => a.applicationId === serviceId)?.name ?? "";
			case "compose": return activeEnv.compose.find((c) => c.composeId === serviceId)?.name ?? "";
			case "postgres": return activeEnv.postgres.find((d) => d.postgresId === serviceId)?.name ?? "";
			case "mysql": return activeEnv.mysql.find((d) => d.mysqlId === serviceId)?.name ?? "";
			case "mariadb": return activeEnv.mariadb.find((d) => d.mariadbId === serviceId)?.name ?? "";
			case "mongo": return activeEnv.mongo.find((d) => d.mongoId === serviceId)?.name ?? "";
			case "redis": return activeEnv.redis.find((d) => d.redisId === serviceId)?.name ?? "";
			case "libsql": return activeEnv.libsql.find((d) => d.libsqlId === serviceId)?.name ?? "";
			default: return "";
		}
	}, [selected, activeEnv]);

	const selectedStatus = useMemo((): Status => {
		if (!selected || !activeEnv) return "idle";
		const { serviceType, serviceId } = selected;
		switch (serviceType) {
			case "application": return (activeEnv.applications.find((a) => a.applicationId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "compose": return (activeEnv.compose.find((c) => c.composeId === serviceId)?.composeStatus as Status) ?? "idle";
			case "postgres": return (activeEnv.postgres.find((d) => d.postgresId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "mysql": return (activeEnv.mysql.find((d) => d.mysqlId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "mariadb": return (activeEnv.mariadb.find((d) => d.mariadbId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "mongo": return (activeEnv.mongo.find((d) => d.mongoId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "redis": return (activeEnv.redis.find((d) => d.redisId === serviceId)?.applicationStatus as Status) ?? "idle";
			case "libsql": return (activeEnv.libsql.find((d) => d.libsqlId === serviceId)?.applicationStatus as Status) ?? "idle";
			default: return "idle";
		}
	}, [selected, activeEnv]);

	if (isLoading) {
		return (
			<div className="flex h-screen flex-col">
				<PlatformNav />
				<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
					Loading…
				</div>
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex h-screen flex-col">
				<PlatformNav />
				<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
					Project not found.
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<PlatformNav projectName={project.name} projectId={projectId} />

			{/* Environment switcher bar */}
			<div className="flex items-center gap-3 border-b px-4 py-2 bg-background shrink-0">
				<span className="text-xs text-muted-foreground font-medium">Environment</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
							{activeEnv?.name ?? "Select environment"}
							<ChevronDown className="h-3 w-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{environments.map((env) => (
							<DropdownMenuItem
								key={env.environmentId}
								onSelect={() => {
									setSelectedEnvId(env.environmentId);
									setSelected(null);
								}}
								className={activeEnvId === env.environmentId ? "bg-accent" : ""}
							>
								{env.name}
								{env.isDefault && (
									<span className="ml-2 text-xs text-muted-foreground">(default)</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Canvas area */}
			<div className="flex flex-1 overflow-hidden relative">
				{activeEnv ? (
					<ProjectCanvas
						environment={activeEnv}
						projectId={projectId}
						environmentId={activeEnvId!}
						onNodeClick={handleNodeClick}
					/>
				) : (
					<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
						No environments found. Create one in the Dokploy admin.
					</div>
				)}

				{selected && (
					<ServiceDetailPanel
						open={!!selected}
						serviceId={selected.serviceId}
						serviceType={selected.serviceType}
						serviceName={selectedServiceName}
						status={selectedStatus}
						projectId={projectId}
						environmentId={activeEnvId!}
						onClose={closePanel}
					/>
				)}
			</div>
		</div>
	);
};

ProjectCanvasPage.getLayout = (page: ReactElement) => page;

export default ProjectCanvasPage;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/platform/login" } };
	}
	return { props: {} };
}
