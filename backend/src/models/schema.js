import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';

// ── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  // Roles: 'admin' (legacy full), 'global_admin', 'branch_admin',
  //        'branch_manager', 'manager', 'cashier', 'viewer'
  role: text('role').notNull().default('cashier'),
  // Branch binding — NULL means "unassigned" (only valid for admin/global_admin)
  assignedBranchId: integer('assigned_branch_id'),
  assignedWarehouseId: integer('assigned_warehouse_id'),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Customers ─────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  // Canonical Iraq-formatted phone for lookup/dedupe. Computed from `phone`
  // by the service layer (and by a SQL function during migration backfill).
  // Nullable so customers without a phone — or with a phone that can't be
  // normalised — are still allowed.
  normalizedPhone: text('normalized_phone'),
  address: text('address'),
  city: text('city'),
  notes: text('notes'),
  // Price tier / classification (تسعير الوكلاء): 'retail' | 'wholesale' | 'agent'.
  // Agents are a customer classification (wholesale buyers), not sales reps.
  customerType: text('customer_type').notNull().default('retail'),
  // Optional per-customer credit ceiling (سقف الدين). NULL = unlimited. Enforced
  // at sale issuance; overridable with the sales.override_credit_limit permission.
  creditLimit: numeric('credit_limit', { precision: 18, scale: 4 }),
  totalPurchases: numeric('total_purchases', { precision: 18, scale: 4 }).default('0'),
  totalDebt: numeric('total_debt', { precision: 18, scale: 4 }).default('0'),
  // Credit scoring (populated by daily creditScoringJob)
  creditScore: integer('credit_score'),
  creditScoreUpdatedAt: timestamp('credit_score_updated_at'),
  recommendedLimit: numeric('recommended_limit', { precision: 18, scale: 4 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Categories ────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Products ──────────────────────────────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sku: text('sku').unique(),
  barcode: text('barcode'),
  categoryId: integer('category_id').references(() => categories.id),
  description: text('description'),
  costPrice: numeric('cost_price', { precision: 18, scale: 4 }).notNull(),
  sellingPrice: numeric('selling_price', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  // Product kind: 'inventory' (stocked goods — the default and legacy
  // behaviour) or 'service' (e.g. "تصليح شاشة"). Service products are never
  // stock-checked or deducted on a sale and are excluded from inventory
  // reports. Defaults to 'inventory' so every pre-existing product keeps its
  // current behaviour.
  productType: text('product_type').notNull().default('inventory'),
  stock: integer('stock').default(0),
  minStock: integer('min_stock').default(0),
  unit: text('unit').default('piece'),
  // Legacy free-text supplier name (kept for display/back-compat). The
  // structured link is supplierId — backfilled from this text in migration
  // 0007. Plain column: suppliers is declared later in this file.
  supplier: text('supplier'),
  supplierId: integer('supplier_id'),
  // Wholesale/agent tier prices (تسعير الوكلاء). NULL → fall back to sellingPrice.
  // Per-unit overrides live on product_units; these are the product-level default.
  wholesalePrice: numeric('wholesale_price', { precision: 18, scale: 4 }),
  agentPrice: numeric('agent_price', { precision: 18, scale: 4 }),
  tracksExpiry: boolean('tracks_expiry').notNull().default(false),
  status: text('status').notNull().default('available'),
  // Inventory: per-warehouse low-stock threshold. Falls back to minStock when null.
  lowStockThreshold: integer('low_stock_threshold').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});


// ── Product Units ─────────────────────────────────────────────────────────
// Multi-unit support: every product has exactly one base unit (factor=1) and
// may declare additional units (درزن, كارتون, …) that map back to it via
// `conversionFactor`. Inventory is stored in the base unit; the unit on a
// sale or stock movement is multiplied by `conversionFactor` before it
// touches stock.
export const productUnits = pgTable('product_units', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  conversionFactor: numeric('conversion_factor', { precision: 18, scale: 6 })
    .notNull()
    .default('1'),
  isBase: boolean('is_base').notNull().default(false),
  isDefaultSale: boolean('is_default_sale').notNull().default(false),
  isDefaultPurchase: boolean('is_default_purchase').notNull().default(false),
  barcode: text('barcode'),
  salePrice: numeric('sale_price', { precision: 18, scale: 4 }),
  costPrice: numeric('cost_price', { precision: 18, scale: 4 }),
  // Per-unit wholesale/agent tier prices (تسعير الوكلاء). NULL → fall back to
  // this unit's salePrice, then the product-level tier price / sellingPrice.
  wholesalePrice: numeric('wholesale_price', { precision: 18, scale: 4 }),
  agentPrice: numeric('agent_price', { precision: 18, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Branches ──────────────────────────────────────────────────────────────
export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  address: text('address'),
  // Per-branch default warehouse — used to seed the active warehouse when the
  // user logs in or switches branches. Nullable so a brand-new branch can
  // exist before any warehouse is created. Cleared automatically (SET NULL)
  // if the referenced warehouse is deleted at the database level.
  defaultWarehouseId: integer('default_warehouse_id'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Warehouses ────────────────────────────────────────────────────────────
// `branchId` is nullable so warehouses can exist independently when the
// multi-branch feature is disabled. When the feature is enabled, the
// validation/service layer requires a branchId.
export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  branchId: integer('branch_id').references(() => branches.id),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Product Stock (per warehouse) ─────────────────────────────────────────
export const productStock = pgTable(
  'product_stock',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    productWarehouseIdx: uniqueIndex('product_stock_product_warehouse_idx').on(
      t.productId,
      t.warehouseId
    ),
  })
);

export const productStockEntries = pgTable(
  'product_stock_entries',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    remainingQuantity: integer('remaining_quantity').notNull(),
    costPrice: numeric('cost_price', { precision: 18, scale: 4 }).notNull(),
    expiryDate: date('expiry_date'),
    receivedAt: timestamp('received_at').defaultNow(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    productWarehouseIdx: index('product_stock_entries_product_warehouse_idx').on(
      t.productId,
      t.warehouseId
    ),
    expiryIdx: index('product_stock_entries_expiry_idx').on(t.expiryDate),
  })
);


// ── Stock Movements ───────────────────────────────────────────────────────
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    // 'sale' | 'sale_cancel' | 'sale_return' | 'transfer_in' | 'transfer_out'
    //  | 'manual_adjustment_in' | 'manual_adjustment_out' | 'opening_balance'
    movementType: text('movement_type').notNull(),
    quantityChange: integer('quantity_change').notNull(),
    quantityBefore: integer('quantity_before').notNull(),
    quantityAfter: integer('quantity_after').notNull(),
    referenceType: text('reference_type'), // 'sale' | 'transfer' | 'adjustment' | null
    referenceId: integer('reference_id'),
    // Unit snapshot — display only. quantityChange/Before/After always remain
    // in the base unit so reports and totals never need to read the unit.
    unitId: integer('unit_id').references(() => productUnits.id, { onDelete: 'set null' }),
    unitName: text('unit_name'),
    unitQuantity: numeric('unit_quantity', { precision: 18, scale: 6 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    warehouseIdx: index('stock_movements_warehouse_idx').on(t.warehouseId),
    productIdx: index('stock_movements_product_idx').on(t.productId),
    createdAtIdx: index('stock_movements_created_at_idx').on(t.createdAt),
  })
);

// ── Warehouse Transfer Requests ───────────────────────────────────────────
// Approval-gated transfer between warehouses. Stock only moves when approved.
export const warehouseTransfers = pgTable(
  'warehouse_transfers',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id),
    fromWarehouseId: integer('from_warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    toWarehouseId: integer('to_warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    requestedBy: integer('requested_by').references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    rejectionReason: text('rejection_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    statusIdx: index('warehouse_transfers_status_idx').on(t.status),
    branchIdx: index('warehouse_transfers_branch_idx').on(t.branchId),
  })
);

