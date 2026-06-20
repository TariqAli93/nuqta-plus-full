import { getDb } from '../db.js';
import { settings } from '../models/index.js';
import { eq } from 'drizzle-orm';
import { ValidationError } from '../utils/errors.js';

const SETTINGS_KEY = 'feature_flags';
const SETUP_MODE_KEY = 'setup_mode';
const APP_MODE_KEY = 'app_mode';

/**
 * Operating modes (نمطا العمل). `simple` is the small-shop experience —
 * advanced accounting modules stay hidden AND locked server-side. `full`
 * unlocks the complete accounting suite. Upgrading simple→full is allowed
 * at any time; downgrading is not offered (individual flags can still be
 * turned off in full mode).
 */
export const APP_MODES = Object.freeze({
  SIMPLE: 'simple',
  FULL: 'full',
});

/**
 * Flags that may only be enabled while `app_mode = 'full'`. Treasury and
 * agent pricing are intentionally NOT in this list — small shops want
 * cashboxes/vouchers and wholesale price tiers too.
 */
export const FULL_MODE_ONLY_FLAGS = Object.freeze([
  'suppliers',
  'purchases',
  'bankAccounts',
  'generalLedger',
  'manualJournal',
  'financialReports',
]);

const FULL_MODE_ONLY_SET = new Set(FULL_MODE_ONLY_FLAGS);

/**
 * Some flags are exposed to the API under more than one name so the
 * frontend payload can stay aligned with the product spec ("inventoryTransfers")
 * while the storage layer keeps the historical key ("warehouseTransfers").
 * The values are mirrored on read and on write — touching either name updates
 * the canonical key.
 */
const FLAG_ALIASES = Object.freeze({
  inventoryTransfers: 'warehouseTransfers',
});

/** Preset bundles for the first-run wizard. */
export const SETUP_PRESETS = Object.freeze({
  simple: {
    installments: false,
    creditScore: false,
    inventory: true,
    multiBranch: false,
    multiWarehouse: false,
    warehouseTransfers: false,
    pos: true,
    draftInvoices: true,
  },
  installments: {
    installments: true,
    creditScore: true,
    inventory: true,
    multiBranch: false,
    multiWarehouse: false,
    warehouseTransfers: false,
    pos: true,
    draftInvoices: true,
  },
  multi_branch: {
    installments: true,
    creditScore: true,
    inventory: true,
    multiBranch: true,
    multiWarehouse: true,
    warehouseTransfers: true,
    pos: true,
    draftInvoices: true,
  },
  // Simple mode + the treasury module (صناديق وسندات للمحال الصغيرة).
  simple_plus: {
    installments: true,
    creditScore: false,
    inventory: true,
    multiBranch: false,
    multiWarehouse: false,
    warehouseTransfers: false,
    pos: true,
    draftInvoices: true,
    treasury: true,
    agentPricing: false,
    suppliers: false,
    purchases: false,
    bankAccounts: false,
    generalLedger: false,
    manualJournal: false,
    financialReports: false,
  },
  // Full accounting mode (النمط الكامل للشركات): every module on.
  // accountingPeriods stays off here on purpose — enabling it requires the
  // operator to open a period before any shift/sale works, so it's an explicit
  // opt-in from the wizard/settings rather than a preset surprise.
  full: {
    installments: true,
    creditScore: true,
    inventory: true,
    multiBranch: true,
    multiWarehouse: true,
    warehouseTransfers: true,
    pos: true,
    draftInvoices: true,
    treasury: true,
    bankAccounts: true,
    suppliers: true,
    purchases: true,
    generalLedger: true,
    manualJournal: true,
    agentPricing: true,
    financialReports: true,
    onlineOrders: true,
    shipping: true,
  },
});

/** Presets that imply (and therefore set) the full app mode. */
const FULL_MODE_PRESETS = new Set(['full']);

