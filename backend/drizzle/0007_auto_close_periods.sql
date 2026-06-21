-- Accounting-period auto-close: time-based expiry columns.
-- Added by hand (drizzle-kit generate is unsafe here — schema.js has drifted
-- from the snapshots re: the removed cash-session/shift system).
ALTER TABLE "accounting_periods" ADD COLUMN IF NOT EXISTS "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD COLUMN IF NOT EXISTS "auto_close" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD COLUMN IF NOT EXISTS "closed_reason" text;--> statement-breakpoint
-- Backfill ends_at for EXISTING open periods so the boot catch-up sweep has a
-- boundary to act on. Postgres interval arithmetic clamps month/year overflow
-- exactly like the JS helper (Jan 31 + 1 month → Feb 28/29; Feb 29 + 1 year →
-- Feb 28), so legacy rows expire on the same instant the service would compute.
UPDATE "accounting_periods"
SET "ends_at" = CASE "type"
    WHEN 'daily'   THEN "opened_at" + interval '1 day'
    WHEN 'weekly'  THEN "opened_at" + interval '7 days'
    WHEN 'monthly' THEN "opened_at" + interval '1 month'
    WHEN 'yearly'  THEN "opened_at" + interval '1 year'
    ELSE "opened_at" + interval '1 month'
  END
WHERE "ends_at" IS NULL AND "status" = 'open' AND "opened_at" IS NOT NULL;--> statement-breakpoint
-- Record how already-closed historical rows were closed (all manual until now).
UPDATE "accounting_periods" SET "closed_reason" = 'manual' WHERE "status" = 'closed' AND "closed_reason" IS NULL;
