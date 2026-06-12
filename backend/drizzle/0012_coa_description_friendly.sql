-- Rewrite auto-generated chart-of-accounts mapping descriptions to friendly
-- Arabic. Older seeds stored a technical string like "بُذر من قالب iraqi_unified v1"
-- which leaked the template key/version into the UI (ربط الحسابات screen).
--
-- Idempotent: only rows still carrying the old "بُذر من قالب <key>%" pattern are
-- touched; operator-edited descriptions and already-friendly rows are left alone.

UPDATE "system_accounts"
SET "description" = 'تم إنشاؤه تلقائياً من قالب النظام المحاسبي العراقي الموحد'
WHERE "description" LIKE 'بُذر من قالب iraqi_unified%';
--> statement-breakpoint
UPDATE "system_accounts"
SET "description" = 'تم إنشاؤه تلقائياً من قالب شجرة الحسابات المبسطة'
WHERE "description" LIKE 'بُذر من قالب simple_tree%';
--> statement-breakpoint
-- Any other legacy template key: drop the technical suffix generically.
UPDATE "system_accounts"
SET "description" = 'تم إنشاؤه تلقائياً من قالب شجرة الحسابات'
WHERE "description" LIKE 'بُذر من قالب %';
