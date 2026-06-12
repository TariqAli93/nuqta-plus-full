-- Price tier stamped on each sale + line (تسعير الوكلاء — أي سعر اعتُمد عند البيع).
--
-- `price_type` is the pricing tier chosen for the invoice: retail | wholesale |
-- agent (مفرد | جملة | وكيل). The frontend resolves the actual per-line price
-- (and converts currency); this column is the persisted AUDIT of which tier the
-- invoice used, so inventory/sales reports can show "نوع التسعيرة المستخدم".
--
-- Additive + nullable so every pre-existing row keeps its exact behaviour and
-- reads back as retail (مفرد) when null. No backfill required.

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "price_type" text;
--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "price_type" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_price_type_idx" ON "sales" ("price_type");
