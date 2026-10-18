ALTER TYPE "public"."lead_source" ADD VALUE 'email';--> statement-breakpoint
ALTER TYPE "public"."provider" ADD VALUE 'gmail';--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "alert_email" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "notes" text;