// ── Accounting Periods (القيد المحاسبي) ───────────────────────────────────
// A financial operating window opened once and closed once. Everything that
// happens between open and close belongs to the period. On close a frozen
// snapshot of the results is stored in `totalsJson` so later edits to the
// underlying rows never change a closed period's reported figures.
//
// Scope: when multi-branch is OFF there is a single `global` period for the
// whole system; when ON, one independent period per branch. Exactly one OPEN
// period per scope is enforced by a partial unique index (see migration 0002).
// Periods are never deleted and a closed period is immutable.
export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull().default('monthly'), // 'daily'|'weekly'|'monthly'|'yearly'
    scopeType: text('scope_type').notNull().default('global'), // 'global'|'branch'
    branchId: integer('branch_id').references(() => branches.id),
    status: text('status').notNull().default('open'), // 'open'|'closed'
    openedAt: timestamp('opened_at').defaultNow(),
    closedAt: timestamp('closed_at'),
    openedByUserId: integer('opened_by_user_id').references(() => users.id),
    closedByUserId: integer('closed_by_user_id').references(() => users.id),
    notes: text('notes'),
    // Frozen results captured at close time (sales/returns/cogs/expenses/P&L
    // per currency). Source of truth for reviewing a closed period.
    totalsJson: jsonb('totals_json'),
    // Back-reference to the immutable snapshot row written at close (the same
    // payload as totals_json, stored append-only in its own table).
    snapshotId: integer('snapshot_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    statusIdx: index('accounting_periods_status_idx').on(t.status),
    branchIdx: index('accounting_periods_branch_idx').on(t.branchId),
  })
);

// Immutable per-period report snapshot, frozen at close. Closed-period reports
// read from here and never recompute from the (mutable) sales/expenses tables,
// so historical reports stay fixed even after prices/products/settings change.
export const accountingPeriodReportSnapshots = pgTable(
  'accounting_period_report_snapshots',
  {
    id: serial('id').primaryKey(),
    accountingPeriodId: integer('accounting_period_id')
      .notNull()
      .references(() => accountingPeriods.id, { onDelete: 'cascade' }),
    branchId: integer('branch_id').references(() => branches.id),
    snapshotJson: jsonb('snapshot_json').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
  },
  (t) => ({
    periodIdx: uniqueIndex('acc_period_snapshot_period_unique').on(t.accountingPeriodId),
  })
);

// Link table: which cash-session shifts belong to a period (a period has many
// shifts). `shiftId` is unique so a shift can only live in one period.
export const accountingPeriodShifts = pgTable(
  'accounting_period_shifts',
  {
    id: serial('id').primaryKey(),
    accountingPeriodId: integer('accounting_period_id')
      .notNull()
      .references(() => accountingPeriods.id, { onDelete: 'cascade' }),
    shiftId: integer('shift_id')
      .notNull()
      .references(() => cashSessions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    shiftIdx: uniqueIndex('accounting_period_shifts_shift_unique').on(t.shiftId),
    periodIdx: index('accounting_period_shifts_period_idx').on(t.accountingPeriodId),
  })
);

// ── Cash Sessions ─────────────────────────────────────────────────────────
// Tracks per-cashier cash drawer accountability for POS shifts. A user can
// have only one open session per branch at a time. Cash POS sales are blocked
// unless an open session exists, and POS cash sales/payments are linked back
// to the session via `cashSessionId` on the sales/payments tables. Closed
// sessions are immutable (no edits to opening_cash, closing_cash, variance).
export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    branchId: integer('branch_id').references(() => branches.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    // The cashbox this shift operates on (treasury module). Plain column —
    // the FK lives in migration 0006; cashboxes is declared later in this file.
    cashboxId: integer('cashbox_id'),
    openingCash: numeric('opening_cash', { precision: 18, scale: 4 }).notNull().default('0'),
    closingCash: numeric('closing_cash', { precision: 18, scale: 4 }),
    expectedCash: numeric('expected_cash', { precision: 18, scale: 4 }),
    variance: numeric('variance', { precision: 18, scale: 4 }),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('open'), // 'open' | 'closed'
    notes: text('notes'),
    // Frozen per-shift closing totals (sales/returns/expenses/payments/expected
    // cash/opening+closing balance), captured when the shift closes.
    totalsJson: jsonb('totals_json'),
    openedAt: timestamp('opened_at').defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (t) => ({
    userIdx: index('cash_sessions_user_idx').on(t.userId),
    branchIdx: index('cash_sessions_branch_idx').on(t.branchId),
    statusIdx: index('cash_sessions_status_idx').on(t.status),
    // Partial unique "one open session per user/branch" index is created in
    // the SQL migration (0008_cash_sessions.sql) — Drizzle's schema DSL only
    // describes the table here; the migration is the source of truth.
  })
);

