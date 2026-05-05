CREATE TABLE "health_check" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"db" text NOT NULL,
	"anthropic" text NOT NULL,
	"valency" text NOT NULL,
	"db_latency_ms" integer,
	"anthropic_latency_ms" integer,
	"valency_latency_ms" integer
);
--> statement-breakpoint
CREATE INDEX "health_check_ts_idx" ON "health_check" USING btree ("ts" DESC NULLS LAST);