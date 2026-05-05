CREATE TYPE "public"."action_kind" AS ENUM('approve', 'dismiss', 'save', 'more_like_this', 'snooze', 'open', 'undo');--> statement-breakpoint
CREATE TYPE "public"."action_source" AS ENUM('web', 'email', 'voice');--> statement-breakpoint
CREATE TYPE "public"."audit_kind" AS ENUM('action', 'run_started', 'run_completed', 'run_failed', 'note');--> statement-breakpoint
CREATE TABLE "action" (
	"id" text PRIMARY KEY NOT NULL,
	"briefing_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "action_kind" NOT NULL,
	"source" "action_source" DEFAULT 'web' NOT NULL,
	"details_json" jsonb,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"undone_at" timestamp,
	"undone_by_action_id" text,
	CONSTRAINT "action_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "audit_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"briefing_id" text,
	"run_id" text,
	"action_id" text,
	"kind" "audit_kind" NOT NULL,
	"source" "action_source" DEFAULT 'web' NOT NULL,
	"message" text NOT NULL,
	"payload_json" jsonb,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_action_id_action_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_user_created_idx" ON "action" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "action_briefing_idx" ON "action" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX "audit_user_ts_idx" ON "audit_entry" USING btree ("user_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_briefing_idx" ON "audit_entry" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX "audit_run_idx" ON "audit_entry" USING btree ("run_id");