// Defaults chosen so a fresh install feels like a simple single-branch POS.
// The setup wizard turns on advanced flags when the user asks for them.
export const DEFAULT_FLAGS = Object.freeze({
  installments: true,
  creditScore: true,
  inventory: true,
  // Front-counter modules — on out of the box.
  pos: true,
  draftInvoices: true,
  // Advanced — off by default
  multiBranch: false,
  multiWarehouse: false,
  warehouseTransfers: false,
  // Accounting periods (القيد المحاسبي). OFF by default: when off, financial
  // operations behave exactly as before (period stamping is best-effort/null).
  // When on, a shift/sale/expense/return requires an open period for its scope.
  accountingPeriods: false,
  // Keep operational features on so alerts keep working out of the box
  alerts: true,
  liveOperations: true,
  // ── Accounting suite (البرنامج المحاسبي المتكامل) — all OFF by default so
  // existing installs keep their exact behavior after auto-update. ──────────
  // Treasury: cashboxes + bank accounts + receipt/payment vouchers + transfers
  // (الخزينة: الصناديق والسندات). Allowed in BOTH app modes.
  treasury: false,
  // Bank accounts (الحسابات المصرفية) — full mode only; also needs treasury.
  bankAccounts: false,
  // Supplier master + AP (الموردون) — full mode only.
  suppliers: false,
  // Purchase invoices/returns (المشتريات) — full mode only.
  purchases: false,
  // Chart of accounts + double-entry auto posting (الشجرة المحاسبية والقيود)
  // — full mode only.
  generalLedger: false,
  // Manual journal entries (قيد يدوي) — full mode only; needs generalLedger.
  manualJournal: false,
  // Wholesale/agent customer price tiers (تسعير الوكلاء). Allowed in BOTH modes.
  agentPricing: false,
  // Financial statements: trial balance, P&L, balance sheet... — full mode only.
  financialReports: false,
  // ── Online commerce (التجارة الأونلاين) — OFF by default so existing installs
  // keep their exact behavior after auto-update; an admin enables them from the
  // feature settings. Allowed in BOTH app modes (independent of each other). ──
  // Online order intake from sales channels (الطلبات الأونلاين): the
  // /online-orders page, its reports, and conversion to invoices.
  onlineOrders: false,
  // Shipping & delivery tracking (الشحن): shipments + tracking, carriers
  // (delivery providers), and shipping reports.
  shipping: false,
});

const ALLOWED_KEYS = new Set([...Object.keys(DEFAULT_FLAGS), ...Object.keys(FLAG_ALIASES)]);

/**
 * Decorate the flag map with alias keys so callers (and the frontend) can
 * read either the canonical or spec-aligned name. The canonical key remains
 * the source of truth in storage.
 */
function withAliases(flags) {
  const next = { ...flags };
  for (const [alias, canonical] of Object.entries(FLAG_ALIASES)) {
    next[alias] = next[canonical] !== false;
  }
  return next;
}

/** Resolve any incoming alias keys to their canonical name. */
function normalizeFlagPayload(partial) {
  const next = {};
  for (const [key, value] of Object.entries(partial)) {
    const target = FLAG_ALIASES[key] || key;
    next[target] = value;
  }
  return next;
}

export async function getFeatureFlags() {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  if (!row) return withAliases({ ...DEFAULT_FLAGS });
  try {
    const parsed = JSON.parse(row.value);
    // Merge defaults so newly added flags are always present in the payload.
    const merged = { ...DEFAULT_FLAGS, ...normalizeFlagPayload(parsed) };
    return withAliases(merged);
  } catch {
    return withAliases({ ...DEFAULT_FLAGS });
  }
}

export async function isFeatureEnabled(flag) {
  const flags = await getFeatureFlags();
  // Normalize alias to canonical so callers can pass either name.
  const key = FLAG_ALIASES[flag] || flag;
  return flags[key] !== false;
}

/**
 * Merge the provided partial flag map into the stored flags.
 * Rejects unknown keys so the stored JSON never drifts.
 */
export async function updateFeatureFlags(partial, userId) {
  if (!partial || typeof partial !== 'object') {
    throw new ValidationError('Invalid feature flags payload');
  }

  for (const key of Object.keys(partial)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ValidationError(`Unknown feature flag: ${key}`);
    }
    if (typeof partial[key] !== 'boolean') {
      throw new ValidationError(`Feature flag "${key}" must be a boolean`);
    }
  }

  const normalized = normalizeFlagPayload(partial);

  // Full-only modules cannot be switched on while the install runs in simple
  // mode. Enforced server-side so a tampered client can't unlock them; the
  // stable code lets the frontend render an upgrade call-to-action instead
  // of a generic error.
  const fullOnlyRequested = Object.entries(normalized).filter(
    ([key, value]) => value === true && FULL_MODE_ONLY_SET.has(key)
  );
  if (fullOnlyRequested.length > 0) {
    const mode = await getAppMode();
    if (mode !== APP_MODES.FULL) {
      const err = new ValidationError(
        `Feature "${fullOnlyRequested[0][0]}" requires the full app mode`
      );
      err.statusCode = 403;
      err.code = 'MODE_UPGRADE_REQUIRED';
      err.feature = fullOnlyRequested[0][0];
      throw err;
    }
  }

  const db = await getDb();
  const current = await getFeatureFlags();
  // Strip alias keys before persisting so storage stays canonical.
  const canonicalCurrent = Object.fromEntries(
    Object.entries(current).filter(([k]) => !FLAG_ALIASES[k])
  );
  const next = { ...canonicalCurrent, ...normalized };
  const value = JSON.stringify(next);

  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  if (row) {
    await db
      .update(settings)
      .set({ value, updatedAt: new Date(), updatedBy: userId || null })
      .where(eq(settings.key, SETTINGS_KEY));
  } else {
    await db.insert(settings).values({
      key: SETTINGS_KEY,
      value,
      description: 'Feature toggles for optional product modules',
      updatedBy: userId || null,
    });
  }

  return withAliases(next);
}

