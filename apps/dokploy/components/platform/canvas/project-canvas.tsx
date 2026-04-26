import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	useNodesState,
	useEdgesState,
	type Node,
	type Edge,
	BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo } from "react";
import { ServiceNode, type ServiceNodeData } from "./nodes/service-node";
import { DatabaseNode, type DatabaseNodeData } from "./nodes/database-node";
import { ComposeNode, type ComposeNodeData } from "./nodes/compose-node";

const NODE_WIDTH = 208;
const NODE_HEIGHT = 60;
const H_GAP = 60;
const V_GAP = 24;
const ROW_GAP = 80;

const nodeTypes = {
	service: ServiceNode,
	database: DatabaseNode,
	compose: ComposeNode,
};

type ServiceNodeType = Node<ServiceNodeData, "service">;
type DatabaseNodeType = Node<DatabaseNodeData, "database">;
type ComposeNodeType = Node<ComposeNodeData, "compose">;
type AnyNode = ServiceNodeType | DatabaseNodeType | ComposeNodeType;

interface EnvironmentData {
	applications: Array<{ applicationId: string; name: string; applicationStatus: string }>;
	postgres: Array<{ postgresId: string; name: string; applicationStatus: string }>;
	mysql: Array<{ mysqlId: string; name: string; applicationStatus: string }>;
	mariadb: Array<{ mariadbId: string; name: string; applicationStatus: string }>;
	mongo: Array<{ mongoId: string; name: string; applicationStatus: string }>;
	redis: Array<{ redisId: string; name: string; applicationStatus: string }>;
	libsql: Array<{ libsqlId: string; name: string; applicationStatus: string }>;
	compose: Array<{ composeId: string; name: string; composeStatus: string }>;
}

interface Props {
	environment: EnvironmentData;
	projectId: string;
	environmentId: string;
	onNodeClick: (nodeId: string, nodeType: string, serviceId: string) => void;
}

function buildLayout(env: EnvironmentData, storageKey: string): AnyNode[] {
	const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
	const savedPositions: Record<string, { x: number; y: number }> = saved ? JSON.parse(saved) : {};

	const nodes: AnyNode[] = [];
	let rowY = 40;

	const placeRow = <T extends AnyNode>(items: T[]): T[] => {
		if (items.length === 0) return [];
		const rowItems = items.map((node, i) => {
			const savedPos = savedPositions[node.id];
			return {
				...node,
				position: savedPos ?? { x: i * (NODE_WIDTH + H_GAP) + 40, y: rowY },
			};
		});
		if (!saved) {
			rowY += NODE_HEIGHT + ROW_GAP + V_GAP;
		}
		return rowItems;
	};

	const appNodes: ServiceNodeType[] = env.applications.map((app) => ({
		id: `app-${app.applicationId}`,
		type: "service" as const,
		position: { x: 0, y: 0 },
		data: {
			label: app.name,
			status: app.applicationStatus as ServiceNodeData["status"],
			serviceType: "application" as const,
			serviceId: app.applicationId,
		},
	}));

	const composeNodes: ComposeNodeType[] = env.compose.map((c) => ({
		id: `compose-${c.composeId}`,
		type: "compose" as const,
		position: { x: 0, y: 0 },
		data: {
			label: c.name,
			status: c.composeStatus as ComposeNodeData["status"],
			serviceType: "compose" as const,
			serviceId: c.composeId,
		},
	}));

	const dbNodes: DatabaseNodeType[] = [
		...env.postgres.map((d) => ({
			id: `postgres-${d.postgresId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "postgres" as const, serviceId: d.postgresId },
		})),
		...env.mysql.map((d) => ({
			id: `mysql-${d.mysqlId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "mysql" as const, serviceId: d.mysqlId },
		})),
		...env.mariadb.map((d) => ({
			id: `mariadb-${d.mariadbId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "mariadb" as const, serviceId: d.mariadbId },
		})),
		...env.mongo.map((d) => ({
			id: `mongo-${d.mongoId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "mongo" as const, serviceId: d.mongoId },
		})),
		...env.redis.map((d) => ({
			id: `redis-${d.redisId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "redis" as const, serviceId: d.redisId },
		})),
		...env.libsql.map((d) => ({
			id: `libsql-${d.libsqlId}`,
			type: "database" as const,
			position: { x: 0, y: 0 },
			data: { label: d.name, status: d.applicationStatus as DatabaseNodeData["status"], serviceType: "libsql" as const, serviceId: d.libsqlId },
		})),
	];

	nodes.push(...placeRow(appNodes));
	nodes.push(...placeRow(composeNodes));
	nodes.push(...placeRow(dbNodes));

	return nodes;
}

export const ProjectCanvas = ({ environment, projectId, environmentId, onNodeClick }: Props) => {
	const storageKey = `canvas-pos-${projectId}-${environmentId}`;

	const initialNodes = useMemo(() => buildLayout(environment, storageKey), [environment, storageKey]);

	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
	const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

	useEffect(() => {
		setNodes(buildLayout(environment, storageKey));
	}, [environment, storageKey]);

	const onNodeDragStop = useCallback(
		(_: React.MouseEvent, node: AnyNode) => {
			const saved = localStorage.getItem(storageKey);
			const positions = saved ? JSON.parse(saved) : {};
			positions[node.id] = node.position;
			localStorage.setItem(storageKey, JSON.stringify(positions));
		},
		[storageKey],
	);

	const handleNodeClick = useCallback(
		(_: React.MouseEvent, node: AnyNode) => {
			const data = node.data as ServiceNodeData | DatabaseNodeData | ComposeNodeData;
			onNodeClick(node.id, data.serviceType, data.serviceId);
		},
		[onNodeClick],
	);

	const isEmpty =
		!environment.applications.length &&
		!environment.compose.length &&
		!environment.postgres.length &&
		!environment.mysql.length &&
		!environment.mariadb.length &&
		!environment.mongo.length &&
		!environment.redis.length &&
		!environment.libsql.length;

	return (
		<div className="h-full w-full relative">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				nodeTypes={nodeTypes}
				onNodeClick={handleNodeClick}
				onNodeDragStop={onNodeDragStop}
				fitView
				fitViewOptions={{ padding: 0.3 }}
				minZoom={0.3}
				maxZoom={2}
				proOptions={{ hideAttribution: true }}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
				<Controls />
				<MiniMap className="!bg-card" />
			</ReactFlow>

			{isEmpty && (
				<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
					<p className="text-muted-foreground text-sm">No services in this environment yet.</p>
					<p className="text-muted-foreground text-xs mt-1">Add services from Dokploy admin to see them here.</p>
				</div>
			)}
		</div>
	);
};
