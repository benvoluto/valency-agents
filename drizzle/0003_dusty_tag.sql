CREATE TYPE "public"."briefing_kind" AS ENUM('new_paper', 'citation', 'trend', 'collaborator', 'counter_evidence', 'venue', 'method_shift', 'funder');--> statement-breakpoint
CREATE TYPE "public"."briefing_priority" AS ENUM('critical', 'process', 'opportunity', 'signal');--> statement-breakpoint
CREATE TYPE "public"."briefing_source_kind" AS ENUM('paper', 'author', 'query', 'tool_call', 'web');--> statement-breakpoint
CREATE TYPE "public"."briefing_status" AS ENUM('pending', 'approved', 'dismissed', 'acted', 'expired');--> statement-breakpoint
ALTER TYPE "public"."agent_role" ADD VALUE 'orchestrator' BEFORE 'scout';--> statement-breakpoint
CREATE TABLE "briefing_provenance" (
	"id" text PRIMARY KEY NOT NULL,
	"briefing_id" text NOT NULL,
	"reasoning" text NOT NULL,
	"what_i_will_do" text NOT NULL,
	"scope_json" jsonb,
	"alternatives_considered_json" jsonb,
	CONSTRAINT "briefing_provenance_briefing_id_unique" UNIQUE("briefing_id")
);
--> statement-breakpoint
CREATE TABLE "briefing_source" (
	"id" text PRIMARY KEY NOT NULL,
	"briefing_id" text NOT NULL,
	"kind" "briefing_source_kind" NOT NULL,
	"ref_id" text NOT NULL,
	"snippet" text,
	"position" integer DEFAULT 0 NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_tag" (
	"briefing_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"score" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "briefing_tag_briefing_id_tag_id_pk" PRIMARY KEY("briefing_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "briefing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" text,
	"run_id" text,
	"kind" "briefing_kind" NOT NULL,
	"priority" "briefing_priority" NOT NULL,
	"status" "briefing_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"embedding_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD COLUMN "parent_run_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "daily_budget_usd" double precision DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "briefing_provenance" ADD CONSTRAINT "briefing_provenance_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_source" ADD CONSTRAINT "briefing_source_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_tag" ADD CONSTRAINT "briefing_tag_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_tag" ADD CONSTRAINT "briefing_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefing_source_briefing_idx" ON "briefing_source" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX "briefing_user_created_idx" ON "briefing" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "briefing_user_status_idx" ON "briefing" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "briefing_goal_idx" ON "briefing" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "agent_run_parent_idx" ON "agent_run" USING btree ("parent_run_id");