// ── Sales ─────────────────────────────────────────────────────────────────
export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  branchId: integer('branch_id').references(() => branches.id),
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
  subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
  discount: numeric('discount', { precision: 18, scale: 4 }).default('0'),
  tax: numeric('tax', { precision: 18, scale: 4 }).default('0'),
  total: numeric('total', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).default('1'),
  interestRate: numeric('interest_rate', { precision: 8, scale: 4 }).default('0'),
  interestAmount: numeric('interest_amount', { precision: 18, scale: 4 }).default('0'),
  paymentType: text('payment_type').notNull(), // 'cash', 'installment', 'mixed' (legacy column)
  // ── v2 source/type fields ────────────────────────────────────────────────
  saleSource: text('sale_source'), // 'POS' | 'NEW_SALE'
  saleType: text('sale_type'),     // 'CASH' | 'INSTALLMENT'
  // ────────────────────────────────────────────────────────────────────────
  paidAmount: numeric('paid_amount', { precision: 18, scale: 4 }).default('0'),
  remainingAmount: numeric('remaining_amount', { precision: 18, scale: 4 }).default('0'),
  status: text('status').notNull().default('pending'),
  // Synthetic opening-balance sale (رصيد افتتاحي): carries a customer's
  // pre-system debt as AR without counting as revenue. Excluded from
  // revenue/COGS aggregations by a central filter in reportService.
  isOpeningBalance: boolean('is_opening_balance').notNull().default(false),
  notes: text('notes'),
  // Set when a real (sequenced) invoice number is assigned. NULL while the row
  // is a draft. A DB trigger forbids changing invoice_number / issued_at /
  // branch_id once issued_at is non-null — see migration 0011.
  issuedAt: timestamp('issued_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Invoice Sequences ─────────────────────────────────────────────────────
// Per-(branch, year) counter row. The saleService allocates a number with an
// atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING inside the same
// transaction that inserts the sale, so concurrent LAN clients can never
// collide and a rollback never burns a number that ends up unused.
export const invoiceSequences = pgTable(
  'invoice_sequences',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    nextValue: integer('next_value').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    branchYearIdx: uniqueIndex('invoice_sequences_branch_year_unique').on(t.branchId, t.year),
  })
);

