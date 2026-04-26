import { Handle, Position } from "@xyflow/react";
import { Layers, AlertCircle, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ComposeStatus = "idle" | "running" | "done" | "error";

export interface ComposeNodeData {
	label: string;
	status: ComposeStatus;
	serviceType: "compose";
	serviceId: string;
}

const statusConfig: Record<ComposeStatus, { icon: React.ElementType; color: string; label: string }> = {
	idle: { icon: Clock, color: "text-muted-foreground", label: "Idle" },
	running: { icon: Loader2, color: "text-blue-500", label: "Running" },
	done: { icon: CheckCircle2, color: "text-green-500", label: "Active" },
	error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

export const ComposeNode = ({ data, selected }: { data: ComposeNodeData; selected?: boolean }) => {
	const { icon: StatusIcon, color, label } = statusConfig[data.status] ?? statusConfig.idle;
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
				<div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-500/10 shrink-0">
					<Layers className="h-4 w-4 text-violet-500" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium truncate">{data.label}</p>
					<div className={cn("flex items-center gap-1 text-xs", color)}>
						<StatusIcon className={cn("h-3 w-3", isAnimating && "animate-spin")} />
						<span>{label}</span>
					</div>
				</div>
			</div>

			<Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
		</div>
	);
};
