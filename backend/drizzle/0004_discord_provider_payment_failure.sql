ALTER TYPE "public"."provider" ADD VALUE 'discord';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" text;