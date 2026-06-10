-- ── Suppliers + Purchases (الموردون والمشتريات) ────────────────────────────
-- Mirrors the sales conventions: snapshots, numbering via document_sequences,
-- period+shift stamping, status lifecycle, and returns that never mutate the
-- original total. Purchases create FIFO product_stock_entries batches.
-- products.supplier (legacy text) is kept; supplier_id FK added + backfilled.

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"normalized_phone" text,
	"address" text,
	"city" text,
	"notes" text,
	"total_purchases" numeric(18, 4) DEFAULT '0',
	"total_debt" numeric(18, 4) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_invoice_number" text,
	"branch_id" integer,
	"warehouse_id" integer,
	"cash_session_id" integer,
	"accounting_period_id" integer,
	"subtotal" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0',
	"tax" numeric(18, 4) DEFAULT '0',
	"total" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"payment_type" text DEFAULT 'cash' NOT NULL,
	"paid_amount" numeric(18, 4) DEFAULT '0',
	"remaining_amount" numeric(18, 4) DEFAULT '0',
	"status" text DEFAULT 'received' NOT NULL,
	"is_opening_balance" boolean DEFAULT false NOT NULL,
	"invoice_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_invoice_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"product_sku" text,
	"barcode" text,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0',
	"subtotal" numeric(18, 4) NOT NULL,
	"unit_id" integer,
	"unit_name" text,
	"unit_conversion_factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"base_quantity" integer DEFAULT 0 NOT NULL,
	"expiry_date" date,
	"product_stock_entry_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_number" text NOT NULL,
	"purchase_invoice_id" integer NOT NULL,
	"supplier_id" integer,
	"branch_id" integer,
	"warehouse_id" integer,
	"accounting_period_id" integer,
	"cash_session_id" integer,
	"returned_value" numeric(18, 4) NOT NULL,
	"refund_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"debt_reduction" numeric(18, 4) DEFAULT '0' NOT NULL,
	"refund_method" text,
	"refund_reference" text,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"purchase_item_id" integer,
	"product_id" integer,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"unit_id" integer,
	"unit_name" text,
	"unit_conversion_factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"base_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_warehouse_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_cash_session_fk" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_period_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_invoice_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_stock_entry_fk" FOREIGN KEY ("product_stock_entry_id") REFERENCES "product_stock_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_invoice_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_period_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_cash_session_fk" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_fk" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_item_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_name_unique" ON "suppliers" ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_number_unique" ON "purchase_invoices" ("invoice_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_returns_number_unique" ON "purchase_returns" ("return_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplier_idx" ON "purchase_invoices" ("supplier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_branch_idx" ON "purchase_invoices" ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_date_idx" ON "purchase_invoices" ("invoice_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_period_idx" ON "purchase_invoices" ("accounting_period_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_status_idx" ON "purchase_invoices" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_invoice_idx" ON "purchase_items" ("purchase_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_product_idx" ON "purchase_items" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_invoice_idx" ON "purchase_returns" ("purchase_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_supplier_idx" ON "purchase_returns" ("supplier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_return_items_return_idx" ON "purchase_return_items" ("return_id");
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplier_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_supplier_idx" ON "products" ("supplier_id");
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "supplier_id" integer;
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "purchase_invoice_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_purchase_invoice_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_supplier_idx" ON "vouchers" ("supplier_id");
--> statement-breakpoint
-- Backfill: lift distinct legacy supplier names into the suppliers table,
-- then link products. Re-runnable: ON CONFLICT skips existing names and the
-- UPDATE only touches rows still missing supplier_id. Legacy text is kept.
INSERT INTO suppliers (name)
SELECT DISTINCT trim(supplier) FROM products
WHERE supplier IS NOT NULL AND trim(supplier) <> ''
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
UPDATE products p SET supplier_id = s.id
FROM suppliers s
WHERE p.supplier_id IS NULL
  AND p.supplier IS NOT NULL
  AND trim(p.supplier) = s.name;
