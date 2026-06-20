CREATE TABLE IF NOT EXISTS "delivery_action_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer,
	"provider_id" integer,
	"provider_code" text,
	"action" text NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"success" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "delivery_providers" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_providers" ADD COLUMN "credentials_encrypted" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_action_logs" ADD CONSTRAINT "delivery_action_logs_shipment_id_delivery_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."delivery_shipments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_action_logs" ADD CONSTRAINT "delivery_action_logs_provider_id_delivery_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."delivery_providers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_action_logs" ADD CONSTRAINT "delivery_action_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_action_logs_shipment_idx" ON "delivery_action_logs" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_action_logs_provider_idx" ON "delivery_action_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_action_logs_action_idx" ON "delivery_action_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_action_logs_created_at_idx" ON "delivery_action_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_providers_one_default_idx" ON "delivery_providers" USING btree ("is_default") WHERE "delivery_providers"."is_default" = true;