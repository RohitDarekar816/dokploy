import { X, Globe, Database, Layers, ExternalLink, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { DatabaseType } from "./canvas/nodes/database-node";

type ServiceType = "application" | DatabaseType | "compose";
type Status = "idle" | "running" | "done" | "error";

interface Props {
	open: boolean;
	serviceId: string;
	serviceType: ServiceType;
	serviceName: string;
	status: Status;
	projectId: string;
	environmentId: string;
	onClose: () => void;
}

const typeLabel: Record<ServiceType, string> = {
	application: "Application",
	postgres: "PostgreSQL",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	libsql: "LibSQL",
	compose: "Docker Compose",
};

const statusConfig: Record<Status, { icon: React.ElementType; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
	idle: { icon: Clock, label: "Idle", variant: "secondary" },
	running: { icon: Loader2, label: "Running", variant: "default" },
	done: { icon: CheckCircle2, label: "Active", variant: "default" },
	error: { icon: AlertCircle, label: "Error", variant: "destructive" },
};

const TypeIcon: Record<ServiceType, React.ElementType> = {
	application: Globe,
	postgres: Database,
	mysql: Database,
	mariadb: Database,
	mongo: Database,
	redis: Database,
	libsql: Database,
	compose: Layers,
};

function getAdminUrl(serviceType: ServiceType, serviceId: string, projectId: string, environmentId: string) {
	const base = `/dashboard/project/${projectId}/environment/${environmentId}`;
	switch (serviceType) {
		case "application": return `${base}/application/${serviceId}/general`;
		case "compose": return `${base}/compose/${serviceId}/general`;
		case "postgres": return `${base}/postgres/${serviceId}/general`;
		case "mysql": return `${base}/mysql/${serviceId}/general`;
		case "mariadb": return `${base}/mariadb/${serviceId}/general`;
		case "mongo": return `${base}/mongo/${serviceId}/general`;
		case "redis": return `${base}/redis/${serviceId}/general`;
		case "libsql": return `${base}/libsql/${serviceId}/general`;
	}
}

export const ServiceDetailPanel = ({
	open,
	serviceId,
	serviceType,
	serviceName,
	status,
	projectId,
	environmentId,
	onClose,
}: Props) => {
	const Icon = TypeIcon[serviceType] ?? Globe;
	const { icon: StatusIcon, label: statusLabel, variant } = statusConfig[status] ?? statusConfig.idle;
	const isAnimating = status === "running";
	const adminUrl = getAdminUrl(serviceType, serviceId, projectId, environmentId);

	return (
		<div
			className={cn(
				"absolute right-0 top-0 h-full w-80 border-l bg-card shadow-xl transition-transform duration-200 ease-in-out z-10 flex flex-col",
				open ? "translate-x-0" : "translate-x-full",
			)}
		>
			<div className="flex items-center justify-between px-4 py-3 border-b">
				<div className="flex items-center gap-2 min-w-0">
					<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
					<span className="font-medium text-sm truncate">{serviceName}</span>
				</div>
				<Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-7 w-7">
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<div className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Type</span>
						<span className="font-medium">{typeLabel[serviceType]}</span>
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Status</span>
						<Badge variant={variant} className="gap-1">
							<StatusIcon className={cn("h-3 w-3", isAnimating && "animate-spin")} />
							{statusLabel}
						</Badge>
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">ID</span>
						<span className="font-mono text-xs text-muted-foreground truncate max-w-36">{serviceId}</span>
					</div>
				</div>

				<Separator />

				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
					<Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
						<Link href={adminUrl} target="_blank">
							<ExternalLink className="h-4 w-4" />
							Open in Admin
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
};
