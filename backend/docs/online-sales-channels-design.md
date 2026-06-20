# Online Sales Channels — Design Document

> Status: **Proposal** · Scope: backend (`nuqta-plus-full/backend`) · No existing sales logic is modified by this design; all changes are additive.

## 1. Goal

Let **every future order be associated with a sales source/channel** (in-store, website, WhatsApp, Instagram, a delivery marketplace such as Talabat, phone, …) so that sales and profit can be sliced **by channel** in reports, without touching the existing sale pipeline.

---

## 2. Findings — current architecture

### 2.1 Sales schema (`src/models/schema.js`)
`sales` already carries several "origin" fields:

| Column | Meaning today | Keep? |
|---|---|---|
| `saleSource` `text` | **Internal entry screen**: `'POS'` \| `'NEW_SALE'` (enum-validated). | Unchanged — do **not** repurpose. |
| `saleType` `text` | `'CASH'` \| `'INSTALLMENT'`. | Unchanged. |
| `paymentType` `text` | Legacy `'cash'\|'installment'\|'mixed'`. | Unchanged. |
| `priceType` `text` | Pricing tier audit (`retail/wholesale/agent`). | Pattern to copy. |
| `branchId`, `warehouseId`, `customerId`, `cashSessionId`, `accountingPeriodId` | Existing dimensions. | Reused. |

`sale_items` keeps a product snapshot per line; no channel concept exists there and none is needed.

**Key insight:** `saleSource` describes *which internal screen* created the row (POS register vs. installment screen). It is an enum locked behind Zod (`SALE_SOURCES`) and cross-field rules (`POS→CASH`, `NEW_SALE→INSTALLMENT`). It is the **wrong field** to overload for commercial channel, because (a) it is a closed enum, (b) it has business rules attached, and (c) a website order could itself be cash *or* installment. **Channel is an orthogonal dimension.**

### 2.2 Customer schema
`customers` has **no** source/channel concept. `customerType` is a *pricing tier* (retail/wholesale/agent), not a channel. Customers are deliberately **not branch-owned**; the same logic should apply to channel — channel belongs to the *sale*, not the customer. (An optional `preferred_channel_id` on the customer is discussed in §6 but is **not** required for the goal.)

### 2.3 Sale write path
- Endpoint → `saleController.create` → `saleSchema.parse(request.body)` (Zod, `src/utils/validation.js:258`) → `SaleService.create()`.
- `saleSource`/`saleType` are normalised at `saleService.js:455–476` and inserted at the single `INSERT … sales` site (`saleService.js:606`).
- One `withTransaction` wraps: invoice-sequence allocation → sales row → items → stock movement → payment + treasury voucher → installments → customer-debt update → GL posting.
- Draft→complete path re-resolves source (`draftSaleSource`, `saleService.js:2471`) — **any new field must survive draft completion the same way.**

### 2.4 Reporting architecture
- **No central aggregator.** `reportService.js` shares a `withConditions()` filter helper (`:68`) for Drizzle queries; `posReportsService.js` builds raw-SQL `WHERE`/`GROUP BY` inline; `financialReportService.js` reads the GL only.
- `saleSource` is **not used in any report today.**
- Sales revenue is aggregated `GROUP BY currency` / `branch` / `day` in ~6 Drizzle sites and ~3 POS-SQL sites. These are the exact sites that would gain an optional `channel` grouping/filter.
- Closed accounting periods freeze a `totalsJson` snapshot — see Risk R4.

### 2.5 Migrations & gating
- Migrations are ordered SQL files in `drizzle/` + a `meta/_journal.json` entry; applied by drizzle `migrate()` with a raw-SQL fallback (`db.js:408`). Convention (see `0009`, `0011`): **additive, nullable, `IF NOT EXISTS`, idempotent, indexed, no backfill required.**
- Modules are gated by `featureFlagsService` (`requireFeature` / `isFeatureEnabled`), full-mode flags live behind `app_mode = 'full'`.

---

## 3. Design

### 3.1 Core decision — reference table, not an enum
Channels are **operator-extensible** (the user will keep adding new ones). An enum/`CHECK` would need a migration per channel. Instead introduce a first-class lookup table `sales_channels` and reference it from `sales` by FK. This mirrors how the codebase already treats expense categories (free-form, app-validated) and feature flags (data-driven).

