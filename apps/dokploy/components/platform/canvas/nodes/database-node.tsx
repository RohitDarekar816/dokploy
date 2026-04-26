import { Handle, Position } from "@xyflow/react";
import { Database, AlertCircle, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceStatus = "idle" | "running" | "done" | "error";

export type DatabaseType = "postgres" | "mysql" | "mariadb" | "mongo" | "redis" | "libsql";

export interface DatabaseNodeData {
	label: string;
	status: ServiceStatus;
	serviceType: DatabaseType;
	serviceId: string;
}

const dbColors: Record<DatabaseType, { bg: string; icon: string }> = {
	postgres: { bg: "bg-blue-500/10", icon: "text-blue-500" },
	mysql: { bg: "bg-orange-500/10", icon: "text-orange-500" },
	mariadb: { bg: "bg-orange-400/10", icon: "text-orange-400" },
	mongo: { bg: "bg-green-500/10", icon: "text-green-500" },
	redis: { bg: "bg-red-500/10", icon: "text-red-500" },
	libsql: { bg: "bg-purple-500/10", icon: "text-purple-500" },
};

const dbLabels: Record<DatabaseType, string> = {
	postgres: "PostgreSQL",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	libsql: "LibSQL",
};

const statusConfig: Record<ServiceStatus, { icon: React.ElementType; color: string; label: string }> = {
	idle: { icon: Clock, color: "text-muted-foreground", label: "Idle" },
	running: { icon: Loader2, color: "text-blue-500", label: "Running" },
	done: { icon: CheckCircle2, color: "text-green-500", label: "Active" },
	error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

export const DatabaseNode = ({ data, selected }: { data: DatabaseNodeData; selected?: boolean }) => {
	const { icon: StatusIcon, color, label } = statusConfig[data.status] ?? statusConfig.idle;
	const colors = dbColors[data.serviceType] ?? dbColors.postgres;
	const isAnimating = data.status === "running";

	return (
		<div
			className={cn(
				"rounded-lg border bg-card shadow-sm w-52 transition-all",
				selected && "ring-2 ring-primary ring-offset-1",
			)}
		>
			<Handle type="target" position={Position.Left} className="!bg-muted-foreground" />

			<div className="flex items-center gap-2 px-3 py-2.5">
				<div className={cn("flex h-8 w-8 items-center justify-center rounded-md shrink-0", colors.bg)}>
					<Database className={cn("h-4 w-4", colors.icon)} />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium truncate">{data.label}</p>
					<div className="flex items-center justify-between gap-1">
						<span className="text-xs text-muted-foreground">{dbLabels[data.serviceType]}</span>
						<div className={cn("flex items-center gap-1 text-xs", color)}>
							<StatusIcon className={cn("h-3 w-3", isAnimating && "animate-spin")} />
							<span>{label}</span>
						</div>
					</div>
				</div>
			</div>

			<Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
		</div>
	);
};
