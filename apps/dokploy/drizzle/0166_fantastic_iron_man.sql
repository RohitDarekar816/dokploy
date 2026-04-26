CREATE TABLE "digitalocean" (
	"digitaloceanId" text PRIMARY KEY NOT NULL,
	"apiToken" text NOT NULL,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL,
	CONSTRAINT "digitalocean_organizationId_unique" UNIQUE("organizationId")
);
--> statement-breakpoint
ALTER TABLE "digitalocean" ADD CONSTRAINT "digitalocean_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;