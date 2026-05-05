CREATE TYPE "public"."agent_role" AS ENUM('preview', 'scout', 'analyst', 'librarian', 'editor');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."step_kind" AS ENUM('tool_call', 'message', 'note');--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" text,
	"agent" "agent_role" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"summary_json" jsonb,
	"error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_step" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"ord" integer NOT NULL,
	"kind" "step_kind" NOT NULL,
	"tool_name" text,
	"request_json" jsonb,
	"response_json" jsonb,
	"latency_ms" integer,
	"error_message" text,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_user_started_idx" ON "agent_run" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_step_run_ord_idx" ON "agent_step" USING btree ("run_id","ord");