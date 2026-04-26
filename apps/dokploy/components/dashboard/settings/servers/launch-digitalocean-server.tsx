import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckCircle2, Cloud, ExternalLink, Loader2, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

type Step = "token" | "configure" | "launching" | "done";

const TokenSchema = z.object({
	apiToken: z.string().min(1, "API token is required"),
});

const ConfigSchema = z.object({
	name: z.string().min(1, "Server name is required"),
	region: z.string().min(1, "Region is required"),
	size: z.string().min(1, "Size is required"),
	sshKeyId: z.string().min(1, "SSH key is required"),
	serverType: z.enum(["deploy", "build"]).default("deploy"),
});

type TokenForm = z.infer<typeof TokenSchema>;
type ConfigForm = z.infer<typeof ConfigSchema>;

interface Props {
	onServerCreated: () => void;
}

export const LaunchDigitalOceanServer = ({ onServerCreated }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [step, setStep] = useState<Step>("token");
	const [dropletId, setDropletId] = useState<number | null>(null);
	const [serverIp, setServerIp] = useState<string | null>(null);
	const [configData, setConfigData] = useState<ConfigForm | null>(null);
	const [pollError, setPollError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const { data: tokenStatus, refetch: refetchToken } =
		api.digitalOcean.getTokenStatus.useQuery(undefined, { enabled: isOpen });

	// Fetch regions whenever dialog is open — token check happens server-side
	const {
		data: regions,
		isLoading: regionsLoading,
		error: regionsError,
	} = api.digitalOcean.listRegions.useQuery(undefined, {
		enabled: isOpen && step === "configure",
		retry: false,
	});

	const { data: sshKeys } = api.sshKey.all.useQuery(undefined, {
		enabled: isOpen,
	});

	const [selectedRegion, setSelectedRegion] = useState("");
	const { data: sizes, isLoading: sizesLoading } =
		api.digitalOcean.listSizes.useQuery(
			{ region: selectedRegion },
			{ enabled: !!selectedRegion && step === "configure", retry: false },
		);

	const { mutateAsync: saveToken, isPending: savingToken } =
		api.digitalOcean.saveToken.useMutation();
	const { mutateAsync: launchDroplet, isPending: launching } =
		api.digitalOcean.launchDroplet.useMutation();
	const { mutateAsync: createServer, isPending: creatingServer } =
		api.digitalOcean.createServerFromDroplet.useMutation();

	const { refetch: pollDroplet } = api.digitalOcean.getDropletStatus.useQuery(
		{ dropletId: dropletId ?? 0 },
		{ enabled: false },
	);

	const tokenForm = useForm<TokenForm>({
		defaultValues: { apiToken: "" },
		resolver: zodResolver(TokenSchema),
	});

	const configForm = useForm<ConfigForm>({
		defaultValues: {
			name: "",
			region: "",
			size: "",
			sshKeyId: "",
			serverType: "deploy",
		},
		resolver: zodResolver(ConfigSchema),
	});

	// Reset everything on close
	useEffect(() => {
		if (!isOpen) {
			setStep("token");
			setDropletId(null);
			setServerIp(null);
			setConfigData(null);
			setPollError(null);
			setSelectedRegion("");
			if (pollRef.current) clearTimeout(pollRef.current);
			tokenForm.reset();
			configForm.reset();
		}
	}, [isOpen]);

	// Skip token step if token already saved
	useEffect(() => {
		if (isOpen && tokenStatus?.configured) {
			setStep("configure");
		}
	}, [isOpen, tokenStatus?.configured]);

	// Poll droplet until active
	useEffect(() => {
		if (step !== "launching" || !dropletId) return;

		const poll = async () => {
			try {
				const result = await pollDroplet();
				if (result.data?.status === "active" && result.data.ipAddress) {
					setServerIp(result.data.ipAddress);
					if (pollRef.current) clearTimeout(pollRef.current);
					await createServer({
						name: configData!.name,
						ipAddress: result.data.ipAddress,
						sshKeyId: configData!.sshKeyId,
						serverType: configData!.serverType,
						dropletId: dropletId,
					});
					await utils.server.all.invalidate();
					setStep("done");
					onServerCreated();
				} else if (
					result.data?.status === "off" ||
					result.data?.status === "archive"
				) {
					setPollError("Droplet failed to start. Please try again.");
				} else {
					pollRef.current = setTimeout(poll, 6000);
				}
			} catch (err) {
				setPollError(
					err instanceof Error ? err.message : "Failed to poll droplet status",
				);
			}
		};

		pollRef.current = setTimeout(poll, 6000);
		return () => {
			if (pollRef.current) clearTimeout(pollRef.current);
		};
	}, [step, dropletId]);

	const handleSaveToken = async (data: TokenForm) => {
		try {
			await saveToken({ apiToken: data.apiToken });
			await refetchToken();
			setStep("configure");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to save token",
			);
		}
	};

	const handleLaunch = async (data: ConfigForm) => {
		try {
			setConfigData(data);
			const { dropletId: id } = await launchDroplet({
				name: data.name,
				region: data.region,
				size: data.size,
				sshKeyId: data.sshKeyId,
				serverType: data.serverType,
			});
			setDropletId(id);
			setStep("launching");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to launch droplet",
			);
		}
	};

	const formatSize = (s: {
		slug: string;
		vcpus: number;
		memory: number;
		disk: number;
		price_monthly: number;
	}) =>
		`${s.vcpus} vCPU · ${s.memory >= 1024 ? `${s.memory / 1024} GB` : `${s.memory} MB`} RAM · ${s.disk} GB SSD · $${s.price_monthly}/mo`;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer space-x-2">
					<Cloud className="h-4 w-4" />
					<span>Launch on DigitalOcean</span>
				</Button>
			</DialogTrigger>

			<DialogContent className="sm:max-w-lg">
				{/* ── Step: Token ─────────────────────────────────── */}
				{step === "token" && (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Cloud className="h-5 w-5 text-blue-500" />
								Connect DigitalOcean
							</DialogTitle>
							<DialogDescription>
								Enter your DigitalOcean API token to enable one-click server
								provisioning. Your token is stored securely per organisation.
							</DialogDescription>
						</DialogHeader>
						<AlertBlock type="info">
							Generate a token with <strong>Read &amp; Write</strong> scope at{" "}
							<a
								href="https://cloud.digitalocean.com/account/api/tokens"
								target="_blank"
								rel="noreferrer"
								className="underline inline-flex items-center gap-1"
							>
								cloud.digitalocean.com
								<ExternalLink className="h-3 w-3" />
							</a>
						</AlertBlock>
						<Form {...tokenForm}>
							<form
								id="do-token-form"
								onSubmit={tokenForm.handleSubmit(handleSaveToken)}
								className="space-y-4"
							>
								<FormField
									control={tokenForm.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Token</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="dop_v1_..."
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</form>
						</Form>
						<DialogFooter>
							<Button form="do-token-form" type="submit" isLoading={savingToken}>
								Save &amp; Continue
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Step: Configure ──────────────────────────────── */}
				{step === "configure" && (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Rocket className="h-5 w-5 text-blue-500" />
								Configure Droplet
							</DialogTitle>
							<DialogDescription>
								Choose your region, size, and SSH key. Ubuntu 24.04 will be used
								as the base image.
								{tokenStatus?.maskedToken && (
									<span className="ml-1 text-muted-foreground text-xs">
										(Token: {tokenStatus.maskedToken})
									</span>
								)}
							</DialogDescription>
						</DialogHeader>

						{regionsError && (
							<AlertBlock type="error">
								{regionsError.message}
							</AlertBlock>
						)}

						<Form {...configForm}>
							<form
								id="do-config-form"
								onSubmit={configForm.handleSubmit(handleLaunch)}
								className="space-y-4"
							>
								<FormField
									control={configForm.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Server Name</FormLabel>
											<FormControl>
												<Input placeholder="my-dokploy-server" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={configForm.control}
										name="region"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Region</FormLabel>
												<Select
													onValueChange={(v) => {
														field.onChange(v);
														setSelectedRegion(v);
														configForm.setValue("size", "");
													}}
													value={field.value || undefined}
												>
													<SelectTrigger>
														{regionsLoading ? (
															<span className="flex items-center gap-2 text-muted-foreground">
																<Loader2 className="h-3 w-3 animate-spin" />
																Loading…
															</span>
														) : (
															<SelectValue placeholder="Select region" />
														)}
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{regions?.map((r) => (
																<SelectItem key={r.slug} value={r.slug}>
																	{r.name}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={configForm.control}
										name="size"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Size</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value || undefined}
													disabled={!selectedRegion}
												>
													<SelectTrigger>
														{sizesLoading ? (
															<span className="flex items-center gap-2 text-muted-foreground">
																<Loader2 className="h-3 w-3 animate-spin" />
																Loading…
															</span>
														) : (
															<SelectValue
																placeholder={
																	selectedRegion
																		? "Select size"
																		: "Pick region first"
																}
															/>
														)}
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{sizes?.map((s) => (
																<SelectItem key={s.slug} value={s.slug}>
																	{formatSize(s)}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<FormField
									control={configForm.control}
									name="sshKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>SSH Key</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || undefined}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select SSH key" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{sshKeys?.map((k) => (
															<SelectItem key={k.sshKeyId} value={k.sshKeyId}>
																{k.name}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={configForm.control}
									name="serverType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Server Type</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectItem value="deploy">Deploy Server</SelectItem>
														<SelectItem value="build">Build Server</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</form>
						</Form>
						<DialogFooter className="gap-2">
							<Button
								variant="ghost"
								onClick={() => setStep("token")}
								type="button"
							>
								Change Token
							</Button>
							<Button
								form="do-config-form"
								type="submit"
								isLoading={launching || creatingServer}
							>
								Launch Droplet
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Step: Launching ──────────────────────────────── */}
				{step === "launching" && (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Loader2 className="h-5 w-5 animate-spin text-blue-500" />
								Provisioning Droplet
							</DialogTitle>
							<DialogDescription>
								Your DigitalOcean droplet is being created. This usually takes
								30–90 seconds.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-6">
							{pollError ? (
								<AlertBlock type="error">{pollError}</AlertBlock>
							) : (
								<>
									<Loader2 className="h-10 w-10 animate-spin text-blue-500" />
									<p className="text-sm text-muted-foreground text-center">
										Waiting for droplet{" "}
										<span className="font-mono text-foreground">
											#{dropletId}
										</span>{" "}
										to become active…
									</p>
								</>
							)}
						</div>
						{pollError && (
							<DialogFooter>
								<Button variant="outline" onClick={() => setStep("configure")}>
									Go Back
								</Button>
							</DialogFooter>
						)}
					</>
				)}

				{/* ── Step: Done ───────────────────────────────────── */}
				{step === "done" && (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<CheckCircle2 className="h-5 w-5 text-green-500" />
								Droplet Ready
							</DialogTitle>
							<DialogDescription>
								Your server is live at{" "}
								<span className="font-mono font-semibold text-foreground">
									{serverIp}
								</span>
								. Click <strong>Setup Server</strong> on the server card to
								install Docker, Traefik, and Dokploy.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-3 py-4">
							<CheckCircle2 className="h-12 w-12 text-green-500" />
							<p className="text-sm text-muted-foreground">
								Server <strong>{configData?.name}</strong> created successfully.
							</p>
						</div>
						<DialogFooter>
							<Button onClick={() => setIsOpen(false)}>Close</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