// ── Sale Items ────────────────────────────────────────────────────────────
//
// Unit snapshot fields (`unitId`, `unitName`, `unitConversionFactor`,
// `baseQuantity`) are written on every new sale so the invoice keeps the
// human-readable unit (2 درزن × 110,000) while reports and stock math always
// rely on `baseQuantity`. Legacy rows that pre-date the unit feature have
// `unitConversionFactor = 1` and `baseQuantity = quantity` after the backfill
// migration.
export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  // `productId` is nullable and intentionally kept WITHOUT a cascade: when a
  // product is hard-deleted, its product_id on cancelled-invoice line items is
  // set to NULL so the invoice survives as a self-contained archival record.
  productId: integer('product_id').references(() => products.id),
  // ── Product snapshot ──────────────────────────────────────────────────────
  // Frozen copy of the catalog fields at sale time so an invoice (especially a
  // cancelled, archived one) renders correctly even after the product row is
  // deleted. `productName`/`unitName`/`unitPrice` already act as the
  // name/unit/price-at-sale snapshot; `productSku`/`barcode` complete it.
  productName: text('product_name').notNull(),
  productSku: text('product_sku'),
  barcode: text('barcode'),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
  discount: numeric('discount', { precision: 18, scale: 4 }).default('0'),
  subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
  unitId: integer('unit_id').references(() => productUnits.id, { onDelete: 'set null' }),
  unitName: text('unit_name'),
  unitConversionFactor: numeric('unit_conversion_factor', { precision: 18, scale: 6 })
    .notNull()
    .default('1'),
  baseQuantity: integer('base_quantity').notNull().default(0),
  // Per-selected-unit cost frozen at sale time. NULL on legacy rows; reports
  // fall back to `products.cost_price * base_quantity` in that case.
  unitCostPrice: numeric('unit_cost_price', { precision: 18, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const saleItemStockEntries = pgTable(
  'sale_item_stock_entries',
  {
    id: serial('id').primaryKey(),
    saleItemId: integer('sale_item_id')
      .notNull()
      .references(() => saleItems.id, { onDelete: 'cascade' }),
    productStockEntryId: integer('product_stock_entry_id')
      .notNull()
      .references(() => productStockEntries.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    saleItemIdx: index('sale_item_stock_entries_sale_item_idx').on(t.saleItemId),
    stockEntryIdx: index('sale_item_stock_entries_stock_entry_idx').on(t.productStockEntryId),
  })
);

// ── Payments ──────────────────────────────────────────────────────────────
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').references(() => customers.id),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).default('1'),
  paymentMethod: text('payment_method').notNull(),
  paymentReference: text('payment_reference'),
  paymentDate: timestamp('payment_date').defaultNow(),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  // Treasury attribution (module 0006): which cashbox/bank received the money
  // and the voucher minted for it. Plain columns — FKs live in the migration;
  // cashboxes/bank_accounts/vouchers are declared later in this file.
  cashboxId: integer('cashbox_id'),
  bankAccountId: integer('bank_account_id'),
  voucherId: integer('voucher_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Installments ──────────────────────────────────────────────────────────
export const installments = pgTable('installments', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').references(() => customers.id),
  installmentNumber: integer('installment_number').notNull(),
  dueAmount: numeric('due_amount', { precision: 18, scale: 4 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 18, scale: 4 }).default('0'),
  remainingAmount: numeric('remaining_amount', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('IQD'),
  dueDate: text('due_date').notNull(),
  paidDate: text('paid_date'),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Sale Returns ──────────────────────────────────────────────────────────
// Operational return/refund records linked to an original sale. A return
// records: which items came back (sale_return_items), how much cash was
// refunded to the customer (refundAmount), and how much of the sale's
// outstanding debt was written off (debtReduction). Stock for the returned
// items is restored via stock_movements (movementType='sale_return') as part
// of the same transaction that creates the return.
export const saleReturns = pgTable(
  'sale_returns',
  {
    id: serial('id').primaryKey(),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id),
    branchId: integer('branch_id').references(() => branches.id),
    warehouseId: integer('warehouse_id').references(() => warehouses.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    // The shift the original sale was recorded in — so the return is locked
    // when that shift closes and is counted in the shift's closing totals.
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, { onDelete: 'set null' }),
    // Total monetary value of the returned items (net of per-item discount)
    returnedValue: numeric('returned_value', { precision: 18, scale: 4 }).notNull(),
    // Cash actually refunded to the customer (<= sale.paidAmount).
    refundAmount: numeric('refund_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    // Outstanding sale debt cancelled by this return (<= sale.remainingAmount).
    // Always equals returnedValue - refundAmount.
    debtReduction: numeric('debt_reduction', { precision: 18, scale: 4 }).notNull().default('0'),
    // 'cash' | 'card' | 'credit' (credit = applied against sale debt only).
    refundMethod: text('refund_method'),
    refundReference: text('refund_reference'),
    currency: text('currency').notNull().default('USD'),
    reason: text('reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    saleIdx: index('sale_returns_sale_idx').on(t.saleId),
    customerIdx: index('sale_returns_customer_idx').on(t.customerId),
    createdAtIdx: index('sale_returns_created_at_idx').on(t.createdAt),
  })
);

export const saleReturnItems = pgTable(
  'sale_return_items',
  {
    id: serial('id').primaryKey(),
    returnId: integer('return_id')
      .notNull()
      .references(() => saleReturns.id, { onDelete: 'cascade' }),
    saleItemId: integer('sale_item_id').references(() => saleItems.id),
    productId: integer('product_id').references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
    unitId: integer('unit_id').references(() => productUnits.id, { onDelete: 'set null' }),
    unitName: text('unit_name'),
    unitConversionFactor: numeric('unit_conversion_factor', { precision: 18, scale: 6 })
      .notNull()
      .default('1'),
    baseQuantity: integer('base_quantity').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    returnIdx: index('sale_return_items_return_idx').on(t.returnId),
    saleItemIdx: index('sale_return_items_sale_item_idx').on(t.saleItemId),
  })
);

// ── Currency Settings ─────────────────────────────────────────────────────
export const currencySettings = pgTable('currency_settings', {
  id: serial('id').primaryKey(),
  currencyCode: text('currency_code').notNull().unique(),
  currencyName: text('currency_name').notNull(),
  symbol: text('symbol').notNull(),
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull(),
  isBaseCurrency: boolean('is_base_currency').default(false),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Settings ──────────────────────────────────────────────────────────────
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── Credit Events ─────────────────────────────────────────────────────────
// Append-only history of every payment/installment lifecycle event used to
// rebuild credit features at any historical point in time. Snapshots are
// derived from this table — never the other way around.
//
// event_type allowed values:
//   PAYMENT   — installment paid (delay_days >= 0)
//   LATE      — installment paid after due date
//   MISSED    — installment overdue & still pending
//   CREATED   — installment sale opened
//   CLOSED    — installment sale fully paid / closed
//   DEFAULTED — manual default flag (admin or rule-engine)
export const creditEvents = pgTable(
  'credit_events',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    amount: numeric('amount', { precision: 18, scale: 4 }).default('0'),
    delayDays: integer('delay_days').default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    customerIdx: index('credit_events_customer_idx').on(t.customerId),
    typeIdx: index('credit_events_type_idx').on(t.eventType),
    createdAtIdx: index('credit_events_created_at_idx').on(t.createdAt),
  })
);

// ── Credit Snapshots ──────────────────────────────────────────────────────
// Training dataset: one row per (customer_id, snapshot_date). Features must
// only contain information available BEFORE snapshot_date; the label is
// computed by looking forward `label_window_days` days. NEVER mix the two —
// any leakage invalidates the model.
export const creditSnapshots = pgTable(
  'credit_snapshots',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalSalesOnInstallment: integer('total_sales_on_installment').default(0),
    totalPaidOnTime: integer('total_paid_on_time').default(0),
    totalLatePayments: integer('total_late_payments').default(0),
    avgDelayDays: numeric('avg_delay_days', { precision: 10, scale: 4 }).default('0'),
    maxDelayDays: integer('max_delay_days').default(0),
    currentOutstandingDebt: numeric('current_outstanding_debt', {
      precision: 18,
      scale: 4,
    }).default('0'),
    activeInstallmentsCount: integer('active_installments_count').default(0),
    completedInstallmentsCount: integer('completed_installments_count').default(0),
    labelDefaulted: boolean('label_defaulted').default(false),
    labelWindowDays: integer('label_window_days').default(90),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    customerIdx: index('credit_snapshots_customer_idx').on(t.customerId),
    snapshotDateIdx: index('credit_snapshots_snapshot_date_idx').on(t.snapshotDate),
    labelIdx: index('credit_snapshots_label_idx').on(t.labelDefaulted),
    customerSnapshotIdx: uniqueIndex('credit_snapshots_customer_date_idx').on(
      t.customerId,
      t.snapshotDate
    ),
  })
);

// ── Credit Scores (inference log) ─────────────────────────────────────────
// One row per scoring call. Used for monitoring, audit, and offline drift /
// accuracy analysis. Never mutated — only inserted.
export const creditScores = pgTable(
  'credit_scores',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    modelVersion: text('model_version').notNull(),
    riskProbability: numeric('risk_probability', { precision: 8, scale: 6 }).notNull(),
    riskLevel: text('risk_level').notNull(), // 'LOW' | 'MEDIUM' | 'HIGH'
    reasons: jsonb('reasons'),
    features: jsonb('features'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    customerIdx: index('credit_scores_customer_idx').on(t.customerId),
    createdAtIdx: index('credit_scores_created_at_idx').on(t.createdAt),
    versionIdx: index('credit_scores_version_idx').on(t.modelVersion),
  })
);

// ── Notification Settings ─────────────────────────────────────────────────
// Singleton row (id=1) holding the messaging-module configuration. The whole
// notification feature is OFF by default — no automatic message is queued or
// sent until an admin enables `enabled` from the Settings UI.
export const notificationSettings = pgTable('notification_settings', {
  id: serial('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  provider: text('provider').notNull().default('bulksmsiraq'),
  // Encrypted at rest using config.jwt.secret-derived key. Never returned to
  // the frontend except as a masked preview.
  apiKeyEncrypted: text('api_key_encrypted'),
  senderId: text('sender_id'),
  smsEnabled: boolean('sms_enabled').notNull().default(true),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
  autoFallbackEnabled: boolean('auto_fallback_enabled').notNull().default(true),
  defaultChannel: text('default_channel').notNull().default('auto'), // 'sms' | 'whatsapp' | 'auto'
  overdueReminderEnabled: boolean('overdue_reminder_enabled').notNull().default(true),
  paymentConfirmationEnabled: boolean('payment_confirmation_enabled').notNull().default(true),
  bulkMessagingEnabled: boolean('bulk_messaging_enabled').notNull().default(false),
  singleCustomerMessagingEnabled: boolean('single_customer_messaging_enabled')
    .notNull()
    .default(true),
  // Optional per-template body overrides. When NULL, the in-code defaults are used.
  templates: jsonb('templates'),
  lastTestAt: timestamp('last_test_at'),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Notifications ─────────────────────────────────────────────────────────
// One row per outbound message. Status lifecycle:
//   pending → processing → (sent | failed)
// The queue worker picks rows where status='pending' AND next_attempt_at<=now.
// `dedupe_key` lets the service skip duplicates for the same logical event
// (e.g. one overdue reminder per installment per day).
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(), // 'overdue_reminder' | 'payment_confirmation' | 'bulk_message' | 'customer_message'
    channel: text('channel').notNull().default('auto'), // 'sms' | 'whatsapp' | 'auto'
    resolvedChannel: text('resolved_channel'),
    recipientPhone: text('recipient_phone').notNull(),
    customerId: integer('customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    installmentId: integer('installment_id').references(() => installments.id, {
      onDelete: 'set null',
    }),
    paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    template: text('template'),
    payload: jsonb('payload'),
    messageBody: text('message_body').notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow(),
    dedupeKey: text('dedupe_key'),
    error: text('error'),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    statusIdx: index('notifications_status_idx').on(t.status),
    nextAttemptIdx: index('notifications_next_attempt_idx').on(t.nextAttemptAt),
    customerIdx: index('notifications_customer_idx').on(t.customerId),
    typeIdx: index('notifications_type_idx').on(t.type),
    dedupeIdx: index('notifications_dedupe_idx').on(t.dedupeKey),
  })
);

