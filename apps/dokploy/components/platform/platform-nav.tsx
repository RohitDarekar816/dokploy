import Link from "next/link";
import { useRouter } from "next/router";
import { LayoutDashboard, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { authClient } from "@/lib/auth-client";

interface Props {
	projectName?: string;
	projectId?: string;
}

export const PlatformNav = ({ projectName, projectId }: Props) => {
	const router = useRouter();
	const { data: user } = api.user.get.useQuery();

	const initials = user?.email?.slice(0, 2).toUpperCase() ?? "??";

	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/");
	};

	return (
		<header className="h-14 border-b bg-background flex items-center px-4 gap-4 shrink-0">
			<Link
				href="/platform"
				className="flex items-center gap-2 font-semibold text-sm"
			>
				<LayoutDashboard className="h-4 w-4" />
				Platform
			</Link>

			{projectName && (
				<>
					<span className="text-muted-foreground">/</span>
					<span className="text-sm font-medium">{projectName}</span>
				</>
			)}

			<div className="ml-auto flex items-center gap-2">
				<Button variant="ghost" size="sm" asChild>
					<Link href="/dashboard/projects">Dokploy Admin</Link>
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Avatar className="h-7 w-7">
								<AvatarFallback className="text-xs">{initials}</AvatarFallback>
							</Avatar>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
							{user?.email}
						</div>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link href="/dashboard/settings">
								<Settings className="h-4 w-4 mr-2" />
								Settings
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleSignOut} className="text-destructive">
							<LogOut className="h-4 w-4 mr-2" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
};
