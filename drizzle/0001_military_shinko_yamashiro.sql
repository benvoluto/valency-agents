CREATE TYPE "public"."follow_kind" AS ENUM('author', 'paper', 'topic');--> statement-breakpoint
CREATE TYPE "public"."goal_cadence" AS ENUM('continuous', 'daily', 'weekly', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."seed_kind" AS ENUM('category', 'keyword', 'author_orcid', 'author_name', 'paper_id', 'venue');--> statement-breakpoint
CREATE TABLE "author" (
	"orcid" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"affiliation" text,
	"h_index" integer,
	"works_count" integer,
	"cited_by_count" integer,
	"openalex_author_id" text,
	"profile_json" jsonb,
	"last_resolved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"user_id" text PRIMARY KEY NOT NULL,
	"valency_token_cipher" text NOT NULL,
	"valency_token_last4" text NOT NULL,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"user_id" text NOT NULL,
	"kind" "follow_kind" NOT NULL,
	"ref_id" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_user_id_kind_ref_id_pk" PRIMARY KEY("user_id","kind","ref_id")
);
--> statement-breakpoint
CREATE TABLE "goal_seed" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"kind" "seed_kind" NOT NULL,
	"value" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"cadence" "goal_cadence" DEFAULT 'weekly' NOT NULL,
	"last_briefed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"authors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" date,
	"abstract" text,
	"doi" text,
	"license" text,
	"source_json" jsonb,
	"last_fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_seed" ADD CONSTRAINT "goal_seed_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_seed_goal_idx" ON "goal_seed" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_user_created_idx" ON "goal" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "paper_published_idx" ON "paper" USING btree ("published_at" DESC NULLS LAST);