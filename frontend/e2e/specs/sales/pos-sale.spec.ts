import { test, expect, TID } from '../../fixtures/test';
import { uniqueTag } from '../../helpers/env';

test.describe.configure({ mode: 'serial' });

test.describe('نقطة البيع — POS sale', () => {
  let restoreFlags: () => Promise<void>;
  let productId: number | undefined;
  const productName = `E2E بيع ${uniqueTag()}`;

  test.beforeAll(async ({ api }) => {
    // A POS cash sale needs only an open shift (no period) → keep periods OFF.
    restoreFlags = await api.withFlags({ accountingPeriods: false, pos: true, inventory: true });
    await api.closeOpenShift();
    const p = await api.createProduct({ name: productName, sellingPrice: 6000, costPrice: 3500 });
    productId = p.id;
    await api.addStock(productId!, 25);
  });

  test.afterAll(async ({ api }) => {
    try {
      await api.closeOpenShift();
      if (productId) await api.deleteProduct(productId);
    } finally {
      await restoreFlags?.();
    }
  });

  test('opens a shift and completes a cash sale', async ({ pos }) => {
    await pos.open();
    if (!(await pos.hasOpenShift())) await pos.openShift(0);
    const saleId = await pos.sellSingle(productName);
    expect(saleId).toMatch(/\d+/);
  });

  test('refuses checkout without an open shift (Arabic warning)', async ({ pos, page, api }) => {
    await api.closeOpenShift();
    await pos.open();
    await pos.dismissShiftDialogIfOpen(); // POS auto-prompts to open a shift
    await expect(page.getByTestId(TID.pos.openShift)).toBeVisible(); // no shift open
    await pos.addProduct(productName);
    await pos.selectPaymentMethod('cash');
    await pos.payFull();
    await page.getByTestId(TID.pos.checkout).click();
    await pos.expectNoShiftWarning();
  });
});
