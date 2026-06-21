CREATE TABLE IF NOT EXISTS "recurring_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"month_of_year" integer,
	"start_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_date" date,
	"next_due_date" date,
	"cashbox_id" integer,
	"bank_account_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "recurring_expense_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_expenses_branch_idx" ON "recurring_expenses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_expenses_active_idx" ON "recurring_expenses" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_expenses_next_due_idx" ON "recurring_expenses" USING btree ("next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_recurring_period_uq" ON "expenses" USING btree ("recurring_expense_id","expense_date");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_expense_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;