// ── Notification Logs ─────────────────────────────────────────────────────
// Append-only audit trail of every provider call (success or failure). Kept
// separate from `notifications` so we have a complete history even after
// retries.
export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: serial('id').primaryKey(),
    notificationId: integer('notification_id').references(() => notifications.id, {
      onDelete: 'cascade',
    }),
    provider: text('provider').notNull(),
    channel: text('channel').notNull(),
    requestPayload: jsonb('request_payload'),
    responsePayload: jsonb('response_payload'),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    notificationIdx: index('notification_logs_notification_idx').on(t.notificationId),
    createdAtIdx: index('notification_logs_created_at_idx').on(t.createdAt),
  })
);

// ── Idempotency Keys ──────────────────────────────────────────────────────
// Cache of (Idempotency-Key, scope) → cached response. Lets the API safely
// dedupe double-click / retry storms on POST/DELETE endpoints that would
// otherwise create duplicate rows (sale create, add payment, remove payment,
// complete draft). The scope segregates keys per-endpoint so a key reused
// across logical operations doesn't collide.
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    userId: integer('user_id'),
    response: jsonb('response'),
    statusCode: integer('status_code').notNull().default(200),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    keyScopeIdx: uniqueIndex('idempotency_keys_key_scope_unique').on(t.key, t.scope),
    createdAtIdx: index('idempotency_keys_created_at_idx').on(t.createdAt),
  })
);

// ── Audit Log ─────────────────────────────────────────────────────────────
// New table for tracking all important user actions.
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  username: text('username'),
  action: text('action').notNull(),        // e.g. 'sale:create', 'user:login', 'backup:create'
  resource: text('resource'),               // e.g. 'sales', 'users', 'products'
  resourceId: integer('resource_id'),       // ID of the affected record
  details: text('details'),                 // JSON string with extra context
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Expenses ──────────────────────────────────────────────────────────────
// Operational expense tracking. Rows record real money going out (rent,
// salaries, supplies, utilities). Used by the report layer to compute
// realistic net profit (revenue - cogs - expenses). Branch-scoped so each
// branch sees only its own expenses unless the user is a global admin.
//
// `category` is free-form text validated at the application layer so the
// allowed list can be extended without a migration.
export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    // Shift the expense was recorded in — locks the expense when the shift or
    // period closes (set null on shift hard-delete to preserve the expense).
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    note: text('note'),
    expenseDate: date('expense_date').notNull(),
    // Treasury attribution (module 0006): which cashbox/bank paid the expense
    // ('cash' | 'bank') and the payment voucher minted for it. Plain columns —
    // FKs live in the migration; cashboxes/vouchers are declared later.
    cashboxId: integer('cashbox_id'),
    bankAccountId: integer('bank_account_id'),
    voucherId: integer('voucher_id'),
    paymentMethod: text('payment_method'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    branchIdx: index('expenses_branch_idx').on(t.branchId),
    categoryIdx: index('expenses_category_idx').on(t.category),
    expenseDateIdx: index('expenses_expense_date_idx').on(t.expenseDate),
    createdAtIdx: index('expenses_created_at_idx').on(t.createdAt),
  })
);

