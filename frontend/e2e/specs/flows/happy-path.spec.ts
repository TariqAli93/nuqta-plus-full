import { test, expect, TID } from '../../fixtures/test';
import { uniqueTag } from '../../helpers/env';

/**
 * End-to-end retail cycle, all through the browser:
 *
 *   login (session) → open accounting period → open shift → create product
 *   → add opening stock → sell 2 units → partial return (1) → reports
 *   → close shift → close period
 *
 * `accountingPeriods` is enabled for this spec so the full period→shift gate is
 * exercised; it is restored afterwards so the rest of the suite (and the
 * running app) is unaffected.
 */
test.describe.configure({ mode: 'serial' });

test.describe('التدفق الكامل — Happy path', () => {
  let restoreFlags: () => Promise<void>;
  let createdProductId: number | undefined;
  const productName = `E2E منتج ${uniqueTag()}`;
  const category = 'تصنيف E2E';
  const price = 5000;

  test.beforeAll(async ({ api }) => {
    restoreFlags = await api.withFlags({ accountingPeriods: true, pos: true, inventory: true });
    await api.ensureCategory(category); // backend requires a category on create
    // Hermetic start: no dangling shift or open period from a prior run.
    await api.closeOpenShift();
    await api.closeAllOpenPeriods();
  });

  test.afterAll(async ({ api }) => {
    try {
      await api.closeOpenShift();
      await api.closeAllOpenPeriods();
      if (createdProductId) await api.deleteProduct(createdProductId);
    } finally {
      await restoreFlags?.();
    }
  });

  test('completes the full retail cycle', async ({
    page, periods, pos, products, productForm, inventory, saleDetails, api,
  }) => {
    let saleId = '';

    await test.step('open an accounting period (فتح قيد محاسبي)', async () => {
      await periods.open();
      await periods.openPeriod('daily');
      await periods.expectOpenPeriodExists();
    });

    await test.step('open a cash shift (فتح وردية)', async () => {
      await pos.open();
      expect(await pos.hasOpenShift()).toBeFalsy();
      await pos.openShift(0);
      expect(await pos.hasOpenShift()).toBeTruthy();
    });

    await test.step('create a product', async () => {
      await products.open();
      await products.clickNew();
      await productForm.fill({ name: productName, category, sellingPrice: price, costPrice: 3000 });
      await productForm.save();
    });

    await test.step('add opening stock (حركة مخزون)', async () => {
      const found = await api.listProducts(productName);
      createdProductId = (Array.isArray(found) ? found : []).find(
        (p: any) => p.name === productName,
      )?.id;
      expect(createdProductId, 'created product should be findable').toBeTruthy();

      // Reach the stock-adjust dialog through the app's deep-link: click the
      // "إضافة مخزون" prompt if it appeared, otherwise navigate the same route
      // the prompt pushes to (/inventory?productId=…&action=adjust).
      const addBtn = page.getByTestId(TID.productForm.openingStockAdd);
      await Promise.race([
        addBtn.waitFor({ state: 'visible' }).catch(() => {}),
        page.waitForURL('**/products').catch(() => {}),
      ]);
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
      } else {
        await page.goto(`/inventory?productId=${createdProductId}&action=adjust`);
      }
      await inventory.addStockForCreatedProduct(10);
    });

    await test.step('sell 2 units for cash', async () => {
      await pos.open();
      await pos.addProduct(productName); // qty 1
      await pos.addProduct(productName); // qty 2
      await pos.selectPaymentMethod('cash');
      await pos.payFull();
      saleId = await pos.checkout(); // navigates to /sales/:id
      expect(saleId).toMatch(/\d+/);
    });

    await test.step('partial return — 1 of 2 units', async () => {
      await saleDetails.open(saleId);
      await saleDetails.partialReturnFirstLine(1);
      await saleDetails.expectReturnsHistory();
      await expect(page.getByTestId(TID.saleDetails.netAfterReturns)).toBeVisible();
    });

    await test.step('reports load', async () => {
      await page.goto('/reports');
      await expect(page.getByText('التقارير').first()).toBeVisible();
    });

    await test.step('close the shift (إغلاق الوردية)', async () => {
      await pos.open();
      await pos.closeShift(0);
      expect(await pos.hasOpenShift()).toBeFalsy();
    });

    await test.step('close the accounting period (إغلاق القيد)', async () => {
      await periods.open();
      await periods.closeFirstOpenPeriod();
    });
  });
});
