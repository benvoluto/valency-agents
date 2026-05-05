CREATE TYPE "public"."email_event_kind" AS ENUM('delivered', 'opened', 'clicked', 'failed', 'bounced', 'complained', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."email_kind" AS ENUM('digest', 'one_off', 'reply');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed');--> statement-breakpoint
CREATE TABLE "email_event" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text,
	"mailgun_id" text,
	"kind" "email_event_kind" NOT NULL,
	"payload_json" jsonb,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "email_kind" NOT NULL,
	"subject" text NOT NULL,
	"mailgun_id" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"briefing_ids_json" jsonb DEFAULT '[]'::jsonb,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing" ADD COLUMN "short_id" text;--> statement-breakpoint
UPDATE "briefing" SET "short_id" = substr(md5(random()::text || id), 1, 8) WHERE "short_id" IS NULL;--> statement-breakpoint
ALTER TABLE "briefing" ALTER COLUMN "short_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_digest_cadence" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_quiet_hours_start" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_quiet_hours_end" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_suppressed" text;--> statement-breakpoint
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_email_id_email_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email" ADD CONSTRAINT "email_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_event_email_idx" ON "email_event" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_user_created_idx" ON "email" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_mailgun_id_idx" ON "email" USING btree ("mailgun_id");--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_short_id_unique" UNIQUE("short_id");