import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  firstDueOnOrAfter,
  nextOccurrenceAfter,
  RECURRENCE_FREQUENCIES,
} from '../src/services/recurringExpensesService.js';
import { hasPermission } from '../src/auth/permissionMatrix.js';

/**
 * Recurrence-engine unit tests (المصاريف الثابتة).
 *
 * Pure date-math + RBAC assertions only — no DB. The generation engine that
 * writes rows is exercised by the date helpers below plus the idempotency
 * guard (unique index on expenses(recurring_expense_id, expense_date)).
 */

const d = (s) => {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const str = (dt) => dt.toISOString().slice(0, 10);

test('frequencies are the four expected values', () => {
  assert.deepEqual([...RECURRENCE_FREQUENCIES], ['daily', 'weekly', 'monthly', 'yearly']);
});

test('daily: firstDue is the base; next is +1 day', () => {
  const rule = { frequency: 'daily' };
  assert.equal(str(firstDueOnOrAfter(d('2026-06-21'), rule)), '2026-06-21');
  assert.equal(str(nextOccurrenceAfter(d('2026-06-21'), rule)), '2026-06-22');
  // Month rollover.
  assert.equal(str(nextOccurrenceAfter(d('2026-06-30'), rule)), '2026-07-01');
});

test('weekly: aligns to the requested day of week, then +7', () => {
  // 2026-06-21 is a Sunday (getUTCDay 0). Target Thursday (4).
  const rule = { frequency: 'weekly', dayOfWeek: 4 };
  const first = firstDueOnOrAfter(d('2026-06-21'), rule);
  assert.equal(first.getUTCDay(), 4);
  assert.equal(str(first), '2026-06-25'); // the coming Thursday
  assert.equal(str(nextOccurrenceAfter(first, rule)), '2026-07-02');
  // When base already lands on the target day, firstDue is that same day.
  const onDay = firstDueOnOrAfter(d('2026-06-25'), rule);
  assert.equal(str(onDay), '2026-06-25');
});

test('monthly: lands on day-of-month; rolls to next month when past', () => {
  const rule = { frequency: 'monthly', dayOfMonth: 5 };
  // Start mid-month → next 5th is next month.
  assert.equal(str(firstDueOnOrAfter(d('2026-06-21'), rule)), '2026-07-05');
  // Start before the 5th → this month.
  assert.equal(str(firstDueOnOrAfter(d('2026-06-03'), rule)), '2026-06-05');
  // Advance steps a whole month.
  assert.equal(str(nextOccurrenceAfter(d('2026-06-05'), rule)), '2026-07-05');
});

test('monthly: day 31 clamps to the shorter month (Feb)', () => {
  const rule = { frequency: 'monthly', dayOfMonth: 31 };
  // Jan 31 → next is Feb 28 (2026 is not a leap year).
  assert.equal(str(nextOccurrenceAfter(d('2026-01-31'), rule)), '2026-02-28');
  // From the clamped Feb date, the next still targets day 31 → Mar 31.
  assert.equal(str(nextOccurrenceAfter(d('2026-02-28'), rule)), '2026-03-31');
});

test('yearly: lands on month/day; rolls to next year; Feb 29 clamps', () => {
  const rule = { frequency: 'yearly', monthOfYear: 3, dayOfMonth: 1 };
  assert.equal(str(firstDueOnOrAfter(d('2026-06-21'), rule)), '2027-03-01');
  assert.equal(str(firstDueOnOrAfter(d('2026-01-10'), rule)), '2026-03-01');
  assert.equal(str(nextOccurrenceAfter(d('2026-03-01'), rule)), '2027-03-01');

  const feb29 = { frequency: 'yearly', monthOfYear: 2, dayOfMonth: 29 };
  // 2024 is a leap year → next year 2025 has no Feb 29 → clamp to Feb 28.
  assert.equal(str(nextOccurrenceAfter(d('2024-02-29'), feb29)), '2025-02-28');
});

test('catch-up: walking the engine from a past due date fills every occurrence', () => {
  // Simulate the generateDue loop for a monthly template due on the 5th, with
  // the program closed from May through "today" 2026-06-21.
  const rule = { frequency: 'monthly', dayOfMonth: 5 };
  const asOf = d('2026-06-21');
  let cursor = d('2026-04-05');
  const generated = [];
  let guard = 0;
  while (cursor <= asOf && guard < 1000) {
    generated.push(str(cursor));
    cursor = nextOccurrenceAfter(cursor, rule);
    guard += 1;
  }
  assert.deepEqual(generated, ['2026-04-05', '2026-05-05', '2026-06-05']);
  // The next due now points strictly past asOf.
  assert.equal(str(cursor), '2026-07-05');
});

test('RBAC: recurring-expense permissions mirror ordinary expenses', () => {
  // Manager maintains templates; cashier cannot.
  assert.equal(hasPermission('recurring_expenses:create', 'manager'), true);
  assert.equal(hasPermission('recurring_expenses:read', 'manager'), true);
  assert.equal(hasPermission('recurring_expenses:update', 'manager'), true);
  assert.equal(hasPermission('recurring_expenses:create', 'cashier'), false);
  // Delete is branch-manager and above.
  assert.equal(hasPermission('recurring_expenses:delete', 'branch_manager'), true);
  assert.equal(hasPermission('recurring_expenses:delete', 'manager'), false);
  // Global admin always has everything.
  assert.equal(hasPermission('recurring_expenses:delete', 'admin'), true);
});
