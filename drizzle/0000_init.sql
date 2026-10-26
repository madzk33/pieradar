CREATE TABLE "instrument_prices" (
	"ticker" text NOT NULL,
	"day" date NOT NULL,
	"close" double precision NOT NULL,
	CONSTRAINT "instrument_prices_ticker_day_pk" PRIMARY KEY("ticker","day")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exchange" text NOT NULL,
	"currency" text NOT NULL,
	"sector" text DEFAULT 'Other' NOT NULL,
	"provider_symbol" text NOT NULL,
	"logo_domain" text,
	"brand_color" text,
	"price" double precision,
	"prev_close" double precision,
	"quote_at" timestamp with time zone,
	"history_from" date,
	"history_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pie_holdings" (
	"pie_id" text NOT NULL,
	"ticker" text NOT NULL,
	"target_weight" double precision NOT NULL,
	CONSTRAINT "pie_holdings_pie_id_ticker_pk" PRIMARY KEY("pie_id","ticker")
);
--> statement-breakpoint
CREATE TABLE "pie_metrics" (
	"pie_id" text PRIMARY KEY NOT NULL,
	"day1" double precision,
	"m1" double precision,
	"m3" double precision,
	"m6" double precision,
	"ytd" double precision,
	"y1" double precision,
	"aar" double precision,
	"aar_years" double precision,
	"all_time" double precision,
	"volatility" double precision,
	"max_drawdown" double precision,
	"coverage" double precision DEFAULT 1 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pie_snapshots" (
	"pie_id" text NOT NULL,
	"day" date NOT NULL,
	"copiers" integer NOT NULL,
	"source_return" double precision,
	"y1" double precision,
	"holdings" jsonb NOT NULL,
	CONSTRAINT "pie_snapshots_pie_id_day_pk" PRIMARY KEY("pie_id","day")
);
--> statement-breakpoint
CREATE TABLE "pies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"creator_name" text NOT NULL,
	"creator_handle" text,
	"kind" text DEFAULT 'community' NOT NULL,
	"category" text DEFAULT 'Mixed' NOT NULL,
	"copiers" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"holdings_count" integer DEFAULT 0 NOT NULL,
	"source_return" double precision,
	"source_return_capped" integer DEFAULT 0 NOT NULL,
	"share_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"holdings_changed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"removed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_tier" text DEFAULT 'warm' NOT NULL,
	"sync_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"search_text" text DEFAULT '' NOT NULL,
	"top_tickers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_weights" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pie_holdings" ADD CONSTRAINT "pie_holdings_pie_id_pies_id_fk" FOREIGN KEY ("pie_id") REFERENCES "public"."pies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pie_metrics" ADD CONSTRAINT "pie_metrics_pie_id_pies_id_fk" FOREIGN KEY ("pie_id") REFERENCES "public"."pies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pie_snapshots" ADD CONSTRAINT "pie_snapshots_pie_id_pies_id_fk" FOREIGN KEY ("pie_id") REFERENCES "public"."pies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holdings_ticker_idx" ON "pie_holdings" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "metrics_y1_idx" ON "pie_metrics" USING btree ("y1");--> statement-breakpoint
CREATE INDEX "metrics_aar_idx" ON "pie_metrics" USING btree ("aar");--> statement-breakpoint
CREATE INDEX "pies_status_idx" ON "pies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pies_next_sync_idx" ON "pies" USING btree ("status","next_sync_at");--> statement-breakpoint
CREATE INDEX "pies_copiers_idx" ON "pies" USING btree ("copiers");--> statement-breakpoint
CREATE INDEX "pies_created_idx" ON "pies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_runs_job_idx" ON "sync_runs" USING btree ("job","started_at");