// ── Suppliers (الموردون) ──────────────────────────────────────────────────
// Mirrors the customers conventions: totalDebt is a CACHE — authoritative AP
// is Σ purchase_invoices.remaining_amount for non-cancelled invoices.
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  phone: text('phone'),
  normalizedPhone: text('normalized_phone'),
  address: text('address'),
  city: text('city'),
  notes: text('notes'),
  totalPurchases: numeric('total_purchases', { precision: 18, scale: 4 }).default('0'),
  totalDebt: numeric('total_debt', { precision: 18, scale: 4 }).default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// ── Purchase Invoices (فواتير الشراء) ─────────────────────────────────────
// status: 'received' (goods in stock, the default — no draft stage in v1)
//       | 'cancelled' (stock + AP effects reversed).
// Returns never mutate `total` (mirror of the sales convention — reports net
// out via purchase_returns).
export const purchaseInvoices = pgTable(
  'purchase_invoices',
  {
    id: serial('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    // The supplier's own paper invoice number, for cross-referencing.
    supplierInvoiceNumber: text('supplier_invoice_number'),
    branchId: integer('branch_id').references(() => branches.id),
    warehouseId: integer('warehouse_id').references(() => warehouses.id),
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, {
      onDelete: 'set null',
    }),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
    discount: numeric('discount', { precision: 18, scale: 4 }).default('0'),
    tax: numeric('tax', { precision: 18, scale: 4 }).default('0'),
    total: numeric('total', { precision: 18, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('IQD'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).default('1'),
    paymentType: text('payment_type').notNull().default('cash'), // 'cash' | 'credit'
    paidAmount: numeric('paid_amount', { precision: 18, scale: 4 }).default('0'),
    remainingAmount: numeric('remaining_amount', { precision: 18, scale: 4 }).default('0'),
    status: text('status').notNull().default('received'),
    // Synthetic opening-balance documents (الأرصدة الافتتاحية) are excluded
    // from purchase/expense aggregations but still feed AP aging.
    isOpeningBalance: boolean('is_opening_balance').notNull().default(false),
    invoiceDate: date('invoice_date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    supplierIdx: index('purchase_invoices_supplier_idx').on(t.supplierId),
    branchIdx: index('purchase_invoices_branch_idx').on(t.branchId),
    dateIdx: index('purchase_invoices_date_idx').on(t.invoiceDate),
    periodIdx: index('purchase_invoices_period_idx').on(t.accountingPeriodId),
    statusIdx: index('purchase_invoices_status_idx').on(t.status),
  })
);

// ── Purchase Items ────────────────────────────────────────────────────────
// Product snapshot convention from sale_items. Each line creates exactly ONE
// FIFO batch (product_stock_entries) — linked via productStockEntryId so the
// return flow can put quantities back on the same batch.
export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: serial('id').primaryKey(),
    purchaseInvoiceId: integer('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: 'cascade' }),
    productId: integer('product_id').references(() => products.id),
    productName: text('product_name').notNull(),
    productSku: text('product_sku'),
    barcode: text('barcode'),
    quantity: integer('quantity').notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
    discount: numeric('discount', { precision: 18, scale: 4 }).default('0'),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
    unitId: integer('unit_id').references(() => productUnits.id, { onDelete: 'set null' }),
    unitName: text('unit_name'),
    unitConversionFactor: numeric('unit_conversion_factor', { precision: 18, scale: 6 })
      .notNull()
      .default('1'),
    baseQuantity: integer('base_quantity').notNull().default(0),
    expiryDate: date('expiry_date'),
    productStockEntryId: integer('product_stock_entry_id').references(
      () => productStockEntries.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    invoiceIdx: index('purchase_items_invoice_idx').on(t.purchaseInvoiceId),
    productIdx: index('purchase_items_product_idx').on(t.productId),
  })
);

// ── Purchase Returns (مرتجعات الشراء) ─────────────────────────────────────
// Exact mirror of sale_returns: returnedValue = goods sent back (at cost),
// refundAmount = cash the supplier gave back, debtReduction = AP written off
// (= returnedValue − refundAmount). Stock leaves via stock_movements
// 'purchase_return' preferring the line's own FIFO batch.
export const purchaseReturns = pgTable(
  'purchase_returns',
  {
    id: serial('id').primaryKey(),
    returnNumber: text('return_number').notNull().unique(),
    purchaseInvoiceId: integer('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: 'cascade' }),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    branchId: integer('branch_id').references(() => branches.id),
    warehouseId: integer('warehouse_id').references(() => warehouses.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, {
      onDelete: 'set null',
    }),
    returnedValue: numeric('returned_value', { precision: 18, scale: 4 }).notNull(),
    refundAmount: numeric('refund_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    debtReduction: numeric('debt_reduction', { precision: 18, scale: 4 }).notNull().default('0'),
    refundMethod: text('refund_method'), // 'cash' | 'credit'
    refundReference: text('refund_reference'),
    currency: text('currency').notNull().default('IQD'),
    reason: text('reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    invoiceIdx: index('purchase_returns_invoice_idx').on(t.purchaseInvoiceId),
    supplierIdx: index('purchase_returns_supplier_idx').on(t.supplierId),
  })
);

export const purchaseReturnItems = pgTable(
  'purchase_return_items',
  {
    id: serial('id').primaryKey(),
    returnId: integer('return_id')
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
    purchaseItemId: integer('purchase_item_id').references(() => purchaseItems.id, {
      onDelete: 'set null',
    }),
    productId: integer('product_id').references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
    unitId: integer('unit_id').references(() => productUnits.id, { onDelete: 'set null' }),
    unitName: text('unit_name'),
    unitConversionFactor: numeric('unit_conversion_factor', { precision: 18, scale: 6 })
      .notNull()
      .default('1'),
    baseQuantity: integer('base_quantity').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    returnIdx: index('purchase_return_items_return_idx').on(t.returnId),
  })
);

// ── Cashboxes (الصناديق) ──────────────────────────────────────────────────
// Persistent money containers, one or more per branch. Cash sessions (shifts)
// run ON a cashbox; vouchers and treasury transfers move money in/out of it.
// Balance is computed per currency: opening_balances_json + active vouchers
// (receipt +, payment −) + transfers. Pre-treasury payments have no cashbox
// and never affect a balance.
export const cashboxes = pgTable(
  'cashboxes',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    branchId: integer('branch_id').references(() => branches.id),
    isDefault: boolean('is_default').notNull().default(false),
    // Per-currency opening balances, e.g. {"IQD": "150000", "USD": "100"}.
    openingBalancesJson: jsonb('opening_balances_json'),
    // Optional dedicated GL account; posting falls back to the cash_default
    // system account when null. Plain column — accounts is declared later.
    glAccountId: integer('gl_account_id'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    branchIdx: index('cashboxes_branch_idx').on(t.branchId),
    // Partial unique "one default per branch scope" lives in migration 0006.
  })
);

// ── Bank Accounts (الحسابات المصرفية) ─────────────────────────────────────
// Single-currency accounts (full mode only — gated by the bankAccounts flag).
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    bankName: text('bank_name'),
    accountNumber: text('account_number'),
    iban: text('iban'),
    currency: text('currency').notNull().default('IQD'),
    openingBalance: numeric('opening_balance', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),
    branchId: integer('branch_id').references(() => branches.id),
    // Optional dedicated GL account; falls back to bank_default when null.
    glAccountId: integer('gl_account_id'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    branchIdx: index('bank_accounts_branch_idx').on(t.branchId),
  })
);

