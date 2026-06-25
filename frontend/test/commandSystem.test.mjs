import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommandRegistry,
  isCommandVisible,
  isCommandEnabled,
  matchesRoute,
  matchesScope,
  resolveVisibleCommands,
  runCommand,
} from '../src/commands/core.js';
import { globalCommands } from '../src/commands/globalCommands.js';
import { pageCommands } from '../src/commands/pageCommands.js';
import { customerCommands } from '../src/features/customers/commands/customerCommands.js';

/**
 * Unit tests for the central command system core (registration, RBAC,
 * enabled state, scope and execution). Pure — no Vue / Pinia / DOM.
 *
 *   node --test test/commandSystem.test.mjs
 */

// Helper: a context where the user holds the listed permissions.
const ctxWith = ({ perms = [], route = '/', selection = [] } = {}) => ({
  hasPermission: (p) => {
    const list = Array.isArray(p) ? p : [p];
    return list.some((x) => perms.includes(x));
  },
  route,
  selection,
});

const noop = () => {};

// ── Registration ──────────────────────────────────────────────────────────
test('register / get / has / list / size', () => {
  const reg = createCommandRegistry();
  assert.equal(reg.size, 0);

  reg.register({ id: 'a', title: 'A', execute: noop });
  reg.register({ id: 'b', title: 'B', execute: noop });

  assert.equal(reg.size, 2);
  assert.equal(reg.has('a'), true);
  assert.equal(reg.get('a').title, 'A');
  assert.equal(reg.get('missing'), null);
  assert.deepEqual(
    reg.list().map((c) => c.id),
    ['a', 'b']
  );
});

test('register throws without an id or execute()', () => {
  const reg = createCommandRegistry();
  assert.throws(() => reg.register({ title: 'no id', execute: noop }), /non-empty string id/);
  assert.throws(() => reg.register({ id: '', execute: noop }), /non-empty string id/);
  assert.throws(() => reg.register({ id: 'x', title: 'x' }), /must have an execute/);
});

test('re-registering an id is last-writer-wins', () => {
  const reg = createCommandRegistry();
  reg.register({ id: 'a', title: 'first', execute: noop });
  reg.register({ id: 'a', title: 'second', execute: noop });
  assert.equal(reg.size, 1);
  assert.equal(reg.get('a').title, 'second');
});

test('register() returns an unregister fn; only removes its own definition', () => {
  const reg = createCommandRegistry();
  const off = reg.register({ id: 'a', title: 'A1', execute: noop });
  // Replace with a new definition; the old off() must NOT remove the new one.
  reg.register({ id: 'a', title: 'A2', execute: noop });
  off();
  assert.equal(reg.has('a'), true);
  assert.equal(reg.get('a').title, 'A2');
});

test('registerMany returns an unregister-all fn', () => {
  const reg = createCommandRegistry();
  const off = reg.registerMany([
    { id: 'a', title: 'A', execute: noop },
    { id: 'b', title: 'B', execute: noop },
  ]);
  assert.equal(reg.size, 2);
  off();
  assert.equal(reg.size, 0);
});

test('subscribe fires on registry mutations', () => {
  const reg = createCommandRegistry();
  let calls = 0;
  const unsub = reg.subscribe(() => (calls += 1));
  reg.register({ id: 'a', title: 'A', execute: noop });
  reg.unregister('a');
  assert.equal(calls, 2);
  unsub();
  reg.register({ id: 'b', title: 'B', execute: noop });
  assert.equal(calls, 2, 'no more notifications after unsubscribe');
});

// ── Permissions (RBAC) ──────────────────────────────────────────────────────
test('permission gating hides commands the user lacks', () => {
  const cmd = { id: 'c', title: 'C', permission: 'view:settings', execute: noop };
  assert.equal(isCommandVisible(cmd, ctxWith({ perms: [] })), false);
  assert.equal(isCommandVisible(cmd, ctxWith({ perms: ['view:settings'] })), true);
});

test('array permission is ANY-of', () => {
  const cmd = { id: 'c', title: 'C', permission: ['a:read', 'b:read'], execute: noop };
  assert.equal(isCommandVisible(cmd, ctxWith({ perms: ['b:read'] })), true);
  assert.equal(isCommandVisible(cmd, ctxWith({ perms: ['z:read'] })), false);
});

test('commands with no permission are visible to everyone', () => {
  const cmd = { id: 'c', title: 'C', execute: noop };
  assert.equal(isCommandVisible(cmd, ctxWith({ perms: [] })), true);
});

