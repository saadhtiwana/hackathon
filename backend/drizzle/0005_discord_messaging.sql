CREATE TABLE "discord_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "channel" SET DEFAULT 'discord';--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "discord_user_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "discord_user_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "external_channel_id" text;--> statement-breakpoint
ALTER TABLE "discord_link_codes" ADD CONSTRAINT "discord_link_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_link_codes" ADD CONSTRAINT "discord_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_link_codes_workspace_idx" ON "discord_link_codes" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_ws_discord_uq" ON "memberships" USING btree ("workspace_id","discord_user_id") WHERE "memberships"."discord_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_ws_discord_uq" ON "contacts" USING btree ("workspace_id","discord_user_id") WHERE "contacts"."discord_user_id" is not null;