-- Opening balances (الأرصدة الافتتاحية).
--
-- Customer opening debts are recorded as SYNTHETIC opening sales (one service
-- line "رصيد افتتاحي سابق", paidAmount 0, remaining = debt) so AR aging,
-- collections, and payment allocation all work untouched. `is_opening_balance`
-- flags those rows so reports exclude them from revenue/COGS. The mirror column
-- on purchase_invoices already exists from migration 0007.

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "is_opening_balance" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Partial index: opening rows are a tiny subset; this keeps the "exclude
-- openings from revenue" filter cheap on the hot sales-reporting path.
CREATE INDEX IF NOT EXISTS "sales_is_opening_balance_idx" ON "sales" ("is_opening_balance") WHERE "is_opening_balance" = true;