// ── Scope / route matching ──────────────────────────────────────────────────
test('matchesRoute: unrestricted vs restricted', () => {
  assert.equal(matchesRoute({ id: 'x', execute: noop }, '/anything'), true);
  const cmd = { id: 'x', routes: ['/customers'], execute: noop };
  assert.equal(matchesRoute(cmd, '/customers'), true);
  assert.equal(matchesRoute(cmd, '/customers/5'), true);
  assert.equal(matchesRoute(cmd, '/products'), false);
});

test('scope: global always, route by path, selection needs a selection', () => {
  const global = { id: 'g', scope: 'global', execute: noop };
  const route = { id: 'r', scope: 'route', routes: ['/customers'], execute: noop };
  const sel = { id: 's', scope: 'selection', routes: ['/customers'], execute: noop };

  assert.equal(matchesScope(global, ctxWith({ route: '/x' })), true);
  assert.equal(matchesScope(route, ctxWith({ route: '/customers' })), true);
  assert.equal(matchesScope(route, ctxWith({ route: '/products' })), false);

  assert.equal(matchesScope(sel, ctxWith({ route: '/customers', selection: [] })), false);
  assert.equal(matchesScope(sel, ctxWith({ route: '/customers', selection: [{ id: 1 }] })), true);
  assert.equal(matchesScope(sel, ctxWith({ route: '/products', selection: [{ id: 1 }] })), false);
});

test('resolveVisibleCommands filters by permission + scope together', () => {
  const list = [
    { id: 'pub', scope: 'global', execute: noop },
    { id: 'gated', scope: 'global', permission: 'p', execute: noop },
    { id: 'oncustomers', scope: 'route', routes: ['/customers'], execute: noop },
  ];
  const visible = resolveVisibleCommands(list, ctxWith({ perms: [], route: '/products' }));
  assert.deepEqual(
    visible.map((c) => c.id),
    ['pub']
  );
  const visible2 = resolveVisibleCommands(list, ctxWith({ perms: ['p'], route: '/customers' }));
  assert.deepEqual(
    visible2.map((c) => c.id).sort(),
    ['gated', 'oncustomers', 'pub']
  );
});

// ── Enabled state ───────────────────────────────────────────────────────────
test('enabled() predicate controls actionability; defaults to true', () => {
  assert.equal(isCommandEnabled({ id: 'a', execute: noop }, ctxWith()), true);
  const cmd = {
    id: 'a',
    execute: noop,
    enabled: (ctx) => ctx.selection.length > 0,
  };
  assert.equal(isCommandEnabled(cmd, ctxWith({ selection: [] })), false);
  assert.equal(isCommandEnabled(cmd, ctxWith({ selection: [1] })), true);
});

test('predicate errors fail closed (hidden / disabled)', () => {
  const throwing = () => {
    throw new Error('boom');
  };
  assert.equal(isCommandVisible({ id: 'a', execute: noop, visible: throwing }, ctxWith()), false);
  assert.equal(isCommandEnabled({ id: 'a', execute: noop, enabled: throwing }, ctxWith()), false);
});

// ── Execution + central error capture + lifecycle ──────────────────────────
test('runCommand executes and reports success', async () => {
  let ran = 0;
  const cmd = { id: 'a', title: 'A', execute: () => (ran += 1) };
  const events = [];
  const res = await runCommand(cmd, ctxWith(), {
    onStart: () => events.push('start'),
    onSuccess: () => events.push('success'),
    onSettled: () => events.push('settled'),
  });
  assert.equal(ran, 1);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(events, ['start', 'success', 'settled']);
});

test('runCommand captures execute() errors centrally (never throws)', async () => {
  const err = new Error('failed-hard');
  const cmd = {
    id: 'a',
    title: 'A',
    execute: () => {
      throw err;
    },
  };
  let captured = null;
  const events = [];
  const res = await runCommand(cmd, ctxWith(), {
    onStart: () => events.push('start'),
    onError: (e) => (captured = e),
    onSettled: () => events.push('settled'),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, err);
  assert.equal(captured, err, 'error surfaced to onError for user messaging');
  assert.deepEqual(events, ['start', 'settled'], 'loading is always cleared via onSettled');
});

test('runCommand awaits async execute() and tracks loading across the await', async () => {
  let loading = false;
  let seenWhileRunning = null;
  const cmd = {
    id: 'a',
    title: 'A',
    execute: async () => {
      seenWhileRunning = loading; // captured during execution
      await Promise.resolve();
    },
  };
  await runCommand(cmd, ctxWith(), {
    onStart: () => (loading = true),
    onSettled: () => (loading = false),
  });
  assert.equal(seenWhileRunning, true, 'loading flag was set before execute ran');
  assert.equal(loading, false, 'loading flag cleared after settle');
});

test('runCommand skips a disabled command without executing', async () => {
  let ran = 0;
  const cmd = { id: 'a', title: 'A', execute: () => (ran += 1), enabled: () => false };
  const res = await runCommand(cmd, ctxWith());
  assert.equal(ran, 0);
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'disabled');
});

