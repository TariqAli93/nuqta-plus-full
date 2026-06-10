import { test, expect } from '../../fixtures/test';

test.describe.configure({ mode: 'serial' });

test.describe('القيود المحاسبية — Accounting periods', () => {
  let restoreFlags: () => Promise<void>;

  test.beforeAll(async ({ api }) => {
    restoreFlags = await api.withFlags({ accountingPeriods: true });
  });

  test.beforeEach(async ({ api }) => {
    await api.closeAllOpenPeriods(); // isolate each test
  });

  test.afterAll(async ({ api }) => {
    try {
      await api.closeAllOpenPeriods();
    } finally {
      await restoreFlags?.();
    }
  });

  test('opens then closes a daily period', async ({ periods }) => {
    await periods.open();
    await periods.openPeriod('daily');
    await periods.expectOpenPeriodExists();

    await periods.closeFirstOpenPeriod();
    await expect(periods.openRow()).toHaveCount(0);
  });

  test('blocks opening a second period for an already-open scope', async ({ periods }) => {
    await periods.open();
    await periods.openPeriod('daily');
    await periods.expectOpenPeriodExists();

    // Re-opening the dialog surfaces the "already open" warning.
    await periods.openDialogAndExpectAlreadyOpenWarning();
  });
});