```
sales_channels (reference/lookup)
   id, code (unique), name, channel_type, is_online,
   is_active, is_default, sort_order, config(jsonb)
        ▲
        │ channel_id (nullable FK)            external_order_ref (text)
   sales ───────────────────────────────────────────────────────────►
   (existing table; 2 additive nullable columns only)
```

- `channel_id` **nullable** → legacy rows and in-store sales read back as the default channel via `COALESCE` (same null-handling pattern as `priceType`/`saleSource`). **No backfill required.**
- `external_order_ref` holds the marketplace's own order number (Talabat order #, website order id) for cross-referencing and future dedupe.
- `channel_type` is free-form text validated at the app layer (`'in_store' | 'online' | 'marketplace' | 'social' | 'phone' | …`) so new types never need a migration.
- `config` jsonb is a forward hook for per-channel integration settings (API keys, webhook secret, commission %) — empty for now.

### 3.2 New backend module (additive, no edits to sale logic)
- `services/channelService.js` — CRUD + `resolveChannelId(input)` / `getDefaultChannel()` / `assertActive(id)`.
- `controllers/channelController.js`, `routes/channelRoutes.js` — `GET/POST/PUT/DELETE /api/channels`.
- `constants/channels.js` — `CHANNEL_TYPES`, default seed list; mirror in `frontend/src/constants/`.
- Permission-matrix entries: `channels.view` / `channels.manage`.
- Feature flag `onlineSalesChannels` (full-mode). When **off**, the channel column simply stays NULL and reports ignore the dimension — zero behavioural change.
- Seed (idempotent, like the COA seeder): one default channel `in_store` with `is_default = true`; optional `website`, `whatsapp`, `instagram`, `phone`.

### 3.3 Integration points (deferred — listed, not built now)
These are where the channel *will* be wired in a later phase. The design keeps each one a small, isolated addition:

1. **Validation** (`validation.js`): add optional `channelId` (int) + `externalOrderRef` (string) to `saleSchema`. No cross-field rules — channel is independent of `saleSource`/`saleType`.
2. **Write path** (`saleService.js`): in the normalise block (~`:459`) add `const channelId = await channelService.resolveChannelId(saleData.channelId)` (falls back to default/NULL); include `channelId`, `externalOrderRef` in the existing `INSERT` values (`:623`). Mirror in the draft-complete path (`:2471`).
3. **Reporting**: extend `withConditions()` to accept an optional `channelId` filter; add `sales.channelId` to the `GROUP BY`/`SELECT` of the ~6 Drizzle revenue queries and ~3 POS-SQL queries **only when a channel breakdown is requested**; add one new `salesByChannel` report endpoint.
4. **Customer profile** (optional): show a per-channel breakdown in `getProfile` using the same `channel_id` column — no schema change beyond §4.

> Per the task, none of these four are implemented yet; the schema in §4 is the foundation that makes them low-risk.

---

## 4. Required database changes

### 4.1 New migration `drizzle/0013_sales_channels.sql`
Additive, nullable, idempotent — consistent with `0009`/`0011`.

```sql
-- Online sales channels (قنوات البيع): a sale's commercial origin (in-store,
-- website, WhatsApp, Instagram, delivery marketplace, phone). Orthogonal to
-- sale_source (which internal SCREEN created the row). Reference table so
-- operators add channels at runtime without a migration. All additive +
-- nullable: legacy rows read back as the default channel via COALESCE.

CREATE TABLE IF NOT EXISTS "sales_channels" (
  "id"           serial PRIMARY KEY,
  "code"         text NOT NULL UNIQUE,
  "name"         text NOT NULL,
  "channel_type" text NOT NULL DEFAULT 'online',
  "is_online"    boolean NOT NULL DEFAULT true,
  "is_active"    boolean NOT NULL DEFAULT true,
  "is_default"   boolean NOT NULL DEFAULT false,
  "sort_order"   integer NOT NULL DEFAULT 0,
  "config"       jsonb,
  "created_at"   timestamp DEFAULT now(),
  "updated_at"   timestamp DEFAULT now(),
  "created_by"   integer REFERENCES "users"("id")
);
--> statement-breakpoint
-- At most one default channel.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_channels_one_default_idx"
  ON "sales_channels" ("is_default") WHERE "is_default" = true;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "channel_id" integer
  REFERENCES "sales_channels"("id");
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "external_order_ref" text;
--> statement-breakpoint
-- Report filter/group hot path: channel within a date window.
CREATE INDEX IF NOT EXISTS "sales_channel_idx" ON "sales" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_channel_created_at_idx"
  ON "sales" ("channel_id", "created_at");
--> statement-breakpoint
-- Seed the default in-store channel (idempotent).
INSERT INTO "sales_channels" ("code","name","channel_type","is_online","is_default","sort_order")
VALUES ('in_store','بيع مباشر','in_store', false, true, 0)
ON CONFLICT ("code") DO NOTHING;
```

