import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { Rocket, Globe, Database, Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { NextPageWithLayout } from "../_app";

const PlatformLanding: NextPageWithLayout = () => {
	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Nav */}
			<header className="border-b px-6 h-14 flex items-center justify-between">
				<div className="flex items-center gap-2 font-semibold">
					<Rocket className="h-5 w-5 text-primary" />
					<span>Afintrix Platform</span>
				</div>
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="sm" asChild>
						<Link href="/platform/login">Sign in</Link>
					</Button>
					<Button size="sm" asChild>
						<Link href="/platform/register">Get started free</Link>
					</Button>
				</div>
			</header>

			{/* Hero */}
			<main className="flex-1">
				<section className="mx-auto max-w-4xl px-6 py-24 text-center">
					<div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground mb-6">
						<Zap className="h-3 w-3" />
						Pay only for what you use
					</div>
					<h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-6">
						Deploy your app in{" "}
						<span className="text-primary">seconds</span>
					</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
						Push your code, we handle the infrastructure. Servers auto-provision
						on demand — no DevOps expertise required.
					</p>
					<div className="flex items-center justify-center gap-4 flex-wrap">
						<Button size="lg" asChild>
							<Link href="/platform/register">
								Start deploying
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button size="lg" variant="outline" asChild>
							<Link href="/platform/login">Sign in</Link>
						</Button>
					</div>
				</section>

				{/* Features */}
				<section className="border-t bg-muted/30">
					<div className="mx-auto max-w-5xl px-6 py-20 grid grid-cols-1 sm:grid-cols-3 gap-8">
						<div className="space-y-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Rocket className="h-5 w-5 text-primary" />
							</div>
							<h3 className="font-semibold">Auto-provisioned servers</h3>
							<p className="text-sm text-muted-foreground">
								Deploy and we spin up a DigitalOcean server automatically if
								capacity is needed. No manual setup.
							</p>
						</div>
						<div className="space-y-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Globe className="h-5 w-5 text-primary" />
							</div>
							<h3 className="font-semibold">Instant public URLs</h3>
							<p className="text-sm text-muted-foreground">
								Every deployment gets a live URL with Traefik routing and TLS
								handled automatically.
							</p>
						</div>
						<div className="space-y-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Database className="h-5 w-5 text-primary" />
							</div>
							<h3 className="font-semibold">Pay as you go</h3>
							<p className="text-sm text-muted-foreground">
								Billed by the minute. Stop paying when your app is down. No
								monthly commitments.
							</p>
						</div>
					</div>
				</section>

				{/* What's included */}
				<section className="mx-auto max-w-3xl px-6 py-20">
					<h2 className="text-2xl font-bold text-center mb-10">
						Everything you need to ship
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{[
							"Deploy from Git URL or Docker image",
							"Nixpacks auto-detection",
							"Environment variables management",
							"Custom domains support",
							"Automatic server provisioning",
							"Real-time deployment logs",
							"Multi-environment support",
							"Usage-based billing via Stripe",
						].map((feat) => (
							<div key={feat} className="flex items-center gap-3 text-sm">
								<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
								<span>{feat}</span>
							</div>
						))}
					</div>
				</section>
			</main>

			<footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
				© {new Date().getFullYear()} Afintrix. Powered by Dokploy.
			</footer>
		</div>
	);
};

PlatformLanding.getLayout = (page: ReactElement) => page;

export default PlatformLanding;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	// If already logged in and is a platform user, send to dashboard
	if (user) {
		return { redirect: { permanent: false, destination: "/platform/dashboard" } };
	}
	return { props: {} };
}
