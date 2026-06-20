ALTER TABLE "online_orders" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "warehouse_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_customer_idx" ON "online_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_branch_idx" ON "online_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_created_by_idx" ON "online_orders" USING btree ("created_by");