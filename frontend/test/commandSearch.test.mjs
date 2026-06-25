import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeText,
  commandHaystack,
  scoreCommand,
  searchCommands,
} from '../src/commands/commandSearch.js';
import { getDisabledReason, isCommandEnabled } from '../src/commands/core.js';

/**
 * Command-palette search, Arabic normalization, and disabled-reason resolution.
 *   node --test test/commandSearch.test.mjs
 */

const noop = () => {};

// ── Normalization ───────────────────────────────────────────────────────────
test('normalizeText: lowercases, trims and collapses whitespace', () => {
  assert.equal(normalizeText('  Open   Settings  '), 'open settings');
  assert.equal(normalizeText('ENGLISH'), 'english');
});

test('normalizeText: folds Arabic alef/yaa/taa-marbuta and strips diacritics', () => {
  assert.equal(normalizeText('الإعدادات'), 'الاعدادات'); // إ → ا
  assert.equal(normalizeText('أحمد'), 'احمد'); // أ → ا
  assert.equal(normalizeText('مُحَمَّد'), 'محمد'); // diacritics removed
  assert.equal(normalizeText('علــــي'), 'علي'); // tatweel removed
  assert.equal(normalizeText(' صفحة'), 'صفحه'); // ة → ه
  assert.equal(normalizeText('مصطفى'), 'مصطفي'); // ى → ي
});

// ── Haystack covers all searchable fields ───────────────────────────────────
test('commandHaystack includes title, description, keywords, group, shortcut, id', () => {
  const hay = commandHaystack({
    id: 'app.open-settings',
    title: 'فتح الإعدادات',
    description: 'تهيئة النظام',
    keywords: ['settings', 'config'],
    group: 'تنقّل',
    shortcut: 'Ctrl+,',
  });
  for (const needle of ['فتح', 'الاعدادات', 'تهيئه', 'settings', 'config', 'تنقل', 'app.open-settings']) {
    assert.ok(hay.includes(normalizeText(needle)), `haystack should contain "${needle}"`);
  }
});

// ── Search behaviour ────────────────────────────────────────────────────────
const cmds = [
  { id: 'app.open-settings', title: 'فتح الإعدادات', keywords: ['settings'], group: 'تنقّل', execute: noop },
  { id: 'app.logout', title: 'تسجيل الخروج', keywords: ['logout'], group: 'حساب', execute: noop },
  { id: 'customers.create', title: 'إضافة عميل', keywords: ['customer', 'new'], group: 'إجراءات', execute: noop },
];

test('searchCommands: empty query returns all (unchanged)', () => {
  assert.equal(searchCommands(cmds, '   ').length, 3);
});

test('searchCommands: partial Arabic match ignoring hamza/diacritics', () => {
  const res = searchCommands(cmds, 'اعدادات'); // user omits the hamza
  assert.equal(res[0].id, 'app.open-settings');
});

test('searchCommands: English keyword match', () => {
  const res = searchCommands(cmds, 'logout');
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 'app.logout');
});

test('searchCommands: multi-token AND across fields', () => {
  // "عميل" (title) + "new" (keyword) both must match the same command.
  const res = searchCommands(cmds, 'عميل new');
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 'customers.create');
});

test('searchCommands: no match → empty', () => {
  assert.deepEqual(searchCommands(cmds, 'zzz-nope'), []);
});

test('scoreCommand: title-prefix ranks above incidental hits', () => {
  const titlePrefix = scoreCommand({ title: 'تسجيل الخروج', keywords: [] }, ['تسجيل']);
  const keywordOnly = scoreCommand({ title: 'شيء آخر', keywords: ['تسجيل'] }, ['تسجيل']);
  assert.ok(titlePrefix > keywordOnly);
});

// ── Disabled reason ─────────────────────────────────────────────────────────
const ctx = { hasPermission: () => true, route: '/', selection: [] };

test('getDisabledReason: null when enabled', () => {
  assert.equal(getDisabledReason({ id: 'a', execute: noop }, ctx), null);
});

test('getDisabledReason: uses string reason when disabled', () => {
  const cmd = { id: 'a', execute: noop, enabled: () => false, disabledReason: 'يلزم تحديد عنصر' };
  assert.equal(isCommandEnabled(cmd, ctx), false);
  assert.equal(getDisabledReason(cmd, ctx), 'يلزم تحديد عنصر');
});

test('getDisabledReason: supports a function reason, with generic fallback', () => {
  const fn = { id: 'a', execute: noop, enabled: () => false, disabledReason: (c) => `مغلق على ${c.route}` };
  assert.equal(getDisabledReason(fn, ctx), 'مغلق على /');

  const generic = { id: 'b', execute: noop, enabled: () => false };
  assert.equal(getDisabledReason(generic, ctx), 'غير متاح حالياً');
});
