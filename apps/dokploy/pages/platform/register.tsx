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
import { api } from "@/utils/api";
import { authClient } from "@/lib/auth-client";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { NextPageWithLayout } from "../_app";

const RegisterSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		email: z.string().email("Invalid email"),
		password: z.string().min(8, "Password must be at least 8 characters"),
		confirmPassword: z.string(),
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type RegisterForm = z.infer<typeof RegisterSchema>;

const PlatformRegister: NextPageWithLayout = () => {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const { mutateAsync: registerAccount } = api.platform.register.useMutation();

	const form = useForm<RegisterForm>({
		defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
		resolver: zodResolver(RegisterSchema),
	});

	const handleSubmit = async (data: RegisterForm) => {
		setLoading(true);
		try {
			// 1. Server creates the user + org + platformUser record (bypasses Better Auth sign-up guard)
			await registerAccount({ name: data.name, email: data.email, password: data.password });

			// 2. Sign in to establish a session cookie
			const signInResult = await authClient.signIn.email({
				email: data.email,
				password: data.password,
			});

			if (signInResult.error) {
				toast.error("Account created but sign-in failed. Please try logging in.");
				router.push("/platform/login");
				return;
			}

			toast.success("Account created! Welcome aboard.");
			router.push("/platform/dashboard");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Registration failed");
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
					<h1 className="text-2xl font-bold">Create your account</h1>
					<p className="text-sm text-muted-foreground">
						Start deploying in seconds — no credit card required
					</p>
				</div>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="Jane Smith" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
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
						<FormField
							control={form.control}
							name="confirmPassword"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Confirm password</FormLabel>
									<FormControl>
										<Input type="password" placeholder="••••••••" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" className="w-full" isLoading={loading}>
							Create account
						</Button>
					</form>
				</Form>

				<p className="text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link href="/platform/login" className="text-primary hover:underline font-medium">
						Sign in
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

PlatformRegister.getLayout = (page: ReactElement) => page;

export default PlatformRegister;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);
	if (user) {
		return { redirect: { permanent: false, destination: "/platform/dashboard" } };
	}
	return { props: {} };
}
