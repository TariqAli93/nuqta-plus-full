import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteLocation, moduleKeyForTarget } from '../src/commands/navigationTarget.js';
import { createPageActionRegistry } from '../src/commands/pageActionCore.js';
import { appCatalog } from '../src/commands/catalog.js';
import { navCommandsFromRegistry } from '../src/commands/navCommands.js';
import { globalCommands } from '../src/commands/globalCommands.js';
import { pageCommands } from '../src/commands/pageCommands.js';
import { customerCommands } from '../src/features/customers/commands/customerCommands.js';

/**
 * Command execution engine: navigation targets, the lifecycle-aware Page Action
 * Registry (run-once, no setTimeout), and the catalog's real-action contracts.
 *   node --test test/commandExecution.test.mjs
 */

// ── Navigation target → router location ─────────────────────────────────────
test('buildRouteLocation: routeName + tab → query.tab (stable id, not index)', () => {
  assert.deepEqual(buildRouteLocation({ routeName: 'Settings', tab: 'backup' }), {
    name: 'Settings',
    query: { tab: 'backup' },
  });
});

test('buildRouteLocation: path + params + extra query + hash', () => {
  assert.deepEqual(
    buildRouteLocation({ path: '/x', params: { id: 5 }, query: { a: 1 }, panel: 'p', hash: 'h' }),
    { path: '/x', params: { id: 5 }, query: { a: 1, panel: 'p' }, hash: '#h' }
  );
});

test('moduleKeyForTarget: route name lowercased / path first segment', () => {
  assert.equal(moduleKeyForTarget({ routeName: 'Settings' }), 'settings');
  assert.equal(moduleKeyForTarget({ path: '/products/5/edit' }), 'products');
  assert.equal(moduleKeyForTarget({ routeName: 'X', moduleKey: 'custom' }), 'custom');
});

// ── Page Action Registry — run-once lifecycle ───────────────────────────────
test('pending action set BEFORE the page registers runs once on flush', async () => {
  const reg = createPageActionRegistry();
  let ran = 0;

  // Command navigates: pending set before the destination page mounts.
  reg.setPending('settings', 'backup.create', { a: 1 }, 'e1');
  // Navigator's immediate flush finds no handler yet → pending stays.
  assert.deepEqual(await reg.flush('settings'), { ran: false, reason: 'no-handler' });
  assert.ok(reg.pending, 'pending preserved until the page is ready');

  // Page mounts → registers → flush runs the real handler exactly once.
  reg.register('settings', { 'backup.create': (payload) => { ran += 1; assert.deepEqual(payload, { a: 1 }); } });
  const r1 = await reg.flush('settings');
  assert.deepEqual(r1, { ran: true, action: 'backup.create', executionId: 'e1' });
  assert.equal(ran, 1);

  // No double execution.
  assert.deepEqual(await reg.flush('settings'), { ran: false, reason: 'no-pending' });
  assert.equal(ran, 1);
});

test('flush is keyed — a pending action only runs for its own module', async () => {
  const reg = createPageActionRegistry();
  let ran = 0;
  reg.register('products', { refresh: () => (ran += 1) });
  reg.setPending('products', 'refresh', null, 'e2');
  assert.deepEqual(await reg.flush('settings'), { ran: false, reason: 'no-pending' });
  assert.equal(ran, 0);
  assert.equal((await reg.flush('products')).ran, true);
  assert.equal(ran, 1);
});

test('re-running the same executionId is blocked (idempotent)', async () => {
  const reg = createPageActionRegistry();
  let ran = 0;
  reg.register('m', { go: () => (ran += 1) });
  reg.setPending('m', 'go', null, 'dup');
  await reg.flush('m');
  reg.setPending('m', 'go', null, 'dup'); // same id again
  assert.equal((await reg.flush('m')).reason, 'already-run');
  assert.equal(ran, 1);
});

test('unregister removes only the entries it added', () => {
  const reg = createPageActionRegistry();
  const off = reg.register('m', { a: () => {}, b: () => {} });
  reg.register('m', { c: () => {} });
  off();
  assert.equal(reg.has('m', 'a'), false);
  assert.equal(reg.has('m', 'c'), true, 'other registration survives');
});

// ── Catalog contracts — real actions, not bare routes ───────────────────────
const allCommands = [
  ...globalCommands,
  ...pageCommands,
  ...customerCommands,
  ...appCatalog,
  ...navCommandsFromRegistry,
];
const byId = Object.fromEntries(allCommands.map((c) => [c.id, c]));

test('all command ids are unique across every registry', () => {
  const ids = allCommands.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('registry-derived nav commands open the module by path', async () => {
  const calls = [];
  await byId['nav.products'].execute({ app: { navigate: (t) => calls.push(t) } });
  assert.deepEqual(calls.at(-1), { path: '/products' });
});

test('open vs operation backup commands are separate and target the backup tab', async () => {
  const calls = [];
  const ctx = { selection: [], app: { navigate: (t) => calls.push(t) } };

  await byId['settings.backup.open'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Settings', tab: 'backup' });

  await byId['settings.backup.create'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Settings', tab: 'backup', action: 'backup.create' });

  await byId['settings.backup.restore'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Settings', tab: 'backup', action: 'backup.restore' });
});

test('app.backup opens the backup TAB (not just the settings page)', async () => {
  const calls = [];
  await byId['app.backup'].execute({ app: { navigate: (t) => calls.push(t) } });
  assert.deepEqual(calls[0], { routeName: 'Settings', tab: 'backup' });
});

test('report commands actually open the report window', async () => {
  const calls = [];
  await byId['reports.sales'].execute({ app: { openReport: (t) => calls.push(t) } });
  assert.deepEqual(calls, ['sales']);
});

test('operation commands target a page action (navigate + action), not a bare route', async () => {
  const calls = [];
  const ctx = { app: { navigate: (t) => calls.push(t) } };
  await byId['products.export'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Products', action: 'export' });
  await byId['products.refresh'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Products', action: 'refresh' });
  await byId['customers.export'].execute(ctx);
  assert.deepEqual(calls.at(-1), { routeName: 'Customers', action: 'export' });
});

test('selection-dependent command is disabled with a clear reason when nothing is selected', () => {
  const cmd = byId['products.edit-selected'];
  assert.equal(cmd.enabled({ selection: [] }), false);
  assert.equal(cmd.enabled({ selection: [{ id: 1 }] }), true);
  assert.match(cmd.disabledReason, /حدد/);
});

test('gated commands carry an RBAC permission (no inline auth logic)', () => {
  for (const id of ['nav.products', 'settings.backup.create', 'reports.profit', 'admin.add-user']) {
    assert.ok(byId[id].permission, `${id} must declare a permission`);
  }
});

test('every catalog command has an execute function + Arabic title', () => {
  for (const c of appCatalog) {
    assert.equal(typeof c.execute, 'function', `${c.id} execute`);
    assert.ok(c.title && /[؀-ۿ]/.test(c.title), `${c.id} Arabic title`);
  }
});
