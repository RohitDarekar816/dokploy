import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, Container, Loader2, ArrowLeft, Rocket } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { PlatformNav } from "@/components/platform/platform-nav";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import type { NextPageWithLayout } from "../_app";

const DeploySchema = z
	.object({
		projectName: z.string().min(1, "Project name is required"),
		appName: z
			.string()
			.min(2, "At least 2 characters")
			.max(40, "Max 40 characters")
			.regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
		sourceType: z.enum(["git", "docker"]),
		githubUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
		dockerImage: z.string().optional().or(z.literal("")),
		branch: z.string().default("main"),
		port: z.coerce.number().int().min(1).max(65535).default(3000),
		envVars: z
			.array(z.object({ key: z.string(), value: z.string() }))
			.default([]),
	})
	.refine(
		(d) => {
			if (d.sourceType === "git") return !!d.githubUrl;
			if (d.sourceType === "docker") return !!d.dockerImage;
			return false;
		},
		(d) => ({
			message:
				d.sourceType === "git"
					? "Git URL is required"
					: "Docker image is required",
			path: [d.sourceType === "git" ? "githubUrl" : "dockerImage"],
		}),
	);

type DeployForm = z.infer<typeof DeploySchema>;

const DeployPage: NextPageWithLayout = () => {
	const router = useRouter();
	const [sourceType, setSourceType] = useState<"git" | "docker">("git");

	const { mutateAsync: deploy, isPending } = api.platform.deploy.useMutation();

	const form = useForm<DeployForm>({
		resolver: zodResolver(DeploySchema),
		defaultValues: {
			projectName: "",
			appName: "",
			sourceType: "git",
			githubUrl: "",
			dockerImage: "",
			branch: "main",
			port: 3000,
			envVars: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "envVars",
	});

	const handleSourceChange = (type: "git" | "docker") => {
		setSourceType(type);
		form.setValue("sourceType", type);
	};

	const handleSubmit = async (data: DeployForm) => {
		const envVars =
			data.envVars.length > 0
				? Object.fromEntries(data.envVars.map(({ key, value }) => [key, value]))
				: undefined;

		try {
			const result = await deploy({
				projectName: data.projectName,
				appName: data.appName,
				sourceType: data.sourceType,
				githubUrl: data.githubUrl || undefined,
				dockerImage: data.dockerImage || undefined,
				branch: data.branch,
				port: data.port,
				envVars,
			});

			toast.success("Deployment queued! Redirecting to dashboard…");
			router.push(`/platform/dashboard`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Deployment failed");
		}
	};

	// Auto-generate app name from project name
	const handleProjectNameChange = (value: string) => {
		form.setValue("projectName", value);
		if (!form.getValues("appName")) {
			const slug = value
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
			form.setValue("appName", slug);
		}
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<PlatformNav />

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl px-6 py-8">
					<div className="mb-6">
						<Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
							<Link href="/platform/dashboard">
								<ArrowLeft className="h-4 w-4 mr-1" />
								Back to dashboard
							</Link>
						</Button>
						<h1 className="text-2xl font-semibold">New deployment</h1>
						<p className="text-muted-foreground text-sm mt-1">
							Deploy your app. A server will be auto-provisioned if needed.
						</p>
					</div>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
							{/* Basic info */}
							<div className="rounded-xl border bg-card p-5 space-y-4">
								<h2 className="font-medium text-sm">Project details</h2>

								<FormField
									control={form.control}
									name="projectName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Project name</FormLabel>
											<FormControl>
												<Input
													placeholder="My Awesome App"
													{...field}
													onChange={(e) => handleProjectNameChange(e.target.value)}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="appName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>App name</FormLabel>
											<FormControl>
												<Input
													placeholder="my-awesome-app"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Lowercase letters, numbers, and hyphens only. Used for the URL.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Source */}
							<div className="rounded-xl border bg-card p-5 space-y-4">
								<h2 className="font-medium text-sm">Source</h2>

								<Tabs
									value={sourceType}
									onValueChange={(v) => handleSourceChange(v as "git" | "docker")}
								>
									<TabsList className="mb-4">
										<TabsTrigger value="git" className="gap-2">
											<GitBranch className="h-4 w-4" />
											Git URL
										</TabsTrigger>
										<TabsTrigger value="docker" className="gap-2">
											<Container className="h-4 w-4" />
											Docker Image
										</TabsTrigger>
									</TabsList>

									<TabsContent value="git" className="space-y-4 mt-0">
										<FormField
											control={form.control}
											name="githubUrl"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Git repository URL</FormLabel>
													<FormControl>
														<Input
															placeholder="https://github.com/user/repo"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Supports GitHub, GitLab, Gitea — any public or private git URL.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="branch"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Branch</FormLabel>
													<FormControl>
														<Input placeholder="main" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</TabsContent>

									<TabsContent value="docker" className="mt-0">
										<FormField
											control={form.control}
											name="dockerImage"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Docker image</FormLabel>
													<FormControl>
														<Input
															placeholder="nginx:latest"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Any public Docker Hub or registry image.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</TabsContent>
								</Tabs>
							</div>

							{/* Port */}
							<div className="rounded-xl border bg-card p-5 space-y-4">
								<h2 className="font-medium text-sm">Network</h2>
								<FormField
									control={form.control}
									name="port"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Port</FormLabel>
											<FormControl>
												<Input type="number" placeholder="3000" {...field} />
											</FormControl>
											<FormDescription>
												The port your app listens on inside the container.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Environment variables */}
							<div className="rounded-xl border bg-card p-5 space-y-4">
								<div className="flex items-center justify-between">
									<h2 className="font-medium text-sm">Environment variables</h2>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => append({ key: "", value: "" })}
									>
										<Plus className="h-4 w-4 mr-1" />
										Add
									</Button>
								</div>

								{fields.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										No environment variables — click Add to set some.
									</p>
								) : (
									<div className="space-y-2">
										{fields.map((field, idx) => (
											<div key={field.id} className="flex gap-2">
												<Input
													placeholder="KEY"
													{...form.register(`envVars.${idx}.key`)}
													className="font-mono text-sm flex-1"
												/>
												<Input
													placeholder="value"
													{...form.register(`envVars.${idx}.value`)}
													className="font-mono text-sm flex-1"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => remove(idx)}
													className="shrink-0"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Submit */}
							<Button type="submit" className="w-full gap-2" disabled={isPending} isLoading={isPending}>
								<Rocket className="h-4 w-4" />
								Deploy now
							</Button>
						</form>
					</Form>
				</div>
			</div>
		</div>
	);
};

DeployPage.getLayout = (page: ReactElement) => page;

export default DeployPage;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/platform/login" } };
	}
	return { props: {} };
}
