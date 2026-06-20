CREATE TABLE IF NOT EXISTS "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_ar" text NOT NULL,
	"description_ar" text,
	"group_ar" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"description_ar" text,
	"scope" text DEFAULT 'branch' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"all_permissions" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_perm_unique" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_branches_user_branch_idx" ON "user_branches" USING btree ("user_id","branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_branches_user_idx" ON "user_branches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_branches_branch_idx" ON "user_branches" USING btree ("branch_id");--> statement-breakpoint
-- Backfill: every existing user with a primary branch gets a matching
-- user_branches row, so the multi-branch scope logic returns the same single
-- branch it does today (identical behaviour for single-branch users).
INSERT INTO "user_branches" ("user_id", "branch_id")
SELECT "id", "assigned_branch_id" FROM "users" WHERE "assigned_branch_id" IS NOT NULL
ON CONFLICT ("user_id", "branch_id") DO NOTHING;