/**
 * Throw when the named feature is disabled. The thrown error carries
 * `code = 'FEATURE_DISABLED'` and `statusCode = 403` so the global error
 * handler renders a recognizable JSON body and the frontend can refresh
 * its session/bootstrap.
 */
export async function requireFeature(flag) {
  const enabled = await isFeatureEnabled(flag);
  if (!enabled) {
    const err = new ValidationError(`Feature "${flag}" is disabled`);
    err.statusCode = 403;
    err.code = 'FEATURE_DISABLED';
    err.feature = flag;
    throw err;
  }
}

/** Read/write the setup wizard state (`"pending" | "done"`). */
export async function getSetupMode() {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, SETUP_MODE_KEY)).limit(1);
  return row?.value || 'pending';
}

export async function setSetupMode(value, userId) {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, SETUP_MODE_KEY)).limit(1);
  if (row) {
    await db
      .update(settings)
      .set({ value, updatedAt: new Date(), updatedBy: userId || null })
      .where(eq(settings.key, SETUP_MODE_KEY));
  } else {
    await db.insert(settings).values({
      key: SETUP_MODE_KEY,
      value,
      description: 'First-run setup wizard state',
      updatedBy: userId || null,
    });
  }
}

/** Read the operating mode (`'simple' | 'full'`). Defaults to simple. */
export async function getAppMode() {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, APP_MODE_KEY)).limit(1);
  return row?.value === APP_MODES.FULL ? APP_MODES.FULL : APP_MODES.SIMPLE;
}

/**
 * Set the operating mode. The switch is TWO-WAY and always available:
 *
 *   simple → full : unlocks the advanced suite; flags stay as they are and the
 *                   operator enables the modules they want.
 *   full → simple : a pure VIEW/OPERATION downgrade — it only HIDES the advanced
 *                   suite by turning the full-only module flags off. NO data is
 *                   ever deleted: every supplier/purchase/journal/account row
 *                   stays in place, and re-upgrading re-enables the modules with
 *                   all data intact. Flags that work in both modes (multiBranch,
 *                   multiWarehouse, treasury, accountingPeriods, agentPricing…)
 *                   are left untouched so sales/inventory/shifts/reports keep
 *                   working exactly as before.
 */
export async function setAppMode(value, userId) {
  if (value !== APP_MODES.SIMPLE && value !== APP_MODES.FULL) {
    throw new ValidationError(`Unknown app mode: ${value}`);
  }
  const current = await getAppMode();
  if (current === value) return value;

  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, APP_MODE_KEY)).limit(1);
  if (row) {
    await db
      .update(settings)
      .set({ value, updatedAt: new Date(), updatedBy: userId || null })
      .where(eq(settings.key, APP_MODE_KEY));
  } else {
    await db.insert(settings).values({
      key: APP_MODE_KEY,
      value,
      description: 'Operating mode: simple (small shops) or full (companies)',
      updatedBy: userId || null,
    });
  }

  // Downgrading to simple HIDES the advanced suite: switch the full-only module
  // flags off so menus / routes / capabilities reflect simple mode. This is a
  // display/operation layer only — the underlying rows are never touched, so
  // re-upgrading restores everything. Turning a flag OFF is always permitted
  // (the mode guard in updateFeatureFlags only blocks turning them ON).
  if (value === APP_MODES.SIMPLE) {
    const off = Object.fromEntries(FULL_MODE_ONLY_FLAGS.map((f) => [f, false]));
    await updateFeatureFlags(off, userId);
  }

  return value;
}

/**
 * Apply a preset bundle (`simple` | `installments` | `multi_branch` |
 * `simple_plus` | `full`) and mark setup as done. Presets bundling full-only
 * modules flip the app mode to `full` first so the mode guard lets them
 * through. Returns the resulting flags.
 */
export async function applySetupPreset(preset, userId) {
  const bundle = SETUP_PRESETS[preset];
  if (!bundle) throw new ValidationError(`Unknown setup preset: ${preset}`);
  if (FULL_MODE_PRESETS.has(preset)) {
    await setAppMode(APP_MODES.FULL, userId);
  }
  const next = await updateFeatureFlags(bundle, userId);
  await setSetupMode('done', userId);
  return next;
}

export default {
  DEFAULT_FLAGS,
  SETUP_PRESETS,
  APP_MODES,
  FULL_MODE_ONLY_FLAGS,
  getFeatureFlags,
  isFeatureEnabled,
  updateFeatureFlags,
  requireFeature,
  getSetupMode,
  setSetupMode,
  getAppMode,
  setAppMode,
  applySetupPreset,
};
