import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import featureFlagsService, {
  DEFAULT_FLAGS,
  SETUP_PRESETS,
  APP_MODES,
  FULL_MODE_ONLY_FLAGS,
} from '../src/services/featureFlagsService.js';
import { getUserCapabilities } from '../src/services/permissionService.js';

/**
 * App mode (نمطا العمل) + accounting-suite flag tests.
 *
 * Saves and restores the three settings keys it touches (feature_flags,
 * app_mode, setup_mode) so the suite leaves no trace — per the repo's
 * flag-restore convention.
 */

const KEYS = ['feature_flags', 'app_mode', 'setup_mode'];
const original = {};
let user;

async function readSetting(pool, key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(pool, key, value) {
  if (value === null) {
    await pool.query('DELETE FROM settings WHERE key = $1', [key]);
  } else {
    await pool.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2, 'test')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

before(async () => {
  const pool = await getPool();
  for (const key of KEYS) original[key] = await readSetting(pool, key);

  // Start from a known state: defaults + simple mode.
  await writeSetting(pool, 'feature_flags', JSON.stringify({ ...DEFAULT_FLAGS }));
  await writeSetting(pool, 'app_mode', null);
  user = { id: null, role: 'admin', username: 'app-mode-test' };
});

after(async () => {
  const pool = await getPool();
  for (const key of KEYS) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('defaults: new accounting-suite flags exist and are OFF', async () => {
  for (const key of [
    'treasury',
    'bankAccounts',
    'suppliers',
    'purchases',
    'generalLedger',
    'manualJournal',
    'agentPricing',
    'financialReports',
  ]) {
    assert.equal(DEFAULT_FLAGS[key], false, `DEFAULT_FLAGS.${key} must be false`);
  }
  const flags = await featureFlagsService.getFeatureFlags();
  assert.equal(flags.generalLedger, false);
  assert.equal(flags.treasury, false);
});

test('default app mode is simple', async () => {
  assert.equal(await featureFlagsService.getAppMode(), APP_MODES.SIMPLE);
});

test('simple mode: enabling a full-only flag throws MODE_UPGRADE_REQUIRED', async () => {
  for (const flag of FULL_MODE_ONLY_FLAGS) {
    await assert.rejects(
      featureFlagsService.updateFeatureFlags({ [flag]: true }, null),
      (err) => {
        assert.equal(err.code, 'MODE_UPGRADE_REQUIRED', `${flag} must be mode-locked`);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  }
  // Turning a full-only flag OFF is always allowed (no-op safe).
  const next = await featureFlagsService.updateFeatureFlags({ suppliers: false }, null);
  assert.equal(next.suppliers, false);
});

test('simple mode: treasury and agentPricing are allowed', async () => {
  const next = await featureFlagsService.updateFeatureFlags(
    { treasury: true, agentPricing: true },
    null
  );
  assert.equal(next.treasury, true);
  assert.equal(next.agentPricing, true);
  await featureFlagsService.updateFeatureFlags({ treasury: false, agentPricing: false }, null);
});

test('capabilities reflect the new flags (admin role)', async () => {
  let caps = await getUserCapabilities(user);
  assert.equal(caps.canUseTreasury, false);
  assert.equal(caps.canUseGL, false);
  assert.equal(caps.canUseSuppliers, false);

  await featureFlagsService.updateFeatureFlags({ treasury: true }, null);
  caps = await getUserCapabilities(user);
  assert.equal(caps.canUseTreasury, true);
  assert.equal(caps.canManageTreasury, true);
  // bankAccounts still off → no bank capability even with treasury on.
  assert.equal(caps.canUseBankAccounts, false);
  await featureFlagsService.updateFeatureFlags({ treasury: false }, null);
});

test('capabilities: cashier gets treasury use but not manage', async () => {
  await featureFlagsService.updateFeatureFlags({ treasury: true }, null);
  const caps = await getUserCapabilities({ id: null, role: 'cashier' });
  assert.equal(caps.canUseTreasury, true);
  assert.equal(caps.canManageTreasury, false);
  await featureFlagsService.updateFeatureFlags({ treasury: false }, null);
});

test('simple_plus preset: treasury on, full-only modules stay off, mode stays simple', async () => {
  const flags = await featureFlagsService.applySetupPreset('simple_plus', null);
  assert.equal(flags.treasury, true);
  assert.equal(flags.installments, true);
  assert.equal(flags.suppliers, false);
  assert.equal(flags.generalLedger, false);
  assert.equal(await featureFlagsService.getAppMode(), APP_MODES.SIMPLE);
  assert.equal(await featureFlagsService.getSetupMode(), 'done');
});

test('full preset: flips mode to full and enables the suite', async () => {
  const flags = await featureFlagsService.applySetupPreset('full', null);
  assert.equal(await featureFlagsService.getAppMode(), APP_MODES.FULL);
  for (const key of ['treasury', 'bankAccounts', 'suppliers', 'purchases', 'generalLedger', 'manualJournal', 'agentPricing', 'financialReports']) {
    assert.equal(flags[key], true, `full preset must enable ${key}`);
  }
  // accountingPeriods is an explicit opt-in, not part of the preset.
  assert.equal(flags.accountingPeriods, false);
});

test('full mode: full-only flags toggle freely', async () => {
  let next = await featureFlagsService.updateFeatureFlags({ suppliers: false }, null);
  assert.equal(next.suppliers, false);
  next = await featureFlagsService.updateFeatureFlags({ suppliers: true }, null);
  assert.equal(next.suppliers, true);
});

test('downgrade full → simple hides the full-only suite but keeps both-mode flags', async () => {
  // Precondition: previous tests left us in FULL with the suite enabled.
  assert.equal(await featureFlagsService.getAppMode(), APP_MODES.FULL);
  // Enable a both-mode flag so we can prove it is NOT cleared on downgrade.
  await featureFlagsService.updateFeatureFlags({ treasury: true }, null);

  const mode = await featureFlagsService.setAppMode(APP_MODES.SIMPLE, null);
  assert.equal(mode, APP_MODES.SIMPLE);
  assert.equal(await featureFlagsService.getAppMode(), APP_MODES.SIMPLE);

  const flags = await featureFlagsService.getFeatureFlags();
  // Full-only modules are turned OFF (hidden) on downgrade…
  for (const f of FULL_MODE_ONLY_FLAGS) {
    assert.equal(flags[f], false, `${f} must be hidden in simple mode`);
  }
  // …but flags allowed in both modes are left untouched (no data/UX break).
  assert.equal(flags.treasury, true, 'treasury must survive the downgrade');
});

test('round trip full → simple → full re-enables module toggling', async () => {
  // We are in SIMPLE (from the previous test). Enabling a full-only flag is blocked…
  await assert.rejects(
    featureFlagsService.updateFeatureFlags({ suppliers: true }, null),
    (err) => err.code === 'MODE_UPGRADE_REQUIRED'
  );
  // …upgrade back to full and it works again, with no data lost.
  const mode = await featureFlagsService.setAppMode(APP_MODES.FULL, null);
  assert.equal(mode, APP_MODES.FULL);
  const next = await featureFlagsService.updateFeatureFlags({ suppliers: true }, null);
  assert.equal(next.suppliers, true);
  await featureFlagsService.updateFeatureFlags({ treasury: false }, null);
});

test('all setup presets only reference known flags', () => {
  for (const [name, bundle] of Object.entries(SETUP_PRESETS)) {
    for (const key of Object.keys(bundle)) {
      assert.ok(
        key in DEFAULT_FLAGS,
        `preset "${name}" references unknown flag "${key}"`
      );
    }
  }
});
