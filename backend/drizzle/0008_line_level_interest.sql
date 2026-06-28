-- Added by hand (drizzle-kit generate is unsafe here — schema.js has drifted
-- from the snapshots re: the removed cash-session/shift system).
--
-- Product/line-level installment interest. Strictly additive & backward
-- compatible: every column is nullable or DEFAULT 0, no existing row is
-- rewritten, and old invoices keep their behaviour (these columns stay NULL/0).

ALTER TABLE "products"   ADD COLUMN IF NOT EXISTS "installment_interest_rate" numeric(8,4) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "unit_price_before_interest" numeric(18,4);--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "interest_per_unit" numeric(18,4) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "interest_amount" numeric(18,4) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "unit_price_after_interest" numeric(18,4);
