import { validateRequest } from "@dokploy/server/lib/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCircle2, AlertCircle, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import type { NextPageWithLayout } from "../../_app";

const SettingsSchema = z.object({
	doApiToken: z.string().optional(),
	sshKeyId: z.string().optional(),
	dropletSize: z.string().min(1, "Required"),
	dropletRegion: z.string().min(1, "Required"),
	maxAppsPerServer: z.number().int().min(1).max(100),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

const PlatformSettings: NextPageWithLayout = () => {
	const utils = api.useUtils();
	const [showToken, setShowToken] = useState(false);
	const [regionQuery, setRegionQuery] = useState<string | null>(null);

	const { data: settings, isLoading: loadingSettings } = api.platform.getSettings.useQuery();
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const { data: regions } = api.platform.listDoRegions.useQuery(undefined, {
		retry: false,
		enabled: !!settings?.doApiTokenConfigured,
	});
	const { data: sizes } = api.platform.listDoSizes.useQuery(
		{ region: regionQuery ?? "" },
		{ enabled: !!regionQuery && !!settings?.doApiTokenConfigured, retry: false },
	);

	const { mutateAsync: saveSettings, isPending: saving } =
		api.platform.saveSettings.useMutation();

	const form = useForm<SettingsForm>({
		resolver: zodResolver(SettingsSchema),
		defaultValues: {
			doApiToken: "",
			sshKeyId: "",
			dropletSize: "s-2vcpu-4gb",
			dropletRegion: "nyc3",
			maxAppsPerServer: 20,
		},
	});

	useEffect(() => {
		if (!settings) return;
		form.reset({
			doApiToken: "",
			sshKeyId: settings.sshKeyId ?? "",
			dropletSize: settings.dropletSize,
			dropletRegion: settings.dropletRegion,
			maxAppsPerServer: settings.maxAppsPerServer,
		});
		setRegionQuery(settings.dropletRegion);
	}, [settings]);

	const watchedRegion = form.watch("dropletRegion");
	useEffect(() => {
		setRegionQuery(watchedRegion || null);
	}, [watchedRegion]);

	const handleSubmit = async (data: SettingsForm) => {
		try {
			await saveSettings({
				doApiToken: data.doApiToken || undefined,
				sshKeyId: data.sshKeyId || undefined,
				dropletSize: data.dropletSize,
				dropletRegion: data.dropletRegion,
				maxAppsPerServer: data.maxAppsPerServer,
			});
			await utils.platform.getSettings.invalidate();
			await utils.platform.listDoRegions.invalidate();
			toast.success("Platform settings saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save settings");
		}
	};

	if (loadingSettings) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground p-6">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span className="text-sm">Loading…</span>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6 max-w-2xl">
			<div>
				<h1 className="text-2xl font-semibold">Platform Settings</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Configure the DigitalOcean account used to auto-provision servers for
					all platform users.
				</p>
			</div>

			<AlertBlock type="info">
				These credentials are shared across all platform deployments. When the
				server pool runs out of capacity, Dokploy will automatically spin up a
				new droplet using this token.
			</AlertBlock>

			<Form {...form}>
				<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
					{/* ── DigitalOcean API Token ── */}
					<div className="rounded-xl border bg-card p-5 space-y-4">
						<div className="flex items-center gap-2">
							<h2 className="font-medium">DigitalOcean API Token</h2>
							{settings?.doApiTokenConfigured ? (
								<span className="inline-flex items-center gap-1 text-xs text-green-600">
									<CheckCircle2 className="h-3.5 w-3.5" />
									Configured
								</span>
							) : (
								<span className="inline-flex items-center gap-1 text-xs text-amber-600">
									<AlertCircle className="h-3.5 w-3.5" />
									Not set
								</span>
							)}
						</div>

						{settings?.doApiTokenConfigured && (
							<p className="text-xs text-muted-foreground">
								Current token: <code className="bg-muted px-1 rounded">{settings.doApiToken}</code>
								&nbsp;— leave the field below empty to keep it.
							</p>
						)}

						<FormField
							control={form.control}
							name="doApiToken"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{settings?.doApiTokenConfigured ? "Replace token" : "API token"}
									</FormLabel>
									<FormControl>
										<div className="relative">
											<Input
												type={showToken ? "text" : "password"}
												placeholder={
													settings?.doApiTokenConfigured
														? "Enter new token to replace…"
														: "dop_v1_…"
												}
												{...field}
												className="pr-10"
											/>
											<button
												type="button"
												className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
												onClick={() => setShowToken((v) => !v)}
											>
												{showToken ? (
													<EyeOff className="h-4 w-4" />
												) : (
													<Eye className="h-4 w-4" />
												)}
											</button>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					{/* ── SSH Key ── */}
					<div className="rounded-xl border bg-card p-5 space-y-4">
						<h2 className="font-medium">SSH Key</h2>
						<p className="text-xs text-muted-foreground">
							This key will be installed on every auto-provisioned droplet.
							Create one first under{" "}
							<a href="/settings/ssh-keys" className="text-primary hover:underline">
								Settings → SSH Keys
							</a>
							.
						</p>
						<FormField
							control={form.control}
							name="sshKeyId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>SSH key</FormLabel>
									<FormControl>
										<select
											className="w-full h-9 rounded-md border bg-background px-3 text-sm"
											value={field.value}
											onChange={field.onChange}
										>
											<option value="">Select an SSH key…</option>
											{sshKeys?.map((k) => (
												<option key={k.sshKeyId} value={k.sshKeyId}>
													{k.name}
												</option>
											))}
										</select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					{/* ── Droplet config ── */}
					<div className="rounded-xl border bg-card p-5 space-y-4">
						<h2 className="font-medium">Droplet Configuration</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="dropletRegion"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Region</FormLabel>
										<FormControl>
											{regions && regions.length > 0 ? (
												<select
													className="w-full h-9 rounded-md border bg-background px-3 text-sm"
													value={field.value}
													onChange={field.onChange}
												>
													{regions.map((r) => (
														<option key={r.slug} value={r.slug}>
															{r.name} ({r.slug})
														</option>
													))}
												</select>
											) : (
												<Input
													placeholder="nyc3"
													{...field}
												/>
											)}
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="dropletSize"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Droplet size</FormLabel>
										<FormControl>
											{sizes && sizes.length > 0 ? (
												<select
													className="w-full h-9 rounded-md border bg-background px-3 text-sm"
													value={field.value}
													onChange={field.onChange}
												>
													{sizes.map((s) => (
														<option key={s.slug} value={s.slug}>
															{s.description} — ${s.price_monthly}/mo
														</option>
													))}
												</select>
											) : (
												<Input
													placeholder="s-2vcpu-4gb"
													{...field}
												/>
											)}
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="maxAppsPerServer"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Max apps per server</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={1}
											max={100}
											{...field}
											onChange={(e) =>
												field.onChange(Number(e.target.value))
											}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<Button type="submit" isLoading={saving}>
						<Save className="h-4 w-4 mr-2" />
						Save settings
					</Button>
				</form>
			</Form>
		</div>
	);
};

PlatformSettings.getLayout = (page: ReactElement) => (
	<DashboardLayout>{page}</DashboardLayout>
);

export default PlatformSettings;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/" } };
	}
	return { props: {} };
}
