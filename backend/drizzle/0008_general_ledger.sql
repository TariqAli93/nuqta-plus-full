-- ── General Ledger (الشجرة المحاسبية والقيود المزدوجة) ─────────────────────
-- Double-entry backbone: chart of accounts + system-account mapping +
-- journal entries/lines + a posting-failure valve. Posted entries are
-- immutable — corrections happen via reversal entries, never edits.

CREATE TABLE IF NOT EXISTS "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 1 NOT NULL,
	"is_postable" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" date NOT NULL,
	"branch_id" integer,
	"accounting_period_id" integer,
	"source_type" text NOT NULL,
	"source_id" integer,
	"description" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"reversed_by_entry_id" integer,
	"reversal_of_entry_id" integer,
	"total_debit_base" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_credit_base" numeric(18, 4) DEFAULT '0' NOT NULL,
	"is_opening" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" integer NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"account_id" integer NOT NULL,
	"branch_id" integer,
	"debit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	"debit_base" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit_base" numeric(18, 4) DEFAULT '0' NOT NULL,
	"party_type" text,
	"party_id" integer,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gl_posting_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"error_message" text NOT NULL,
	"payload_json" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_account_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gl_posting_failures" ADD CONSTRAINT "gl_posting_failures_resolved_by_fk" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_code_unique" ON "accounts" ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_accounts_key_unique" ON "system_accounts" ("key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_number_unique" ON "journal_entries" ("entry_number");
--> statement-breakpoint
-- Idempotent-posting backstop: one POSTED entry per source document. Manual
-- entries and reversals are exempt (they have no single source).
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_source_unique" ON "journal_entries" ("source_type","source_id") WHERE "source_type" NOT IN ('manual','reversal') AND "status" = 'posted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_parent_idx" ON "accounts" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_type_idx" ON "accounts" ("account_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_date_idx" ON "journal_entries" ("entry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_period_idx" ON "journal_entries" ("accounting_period_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_source_idx" ON "journal_entries" ("source_type","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_entry_idx" ON "journal_entry_lines" ("journal_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_account_idx" ON "journal_entry_lines" ("account_id","journal_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_party_idx" ON "journal_entry_lines" ("party_type","party_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gl_posting_failures_status_idx" ON "gl_posting_failures" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gl_posting_failures_pending_unique" ON "gl_posting_failures" ("source_type","source_id") WHERE "status" = 'pending';
--> statement-breakpoint
ALTER TABLE "cashboxes" ADD COLUMN IF NOT EXISTS "gl_account_id" integer;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "gl_account_id" integer;
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "counter_account_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_gl_account_fk" FOREIGN KEY ("gl_account_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_gl_account_fk" FOREIGN KEY ("gl_account_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_counter_account_fk" FOREIGN KEY ("counter_account_id") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