test('runCommand skips a not-visible command', async () => {
  let ran = 0;
  const cmd = { id: 'a', title: 'A', permission: 'p', execute: () => (ran += 1) };
  const res = await runCommand(cmd, ctxWith({ perms: [] }));
  assert.equal(ran, 0);
  assert.equal(res.reason, 'not-visible');
});

test('runCommand reports a not-found command via onError', async () => {
  let captured = 'none';
  const res = await runCommand(null, ctxWith(), { onError: (e) => (captured = e) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not-found');
  assert.ok(captured instanceof Error);
});

// ── Built-in command definitions ───────────────────────────────────────────
test('global + page command ids are unique and well-formed', () => {
  const all = [...globalCommands, ...pageCommands, ...customerCommands];
  const ids = all.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate command ids');
  for (const cmd of all) {
    assert.ok(cmd.id && typeof cmd.id === 'string', `id for ${cmd.title}`);
    assert.ok(cmd.title && typeof cmd.title === 'string', `title for ${cmd.id}`);
    assert.equal(typeof cmd.execute, 'function', `execute for ${cmd.id}`);
  }
});

test('global commands dispatch through ctx.app (no direct side effects)', async () => {
  const calls = [];
  const ctx = ctxWith();
  ctx.app = {
    navigate: (to) => calls.push(['navigate', to]),
    refreshWorkspace: () => calls.push(['refresh']),
    toggleTheme: () => calls.push(['theme']),
    openCommandPalette: () => calls.push(['palette']),
    logout: () => calls.push(['logout']),
    print: () => calls.push(['print']),
  };
  const byId = Object.fromEntries([...globalCommands].map((c) => [c.id, c]));

  await byId['app.go-dashboard'].execute(ctx);
  await byId['app.open-settings'].execute(ctx);
  await byId['app.refresh'].execute(ctx);
  await byId['app.toggle-theme'].execute(ctx);
  await byId['app.command-palette'].execute(ctx);
  await byId['app.logout'].execute(ctx);

  assert.deepEqual(calls, [
    ['navigate', '/'],
    ['navigate', '/settings'],
    ['refresh'],
    ['theme'],
    ['palette'],
    ['logout'],
  ]);
});

test('page create commands are route + permission gated and navigate to /new', async () => {
  const create = pageCommands.find((c) => c.id === 'products.create');
  assert.ok(create);
  // Hidden off-route or without permission; visible on-route with permission.
  assert.equal(isCommandVisible(create, ctxWith({ perms: ['products:create'], route: '/customers' })), false);
  assert.equal(isCommandVisible(create, ctxWith({ perms: [], route: '/products' })), false);
  assert.equal(isCommandVisible(create, ctxWith({ perms: ['products:create'], route: '/products' })), true);

  const calls = [];
  const ctx = ctxWith();
  ctx.app = { navigate: (to) => calls.push(to) };
  await create.execute(ctx);
  assert.deepEqual(calls, ['/products/new']);
});

test('customers.create is owned by the customers feature (migrated out of pageCommands)', async () => {
  // Migrated during the features/ restructure — must NOT linger in pageCommands.
  assert.equal(
    pageCommands.find((c) => c.id === 'customers.create'),
    undefined
  );
  const create = customerCommands.find((c) => c.id === 'customers.create');
  assert.ok(create, 'lives in features/customers/commands');
  assert.equal(isCommandVisible(create, ctxWith({ perms: ['customers:create'], route: '/customers' })), true);
  assert.equal(isCommandVisible(create, ctxWith({ perms: [], route: '/customers' })), false);

  const calls = [];
  const ctx = ctxWith();
  ctx.app = { navigate: (to) => calls.push(to) };
  await create.execute(ctx);
  assert.deepEqual(calls, ['/customers/new']);
});
