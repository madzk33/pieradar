ALTER TABLE "instruments" ADD COLUMN "isin" text;--> statement-breakpoint
ALTER TABLE "pies" ADD COLUMN "origin" text DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE "pies" ADD COLUMN "source_ref" text;--> statement-breakpoint
CREATE INDEX "pies_origin_idx" ON "pies" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "pies_share_url_idx" ON "pies" USING btree ("share_url");