// ── Vouchers (سندات القبض والصرف) ─────────────────────────────────────────
// One type-discriminated table (like stock_movements.movementType):
//   voucher_type 'receipt' (قبض) | 'payment' (صرف)
// source_type tells WHY the voucher exists:
//   'manual' standalone, 'sale_payment'/'collections' minted from a payments
//   row (payment_id set), 'sale_refund' minted from a return refund,
//   'expense' minted from an expense row. The payments table remains the
//   canonical AR row — vouchers are the treasury-side record, so cashbox
//   balances read vouchers ONLY (never payments) and nothing double-counts.
export const vouchers = pgTable(
  'vouchers',
  {
    id: serial('id').primaryKey(),
    voucherNumber: text('voucher_number').notNull().unique(),
    voucherType: text('voucher_type').notNull(), // 'receipt' | 'payment'
    branchId: integer('branch_id').references(() => branches.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    cashSessionId: integer('cash_session_id').references(() => cashSessions.id, {
      onDelete: 'set null',
    }),
    partyType: text('party_type'), // 'customer' | 'supplier' | 'other'
    customerId: integer('customer_id').references(() => customers.id),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    saleId: integer('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    purchaseInvoiceId: integer('purchase_invoice_id').references(() => purchaseInvoices.id, {
      onDelete: 'set null',
    }),
    paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    cashboxId: integer('cashbox_id').references(() => cashboxes.id),
    bankAccountId: integer('bank_account_id').references(() => bankAccounts.id),
    method: text('method').notNull().default('cash'), // 'cash' | 'bank'
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('IQD'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).default('1'),
    // Free-form category for standalone income/expense vouchers.
    category: text('category'),
    // Full-mode: the income/expense account a STANDALONE voucher posts to
    // (falls back to other_income/other_expenses). Plain column — accounts
    // is declared later in this file.
    counterAccountId: integer('counter_account_id'),
    description: text('description'),
    referenceNumber: text('reference_number'),
    sourceType: text('source_type').notNull().default('manual'),
    status: text('status').notNull().default('active'), // 'active' | 'cancelled'
    cancelledAt: timestamp('cancelled_at'),
    cancelledBy: integer('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    voucherDate: date('voucher_date').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    typeIdx: index('vouchers_type_idx').on(t.voucherType),
    cashboxIdx: index('vouchers_cashbox_idx').on(t.cashboxId),
    bankIdx: index('vouchers_bank_account_idx').on(t.bankAccountId),
    customerIdx: index('vouchers_customer_idx').on(t.customerId),
    dateIdx: index('vouchers_date_idx').on(t.voucherDate),
    statusIdx: index('vouchers_status_idx').on(t.status),
    periodIdx: index('vouchers_period_idx').on(t.accountingPeriodId),
    sourcePaymentIdx: index('vouchers_source_payment_idx').on(t.sourceType, t.paymentId),
  })
);

// ── Treasury Transfers (التحويلات بين الصناديق/البنوك) ───────────────────
// Two-sided money moves. Exactly one of from_cashbox/from_bank and one of
// to_cashbox/to_bank is set (service-validated). Cross-currency transfers
// carry to_amount/to_currency + the rate used.
export const treasuryTransfers = pgTable(
  'treasury_transfers',
  {
    id: serial('id').primaryKey(),
    transferNumber: text('transfer_number').notNull().unique(),
    fromCashboxId: integer('from_cashbox_id').references(() => cashboxes.id),
    fromBankAccountId: integer('from_bank_account_id').references(() => bankAccounts.id),
    toCashboxId: integer('to_cashbox_id').references(() => cashboxes.id),
    toBankAccountId: integer('to_bank_account_id').references(() => bankAccounts.id),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('IQD'),
    toAmount: numeric('to_amount', { precision: 18, scale: 4 }),
    toCurrency: text('to_currency'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).default('1'),
    branchId: integer('branch_id').references(() => branches.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    status: text('status').notNull().default('active'), // 'active' | 'cancelled'
    cancelledAt: timestamp('cancelled_at'),
    cancelledBy: integer('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    notes: text('notes'),
    transferDate: date('transfer_date').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    fromCashboxIdx: index('treasury_transfers_from_cashbox_idx').on(t.fromCashboxId),
    toCashboxIdx: index('treasury_transfers_to_cashbox_idx').on(t.toCashboxId),
    statusIdx: index('treasury_transfers_status_idx').on(t.status),
    dateIdx: index('treasury_transfers_date_idx').on(t.transferDate),
  })
);

// ── Document Sequences ────────────────────────────────────────────────────
// Generic per-(doc_type, branch, year) counters for every numbered document
// other than sales invoices (which keep their dedicated invoice_sequences).
// Allocation uses the same atomic INSERT ... ON CONFLICT DO UPDATE ...
// RETURNING pattern inside the document's own transaction.
// doc_type: 'purchase' | 'purchase_return' | 'voucher_receipt' |
//           'voucher_payment' | 'treasury_transfer' | 'journal'
export const documentSequences = pgTable(
  'document_sequences',
  {
    id: serial('id').primaryKey(),
    docType: text('doc_type').notNull(),
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    nextValue: integer('next_value').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    typeBranchYearIdx: uniqueIndex('document_sequences_type_branch_year_unique').on(
      t.docType,
      t.branchId,
      t.year
    ),
  })
);

