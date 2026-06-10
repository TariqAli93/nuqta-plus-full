-- Agent / wholesale pricing (تسعير الوكلاء) + per-customer credit limit.
--
-- `customer_type` IS the price tier (retail | wholesale | agent) — agents are a
-- customer classification, not sales reps. Tier prices live as fixed columns on
-- products AND product_units (a join table is overkill for three tiers and would
-- slow the POS hot path). Price resolution chain:
--   unit tier price → product tier price → unit sale_price → product selling_price
-- All additive + nullable so existing installs keep their exact behaviour.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_type" text DEFAULT 'retail' NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" numeric(18, 4);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_customer_type_idx" ON "customers" ("customer_type");
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "wholesale_price" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "agent_price" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "wholesale_price" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "agent_price" numeric(18, 4);
