import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  describePermission,
  actionNameAr,
  resourceOf,
  resourceNameAr,
} from '../src/auth/permissionActions.js';

/**
 * Unit coverage for the central operation/resource map that powers the rich
 * 403 (PERMISSION_DENIED) payload. No DB needed — pure key → description logic.
 */

test('describePermission derives action + resource from a catalog key', () => {
  const d = describePermission('users:delete');
  assert.equal(d.action, 'حذف مستخدم');
  assert.equal(d.resource, 'users');
  assert.equal(d.resourceNameAr, 'المستخدمين');
  assert.equal(d.requiredPermission, 'users:delete');
  assert.match(d.reason, /users:delete/);
  assert.ok(d.reason.length > 0 && d.suggestion.length > 0, 'reason & suggestion are populated');
});

test('describePermission accepts the dotted (spec) form and normalises it', () => {
  const d = describePermission('users.delete');
  assert.equal(d.action, 'حذف مستخدم');
  assert.equal(d.requiredPermission, 'users:delete');
});

test('describePermission resolves view:* keys to the right resource', () => {
  const d = describePermission('view:users');
  assert.equal(d.resource, 'users');
  assert.equal(d.resourceNameAr, 'المستخدمين');
});

test('describePermission synthesises a name for keys missing from the catalog', () => {
  // warehouses:* are not in the catalog → verb + resource fallback.
  assert.equal(resourceOf('warehouses:create'), 'warehouses');
  assert.equal(resourceNameAr('warehouses'), 'المخازن');
  assert.equal(actionNameAr('warehouses:create'), 'إضافة المخازن');
});

test('describePermission honours explicit { action, resource } overrides', () => {
  const d = describePermission('users:delete', { action: 'حذف موظف', resource: 'users' });
  assert.equal(d.action, 'حذف موظف');
  assert.match(d.reason, /حذف موظف/);
});

test('global-admin-only keys get a tailored suggestion', () => {
  const d = describePermission('gl:manage_system_accounts');
  assert.match(d.suggestion, /المدير العام/);
});

test('every backend resource has an Arabic name (requirement #7 coverage)', () => {
  const resources = [
    'users', 'roles', 'sales', 'products', 'inventory', 'expenses', 'reports',
    'settings', 'backups', 'branches', 'warehouses',
  ];
  for (const r of resources) {
    const name = resourceNameAr(r);
    assert.notEqual(name, r, `resource "${r}" must have an Arabic name`);
  }
});