// ── Chart of Accounts (الشجرة المحاسبية) ──────────────────────────────────
// Hierarchical accounts: only postable LEAF accounts accept journal lines.
// is_system marks template-seeded / mapped accounts: rename allowed, delete
// blocked (a posting rule may reference them via system_accounts).
export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
    accountType: text('account_type').notNull(),
    parentId: integer('parent_id'),
    level: integer('level').notNull().default(1),
    isPostable: boolean('is_postable').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    parentIdx: index('accounts_parent_idx').on(t.parentId),
    typeIdx: index('accounts_type_idx').on(t.accountType),
  })
);

// ── System Accounts (ربط الحسابات) ────────────────────────────────────────
// key → account mapping consumed by the posting rules. Data-driven so the
// operator can repoint a rule at a different account without a code change.
export const systemAccounts = pgTable('system_accounts', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── Journal Entries (القيود اليومية) ──────────────────────────────────────
// Posted entries are IMMUTABLE; corrections are reversal entries. The partial
// unique index (migration 0008) guarantees one posted entry per source doc.
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: serial('id').primaryKey(),
    entryNumber: text('entry_number').notNull().unique(),
    entryDate: date('entry_date').notNull(),
    branchId: integer('branch_id').references(() => branches.id),
    accountingPeriodId: integer('accounting_period_id').references(() => accountingPeriods.id),
    // 'manual' | 'sale' | 'sale_return' | 'payment' | 'expense' | 'voucher'
    // | 'purchase' | 'purchase_return' | 'treasury_transfer' | 'shift_variance'
    // | 'opening_balance' | 'reversal'
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id'),
    description: text('description'),
    status: text('status').notNull().default('posted'), // 'posted' | 'reversed'
    reversedByEntryId: integer('reversed_by_entry_id'),
    reversalOfEntryId: integer('reversal_of_entry_id'),
    totalDebitBase: numeric('total_debit_base', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),
    totalCreditBase: numeric('total_credit_base', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),
    isOpening: boolean('is_opening').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => ({
    dateIdx: index('journal_entries_date_idx').on(t.entryDate),
    periodIdx: index('journal_entries_period_idx').on(t.accountingPeriodId),
    sourceIdx: index('journal_entries_source_idx').on(t.sourceType, t.sourceId),
  })
);

// ── Journal Entry Lines ───────────────────────────────────────────────────
// Dual-amount lines: debit/credit in the line currency + debitBase/creditBase
// in the base currency at the document's frozen rate. Entries must balance
// PER CURRENCY and IN BASE (validated by glPostingService).
export const journalEntryLines = pgTable(
  'journal_entry_lines',
  {
    id: serial('id').primaryKey(),
    journalEntryId: integer('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull().default(1),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    branchId: integer('branch_id').references(() => branches.id),
    debit: numeric('debit', { precision: 18, scale: 4 }).notNull().default('0'),
    credit: numeric('credit', { precision: 18, scale: 4 }).notNull().default('0'),
    currency: text('currency').notNull().default('IQD'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    debitBase: numeric('debit_base', { precision: 18, scale: 4 }).notNull().default('0'),
    creditBase: numeric('credit_base', { precision: 18, scale: 4 }).notNull().default('0'),
    partyType: text('party_type'), // 'customer' | 'supplier'
    partyId: integer('party_id'),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    entryIdx: index('journal_entry_lines_entry_idx').on(t.journalEntryId),
    accountIdx: index('journal_entry_lines_account_idx').on(t.accountId, t.journalEntryId),
    partyIdx: index('journal_entry_lines_party_idx').on(t.partyType, t.partyId),
  })
);

// ── GL Posting Failures (صمام أمان الترحيل) ──────────────────────────────
// A posting defect must never break the source document: the failure is
// recorded here (same tx, trivial insert), the document commits, and the
// repair screen re-posts later. Partial unique on pending prevents noise.
export const glPostingFailures = pgTable(
  'gl_posting_failures',
  {
    id: serial('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id').notNull(),
    errorMessage: text('error_message').notNull(),
    payloadJson: jsonb('payload_json'),
    status: text('status').notNull().default('pending'), // 'pending' | 'resolved' | 'ignored'
    attempts: integer('attempts').notNull().default(0),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: integer('resolved_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    statusIdx: index('gl_posting_failures_status_idx').on(t.status),
  })
);

// ── Installment Collection Actions ────────────────────────────────────────
// Lightweight activity log for the collections workflow. One row per
// interaction with a customer about a specific installment: a phone call,
// a visit, a promise to pay, a reschedule, a free-form note, or a payment
// recorded against the installment. The actual payment money still flows
// through the existing payments table — this table only links the action
// to its resulting payment row (paymentId) when applicable.
export const installmentActions = pgTable(
  'installment_actions',
  {
    id: serial('id').primaryKey(),
    installmentId: integer('installment_id')
      .notNull()
      .references(() => installments.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id),
    saleId: integer('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    // 'call' | 'visit' | 'promise_to_pay' | 'reschedule' | 'note' | 'payment'
    actionType: text('action_type').notNull(),
    note: text('note'),
    promisedAmount: numeric('promised_amount', { precision: 18, scale: 4 }),
    promisedDate: text('promised_date'),     // YYYY-MM-DD
    oldDueDate: text('old_due_date'),        // for reschedule
    newDueDate: text('new_due_date'),        // for reschedule
    paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    installmentIdx: index('installment_actions_installment_idx').on(t.installmentId),
    customerIdx: index('installment_actions_customer_idx').on(t.customerId),
    createdAtIdx: index('installment_actions_created_at_idx').on(t.createdAt),
  })
);
