CREATE TABLE IF NOT EXISTS "accounting_period_report_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"accounting_period_id" integer NOT NULL,
	"branch_id" integer,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_period_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"accounting_period_id" integer NOT NULL,
	"shift_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'monthly' NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"branch_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"opened_by_user_id" integer,
	"closed_by_user_id" integer,
	"notes" text,
	"totals_json" jsonb,
	"snapshot_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
	"created_by" integer,
	CONSTRAINT "accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" integer,
	"details" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
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
	"gl_account_id" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"default_warehouse_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "branches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"branch_id" integer,
	"accounting_period_id" integer,
	"cashbox_id" integer,
	"opening_cash" numeric(18, 4) DEFAULT '0' NOT NULL,
	"closing_cash" numeric(18, 4),
	"expected_cash" numeric(18, 4),
	"variance" numeric(18, 4),
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"totals_json" jsonb,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cashboxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"opening_balances_json" jsonb,
	"gl_account_id" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"sale_id" integer,
	"event_type" text NOT NULL,
	"amount" numeric(18, 4) DEFAULT '0',
	"delay_days" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"model_version" text NOT NULL,
	"risk_probability" numeric(8, 6) NOT NULL,
	"risk_level" text NOT NULL,
	"reasons" jsonb,
	"features" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_sales_on_installment" integer DEFAULT 0,
	"total_paid_on_time" integer DEFAULT 0,
	"total_late_payments" integer DEFAULT 0,
	"avg_delay_days" numeric(10, 4) DEFAULT '0',
	"max_delay_days" integer DEFAULT 0,
	"current_outstanding_debt" numeric(18, 4) DEFAULT '0',
	"active_installments_count" integer DEFAULT 0,
	"completed_installments_count" integer DEFAULT 0,
	"label_defaulted" boolean DEFAULT false,
	"label_window_days" integer DEFAULT 90,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currency_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_code" text NOT NULL,
	"currency_name" text NOT NULL,
	"symbol" text NOT NULL,
	"exchange_rate" numeric(18, 6) NOT NULL,
	"is_base_currency" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "currency_settings_currency_code_unique" UNIQUE("currency_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"normalized_phone" text,
	"address" text,
	"city" text,
	"notes" text,
	"customer_type" text DEFAULT 'retail' NOT NULL,
	"credit_limit" numeric(18, 4),
	"total_purchases" numeric(18, 4) DEFAULT '0',
	"total_debt" numeric(18, 4) DEFAULT '0',
	"credit_score" integer,
	"credit_score_updated_at" timestamp,
	"recommended_limit" numeric(18, 4),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"status" text,
	"provider_status" text,
	"message" text,
	"payload" jsonb,
	"occurred_at" timestamp,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"adapter_key" text DEFAULT 'CUSTOM' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"api_key_encrypted" text,
	"api_secret_encrypted" text,
	"webhook_secret_encrypted" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "delivery_providers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_number" text NOT NULL,
	"provider_id" integer,
	"online_order_id" integer,
	"sale_id" integer,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_shipment_id" text,
	"platform_code" text,
	"provider_status" text,
	"tracking_number" text,
	"tracking_url" text,
	"recipient_name" text,
	"recipient_phone" text,
	"secondary_phone" text,
	"province" text,
	"region" text,
	"recipient_address" text,
	"description" text,
	"size" text,
	"fragile" boolean DEFAULT false NOT NULL,
	"ready_to_pickup" boolean DEFAULT false NOT NULL,
	"payment_type" text DEFAULT 'COLLECT_ON_DELIVERY' NOT NULL,
	"fee_type" text DEFAULT 'BY_MERCHANT' NOT NULL,
	"cod_amount" numeric(18, 4) DEFAULT '0',
	"delivery_fee" numeric(18, 4) DEFAULT '0',
	"currency" text DEFAULT 'IQD' NOT NULL,
	"notes" text,
	"last_synced_at" timestamp,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "delivery_shipments_shipment_number_unique" UNIQUE("shipment_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer,
	"provider_code" text,
	"shipment_id" integer,
	"status" text NOT NULL,
	"provider_status" text,
	"normalized_status" text,
	"error_message" text,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now()
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
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer,
	"accounting_period_id" integer,
	"cash_session_id" integer,
	"category" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"expense_date" date NOT NULL,
	"cashbox_id" integer,
	"bank_account_id" integer,
	"voucher_id" integer,
	"payment_method" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"user_id" integer,
	"response" jsonb,
	"status_code" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installment_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"installment_id" integer NOT NULL,
	"customer_id" integer,
	"sale_id" integer,
	"user_id" integer,
	"action_type" text NOT NULL,
	"note" text,
	"promised_amount" numeric(18, 4),
	"promised_date" text,
	"old_due_date" text,
	"new_due_date" text,
	"payment_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer,
	"customer_id" integer,
	"installment_number" integer NOT NULL,
	"due_amount" numeric(18, 4) NOT NULL,
	"paid_amount" numeric(18, 4) DEFAULT '0',
	"remaining_amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"due_date" text NOT NULL,
	"paid_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now()
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
	"created_by" integer,
	CONSTRAINT "journal_entries_entry_number_unique" UNIQUE("entry_number")
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
CREATE TABLE IF NOT EXISTS "notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer,
	"provider" text NOT NULL,
	"channel" text NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'bulksmsiraq' NOT NULL,
	"api_key_encrypted" text,
	"sender_id" text,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"auto_fallback_enabled" boolean DEFAULT true NOT NULL,
	"default_channel" text DEFAULT 'auto' NOT NULL,
	"overdue_reminder_enabled" boolean DEFAULT true NOT NULL,
	"payment_confirmation_enabled" boolean DEFAULT true NOT NULL,
	"bulk_messaging_enabled" boolean DEFAULT false NOT NULL,
	"single_customer_messaging_enabled" boolean DEFAULT true NOT NULL,
	"templates" jsonb,
	"last_test_at" timestamp,
	"last_test_status" text,
	"last_test_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'auto' NOT NULL,
	"resolved_channel" text,
	"recipient_phone" text NOT NULL,
	"customer_id" integer,
	"sale_id" integer,
	"installment_id" integer,
	"payment_id" integer,
	"template" text,
	"payload" jsonb,
	"message_body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now(),
	"dedupe_key" text,
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "online_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"product_sku" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "online_order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"changed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "online_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"channel_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_address" text,
	"province" text,
	"notes" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"total_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "online_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer,
	"customer_id" integer,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"payment_method" text NOT NULL,
	"payment_reference" text,
	"payment_date" timestamp DEFAULT now(),
	"cash_session_id" integer,
	"cashbox_id" integer,
	"bank_account_id" integer,
	"voucher_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_stock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"cost_price" numeric(18, 4) NOT NULL,
	"expiry_date" date,
	"received_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"conversion_factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"is_default_sale" boolean DEFAULT false NOT NULL,
	"is_default_purchase" boolean DEFAULT false NOT NULL,
	"barcode" text,
	"sale_price" numeric(18, 4),
	"cost_price" numeric(18, 4),
	"wholesale_price" numeric(18, 4),
	"agent_price" numeric(18, 4),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"category_id" integer,
	"description" text,
	"cost_price" numeric(18, 4) NOT NULL,
	"selling_price" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"product_type" text DEFAULT 'inventory' NOT NULL,
	"stock" integer DEFAULT 0,
	"min_stock" integer DEFAULT 0,
	"unit" text DEFAULT 'piece',
	"supplier" text,
	"supplier_id" integer,
	"wholesale_price" numeric(18, 4),
	"agent_price" numeric(18, 4),
	"tracks_expiry" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"low_stock_threshold" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
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
	"created_by" integer,
	CONSTRAINT "purchase_invoices_invoice_number_unique" UNIQUE("invoice_number")
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
	"created_by" integer,
	CONSTRAINT "purchase_returns_return_number_unique" UNIQUE("return_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sale_item_stock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_item_id" integer NOT NULL,
	"product_stock_entry_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"product_sku" text,
	"barcode" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0',
	"subtotal" numeric(18, 4) NOT NULL,
	"unit_id" integer,
	"unit_name" text,
	"unit_conversion_factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"base_quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost_price" numeric(18, 4),
	"price_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sale_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"sale_item_id" integer,
	"product_id" integer,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"unit_id" integer,
	"unit_name" text,
	"unit_conversion_factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"base_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sale_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"customer_id" integer,
	"branch_id" integer,
	"warehouse_id" integer,
	"accounting_period_id" integer,
	"cash_session_id" integer,
	"returned_value" numeric(18, 4) NOT NULL,
	"refund_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"debt_reduction" numeric(18, 4) DEFAULT '0' NOT NULL,
	"refund_method" text,
	"refund_reference" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" integer,
	"branch_id" integer,
	"warehouse_id" integer,
	"cash_session_id" integer,
	"accounting_period_id" integer,
	"subtotal" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0',
	"tax" numeric(18, 4) DEFAULT '0',
	"total" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"interest_rate" numeric(8, 4) DEFAULT '0',
	"interest_amount" numeric(18, 4) DEFAULT '0',
	"payment_type" text NOT NULL,
	"sale_source" text,
	"sale_type" text,
	"price_type" text,
	"channel_id" integer,
	"online_order_id" integer,
	"paid_amount" numeric(18, 4) DEFAULT '0',
	"remaining_amount" numeric(18, 4) DEFAULT '0',
	"status" text DEFAULT 'pending' NOT NULL,
	"is_opening_balance" boolean DEFAULT false NOT NULL,
	"notes" text,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "sales_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"color" text,
	"icon" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sales_channels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"accounting_period_id" integer,
	"movement_type" text NOT NULL,
	"quantity_change" integer NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reference_type" text,
	"reference_id" integer,
	"unit_id" integer,
	"unit_name" text,
	"unit_quantity" numeric(18, 6),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
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
	"created_by" integer,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer,
	CONSTRAINT "system_accounts_key_unique" UNIQUE("key")
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
	"created_by" integer,
	CONSTRAINT "treasury_transfers_transfer_number_unique" UNIQUE("transfer_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'cashier' NOT NULL,
	"assigned_branch_id" integer,
	"assigned_warehouse_id" integer,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
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
	"supplier_id" integer,
	"sale_id" integer,
	"purchase_invoice_id" integer,
	"payment_id" integer,
	"expense_id" integer,
	"cashbox_id" integer,
	"bank_account_id" integer,
	"method" text DEFAULT 'cash' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1',
	"category" text,
	"counter_account_id" integer,
	"description" text,
	"reference_number" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_by" integer,
	"cancel_reason" text,
	"voucher_date" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouse_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"from_warehouse_id" integer NOT NULL,
	"to_warehouse_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_period_report_snapshots" ADD CONSTRAINT "accounting_period_report_snapshots_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_period_report_snapshots" ADD CONSTRAINT "accounting_period_report_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_period_report_snapshots" ADD CONSTRAINT "accounting_period_report_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_period_shifts" ADD CONSTRAINT "accounting_period_shifts_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_period_shifts" ADD CONSTRAINT "accounting_period_shifts_shift_id_cash_sessions_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_events" ADD CONSTRAINT "credit_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_events" ADD CONSTRAINT "credit_events_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_scores" ADD CONSTRAINT "credit_scores_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_snapshots" ADD CONSTRAINT "credit_snapshots_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_shipment_id_delivery_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."delivery_shipments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_providers" ADD CONSTRAINT "delivery_providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_provider_id_delivery_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."delivery_providers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_online_order_id_online_orders_id_fk" FOREIGN KEY ("online_order_id") REFERENCES "public"."online_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_webhook_logs" ADD CONSTRAINT "delivery_webhook_logs_provider_id_delivery_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."delivery_providers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_webhook_logs" ADD CONSTRAINT "delivery_webhook_logs_shipment_id_delivery_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."delivery_shipments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gl_posting_failures" ADD CONSTRAINT "gl_posting_failures_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_actions" ADD CONSTRAINT "installment_actions_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_actions" ADD CONSTRAINT "installment_actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_actions" ADD CONSTRAINT "installment_actions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_actions" ADD CONSTRAINT "installment_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_actions" ADD CONSTRAINT "installment_actions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installments" ADD CONSTRAINT "installments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installments" ADD CONSTRAINT "installments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installments" ADD CONSTRAINT "installments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_order_status_history" ADD CONSTRAINT "online_order_status_history_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_order_status_history" ADD CONSTRAINT "online_order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_channel_id_sales_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_stock_entries" ADD CONSTRAINT "product_stock_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_stock_entries" ADD CONSTRAINT "product_stock_entries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_stock_entries" ADD CONSTRAINT "product_stock_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_id_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_stock_entry_id_product_stock_entries_id_fk" FOREIGN KEY ("product_stock_entry_id") REFERENCES "public"."product_stock_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_unit_id_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_item_stock_entries" ADD CONSTRAINT "sale_item_stock_entries_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_item_stock_entries" ADD CONSTRAINT "sale_item_stock_entries_product_stock_entry_id_product_stock_entries_id_fk" FOREIGN KEY ("product_stock_entry_id") REFERENCES "public"."product_stock_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_id_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_unit_id_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."product_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_cashbox_id_cashboxes_id_fk" FOREIGN KEY ("from_cashbox_id") REFERENCES "public"."cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("from_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_cashbox_id_cashboxes_id_fk" FOREIGN KEY ("to_cashbox_id") REFERENCES "public"."cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("to_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cashbox_id_cashboxes_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "public"."cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acc_period_snapshot_period_unique" ON "accounting_period_report_snapshots" USING btree ("accounting_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_period_shifts_shift_unique" ON "accounting_period_shifts" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_period_shifts_period_idx" ON "accounting_period_shifts" USING btree ("accounting_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_periods_status_idx" ON "accounting_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_periods_branch_idx" ON "accounting_periods" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_parent_idx" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_type_idx" ON "accounts" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_branch_idx" ON "bank_accounts" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_sessions_user_idx" ON "cash_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_sessions_branch_idx" ON "cash_sessions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_sessions_status_idx" ON "cash_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashboxes_branch_idx" ON "cashboxes" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_events_customer_idx" ON "credit_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_events_type_idx" ON "credit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_events_created_at_idx" ON "credit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_scores_customer_idx" ON "credit_scores" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_scores_created_at_idx" ON "credit_scores" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_scores_version_idx" ON "credit_scores" USING btree ("model_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_snapshots_customer_idx" ON "credit_snapshots" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_snapshots_snapshot_date_idx" ON "credit_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_snapshots_label_idx" ON "credit_snapshots" USING btree ("label_defaulted");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_snapshots_customer_date_idx" ON "credit_snapshots" USING btree ("customer_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_events_shipment_idx" ON "delivery_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_events_created_at_idx" ON "delivery_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_providers_active_idx" ON "delivery_providers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_shipments_provider_idx" ON "delivery_shipments" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_shipments_order_idx" ON "delivery_shipments" USING btree ("online_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_shipments_sale_idx" ON "delivery_shipments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_shipments_status_idx" ON "delivery_shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_shipments_tracking_idx" ON "delivery_shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_webhook_logs_provider_idx" ON "delivery_webhook_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_webhook_logs_status_idx" ON "delivery_webhook_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_webhook_logs_created_at_idx" ON "delivery_webhook_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_webhook_logs_shipment_idx" ON "delivery_webhook_logs" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_sequences_type_branch_year_unique" ON "document_sequences" USING btree ("doc_type","branch_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_branch_idx" ON "expenses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_created_at_idx" ON "expenses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gl_posting_failures_status_idx" ON "gl_posting_failures" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_key_scope_unique" ON "idempotency_keys" USING btree ("key","scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_actions_installment_idx" ON "installment_actions" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_actions_customer_idx" ON "installment_actions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_actions_created_at_idx" ON "installment_actions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_sequences_branch_year_unique" ON "invoice_sequences" USING btree ("branch_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_period_idx" ON "journal_entries" USING btree ("accounting_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_entry_idx" ON "journal_entry_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id","journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_party_idx" ON "journal_entry_lines" USING btree ("party_type","party_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_notification_idx" ON "notification_logs" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_next_attempt_idx" ON "notifications" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_customer_idx" ON "notifications" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_order_items_order_idx" ON "online_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_order_items_product_idx" ON "online_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_order_status_history_order_idx" ON "online_order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_order_status_history_created_at_idx" ON "online_order_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_status_idx" ON "online_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_channel_idx" ON "online_orders" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_created_at_idx" ON "online_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_orders_phone_idx" ON "online_orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_stock_product_warehouse_idx" ON "product_stock" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_stock_entries_product_warehouse_idx" ON "product_stock_entries" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_stock_entries_expiry_idx" ON "product_stock_entries" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplier_idx" ON "purchase_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_branch_idx" ON "purchase_invoices" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_date_idx" ON "purchase_invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_period_idx" ON "purchase_invoices" USING btree ("accounting_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_status_idx" ON "purchase_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_invoice_idx" ON "purchase_items" USING btree ("purchase_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_product_idx" ON "purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_return_items_return_idx" ON "purchase_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_invoice_idx" ON "purchase_returns" USING btree ("purchase_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_supplier_idx" ON "purchase_returns" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_item_stock_entries_sale_item_idx" ON "sale_item_stock_entries" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_item_stock_entries_stock_entry_idx" ON "sale_item_stock_entries" USING btree ("product_stock_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_return_items_return_idx" ON "sale_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_return_items_sale_item_idx" ON "sale_return_items" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_returns_sale_idx" ON "sale_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_returns_customer_idx" ON "sale_returns" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_returns_created_at_idx" ON "sale_returns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_channels_active_idx" ON "sales_channels" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_warehouse_idx" ON "stock_movements" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_created_at_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_from_cashbox_idx" ON "treasury_transfers" USING btree ("from_cashbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_to_cashbox_idx" ON "treasury_transfers" USING btree ("to_cashbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_status_idx" ON "treasury_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_transfers_date_idx" ON "treasury_transfers" USING btree ("transfer_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_type_idx" ON "vouchers" USING btree ("voucher_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_cashbox_idx" ON "vouchers" USING btree ("cashbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_bank_account_idx" ON "vouchers" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_customer_idx" ON "vouchers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_date_idx" ON "vouchers" USING btree ("voucher_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_status_idx" ON "vouchers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_period_idx" ON "vouchers" USING btree ("accounting_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_source_payment_idx" ON "vouchers" USING btree ("source_type","payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_transfers_status_idx" ON "warehouse_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_transfers_branch_idx" ON "warehouse_transfers" USING btree ("branch_id");