Also add the `meta/_journal.json` entry for tag `0013_sales_channels` (drizzle `migrate()` reads the journal; the raw fallback reads the folder).

### 4.2 Drizzle schema (`src/models/schema.js`)
- New `salesChannels = pgTable('sales_channels', { … })` table object (+ export in `models/index.js`).
- Two columns on `sales`: `channelId: integer('channel_id').references(() => salesChannels.id)` and `externalOrderRef: text('external_order_ref')`.

### 4.3 Optional, future (NOT in this migration)
- `customers.preferred_channel_id` (nullable FK) — only if customer-level default channel is wanted (§6).
- `online_orders` staging table — for a future *order-ingestion* pipeline (webhooks from website/marketplace) where an order exists **before** it becomes a confirmed `sales` row; would carry a `UNIQUE(channel_id, external_order_ref)` dedupe key. Out of scope now.

---

## 5. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Overloading `saleSource`.** Tempting to reuse the existing enum, but it is closed and rule-bound. | Add a *separate* `channel_id` dimension; leave `saleSource` untouched. |
| R2 | **NULL channels dropping out of `GROUP BY`/filters** (legacy + in-store rows). | Reports `COALESCE(channel_id, <default>)`; seed a default `in_store` channel; never make the column `NOT NULL`. |
| R3 | **Report group-cardinality explosion** — already per-currency × branch × day; adding channel multiplies groups and can slow queries. | Channel grouping is **opt-in** per report; rely on `sales_channel_created_at_idx`. |
| R4 | **Closed accounting periods are frozen** (`totalsJson` snapshot). Channel breakdowns will exist only for sales recorded *after* rollout; already-closed periods cannot be split by channel retroactively. | Document it; only new periods carry channel splits. Optional one-off backfill of `channel_id = in_store` for historical reporting parity. |
| R5 | **Draft→complete path** could drop the channel if only the create path is wired. | Mirror the `draftSaleSource` handling (`saleService.js:2471`). |
| R6 | **Frontend/back constants drift** (`constants/sales.js` is mirrored). | Add `constants/channels.js` on both sides; single source list. |
| R7 | **GL scope creep** — channel is a *reporting* dimension, not an accounting one. Pushing it into journal entries would require per-channel revenue accounts. | Keep channel out of the GL; it lives on `sales` only. |
| R8 | **Duplicate online-order imports** (future ingestion). | Reserve `external_order_ref` now; add `UNIQUE(channel_id, external_order_ref)` when ingestion is built. |
| R9 | **Permissions / branch scoping** — channel must not bypass existing branch RBAC. | Channel is orthogonal; existing `branchFilterFor`/`applyBranchScope` continue to apply unchanged. |
| R10 | **Deleting a channel referenced by sales.** | `channelService.delete` blocks when `sales.channel_id` references it (mirror customer-delete guard); prefer `is_active = false`. |

---

## 6. Open question (optional follow-up)
Should a customer carry a **default/preferred channel** (`customers.preferred_channel_id`)? Useful for online-only customers and pre-filling the channel on a new order, but not required for the stated goal (channel is fundamentally a per-sale attribute). Recommend deferring until the order-ingestion phase.

---

## 7. Summary
- **One new reference table** (`sales_channels`) + **two nullable columns** on `sales` (`channel_id`, `external_order_ref`).
- **Zero changes** to the existing sale write path, GL, treasury, or reports in this step — the migration is purely additive and idempotent.
- Channel is a clean, orthogonal dimension that slots into the existing `withConditions()`/per-report query pattern when reporting is wired in a later phase.
