-- ── Treasury (الخزينة): cashboxes, bank accounts, vouchers, transfers ──────
-- Cashboxes are persistent money containers (per branch); shifts become
-- sessions ON a cashbox. Vouchers (سند قبض/سند صرف) are the treasury-side
-- record of money in/out; `payments` stays the canonical AR settlement row.
-- All columns additive + nullable so existing installs upgrade with zero
-- behavior change while the `treasury` flag is off.

CREATE TABLE IF NOT EXISTS "cashboxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"opening_balances_json" jsonb,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bank_name" text,
	"account_number" text,
	"iban" text,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"opening_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"branch_id" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_number" text NOT NULL,
	"voucher_type" text NOT NULL,
	"branch_id" integer,
	"accounting_period_id" integer,
	"cash_session_id" integer,
	"party_type" text,
	"customer_id" integer,
	"sale_id" integer,
	"payment_id" integer,
	"expense_id" integer,
	"cashbox_id" integer,
	"bank_account_id" integer,
	"method" text DEFAULT 'cash' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"category" text,
	"description" text,
	"reference_number" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_by" integer,
	"cancel_reason" text,
	"voucher_date" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treasury_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_number" text NOT NULL,
	"from_cashbox_id" integer,
	"from_bank_account_id" integer,
	"to_cashbox_id" integer,
	"to_bank_account_id" integer,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"to_amount" numeric(18, 4),
	"to_currency" text,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"branch_id" integer,
	"accounting_period_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_by" integer,
	"cancel_reason" text,
	"notes" text,
	"transfer_date" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"branch_id" integer NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_accounting_period_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cash_session_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cashbox_id_cashboxes_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_cashbox_fk" FOREIGN KEY ("from_cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_bank_fk" FOREIGN KEY ("from_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_cashbox_fk" FOREIGN KEY ("to_cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_bank_fk" FOREIGN KEY ("to_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_period_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_cancelled_by_fk" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_number_unique" ON "vouchers" ("voucher_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "treasury_transfers_number_unique" ON "treasury_transfers" ("transfer_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_sequences_type_branch_year_unique" ON "document_sequences" ("doc_type","branch_id","year");
--> statement-breakpoint
-- One default cashbox per branch scope: branch_id NULL (single-branch) maps
-- to 0; real branch ids start at 1. Same pattern as the one-open-period index.
CREATE UNIQUE INDEX IF NOT EXISTS "cashboxes_one_default_per_branch" ON "cashboxes" (COALESCE("branch_id", 0)) WHERE "is_default" = true AND "is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashboxes_branch_idx" ON "cashboxes" ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_branch_idx" ON "bank_accounts" ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_type_idx" ON "vouchers" ("voucher_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_cashbox_idx" ON "vouchers" ("cashbox_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_bank_account_idx" ON "vouchers" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_customer_idx" ON "vouchers" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_date_idx" ON "vouchers" ("voucher_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_status_idx" ON "vouchers" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_period_idx" ON "vouchers" ("accounting_period_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_source_payment_idx" ON "vouchers" ("source_type","payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_from_cashbox_idx" ON "treasury_transfers" ("from_cashbox_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_to_cashbox_idx" ON "treasury_transfers" ("to_cashbox_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_status_idx" ON "treasury_transfers" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_date_idx" ON "treasury_transfers" ("transfer_date");
--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "cashbox_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashbox_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_sessions_cashbox_idx" ON "cash_sessions" ("cashbox_id");
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashbox_id" integer;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "bank_account_id" integer;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voucher_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_cashbox_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_cashbox_idx" ON "payments" ("cashbox_id");
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "cashbox_id" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "bank_account_id" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "voucher_id" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_method" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cashbox_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_cashbox_idx" ON "expenses" ("cashbox_id");
