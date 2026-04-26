import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { NextPageWithLayout } from "../_app";

const LoginSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof LoginSchema>;

const PlatformLogin: NextPageWithLayout = () => {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const form = useForm<LoginForm>({
		defaultValues: { email: "", password: "" },
		resolver: zodResolver(LoginSchema),
	});

	const handleSubmit = async (data: LoginForm) => {
		setLoading(true);
		try {
			const result = await authClient.signIn.email({
				email: data.email,
				password: data.password,
			});

			if (result.error) {
				toast.error(result.error.message ?? "Invalid credentials");
				return;
			}

			router.push("/platform/dashboard");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Sign-in failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-background px-4">
			<div className="w-full max-w-md space-y-6">
				<div className="text-center space-y-2">
					<div className="flex justify-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
							<Rocket className="h-6 w-6 text-primary" />
						</div>
					</div>
					<h1 className="text-2xl font-bold">Welcome back</h1>
					<p className="text-sm text-muted-foreground">
						Sign in to your platform account
					</p>
				</div>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input type="email" placeholder="jane@example.com" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input type="password" placeholder="••••••••" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" className="w-full" isLoading={loading}>
							Sign in
						</Button>
					</form>
				</Form>

				<p className="text-center text-sm text-muted-foreground">
					Don't have an account?{" "}
					<Link href="/platform/register" className="text-primary hover:underline font-medium">
						Create one
					</Link>
				</p>
				<p className="text-center text-xs text-muted-foreground">
					<Link href="/platform" className="hover:underline">
						← Back to home
					</Link>
				</p>
			</div>
		</div>
	);
};

PlatformLogin.getLayout = (page: ReactElement) => page;

export default PlatformLogin;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (user) {
		return { redirect: { permanent: false, destination: "/platform/dashboard" } };
	}
	return { props: {} };
}
