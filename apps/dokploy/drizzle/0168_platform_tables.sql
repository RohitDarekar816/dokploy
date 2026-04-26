CREATE TABLE "platform_server" (
	"platform_server_id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"max_apps" integer DEFAULT 20 NOT NULL,
	"region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);

CREATE TABLE "platform_user" (
	"platform_user_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"email" text NOT NULL,
	"name" text,
	"created_at" text NOT NULL,
	CONSTRAINT "platform_user_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "platform_user_organization_id_unique" UNIQUE("organization_id")
);

CREATE TABLE "platform_deployment" (
	"platform_deployment_id" text PRIMARY KEY NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_server_id" text,
	"dokploy_project_id" text,
	"dokploy_environment_id" text,
	"dokploy_application_id" text,
	"project_name" text NOT NULL,
	"app_name" text NOT NULL,
	"source_type" text DEFAULT 'git' NOT NULL,
	"github_url" text,
	"docker_image" text,
	"branch" text DEFAULT 'main' NOT NULL,
	"port" integer DEFAULT 3000 NOT NULL,
	"env_vars" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"app_url" text,
	"error_message" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "platform_deployment_app_name_unique" UNIQUE("app_name")
);

CREATE TABLE "platform_usage_record" (
	"usage_record_id" text PRIMARY KEY NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_deployment_id" text,
	"stripe_usage_record_id" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reported_at" text NOT NULL
);

ALTER TABLE "platform_server" ADD CONSTRAINT "platform_server_server_id_server_serverId_fk"
	FOREIGN KEY ("server_id") REFERENCES "public"."server"("serverId") ON DELETE CASCADE ON UPDATE no action;

ALTER TABLE "platform_user" ADD CONSTRAINT "platform_user_organization_id_organization_id_fk"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE ON UPDATE no action;

ALTER TABLE "platform_deployment" ADD CONSTRAINT "platform_deployment_platform_user_id_platform_user_platform_user_id_fk"
	FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_user"("platform_user_id") ON DELETE CASCADE ON UPDATE no action;

ALTER TABLE "platform_deployment" ADD CONSTRAINT "platform_deployment_platform_server_id_platform_server_platform_server_id_fk"
	FOREIGN KEY ("platform_server_id") REFERENCES "public"."platform_server"("platform_server_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "platform_usage_record" ADD CONSTRAINT "platform_usage_record_platform_user_id_platform_user_platform_user_id_fk"
	FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_user"("platform_user_id") ON DELETE CASCADE ON UPDATE no action;

ALTER TABLE "platform_usage_record" ADD CONSTRAINT "platform_usage_record_platform_deployment_id_platform_deployment_platform_deployment_id_fk"
	FOREIGN KEY ("platform_deployment_id") REFERENCES "public"."platform_deployment"("platform_deployment_id") ON DELETE no action ON UPDATE no action;
