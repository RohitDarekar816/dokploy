CREATE TABLE IF NOT EXISTS "platform_settings" (
	"platform_settings_id" text PRIMARY KEY NOT NULL,
	"do_api_token" text,
	"ssh_key_id" text,
	"droplet_size" text DEFAULT 's-2vcpu-4gb' NOT NULL,
	"droplet_region" text DEFAULT 'nyc3' NOT NULL,
	"max_apps_per_server" integer DEFAULT 20 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
