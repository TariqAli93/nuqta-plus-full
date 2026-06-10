import { test, expect, TID } from '../../fixtures/test';
import { ApiClient } from '../../helpers/api';
import { uniqueTag } from '../../helpers/env';

/**
 * The sale-to-be-returned is created via the API (setup); the RETURN itself is
 * always performed through the browser on the invoice details screen.
 */
test.describe('الإرجاع والاسترداد — Returns', () => {
  let restoreFlags: () => Promise<void>;
  let productId: number | undefined;
  const unitPrice = 4000;

  test.beforeAll(async ({ api }) => {
    restoreFlags = await api.withFlags({ accountingPeriods: false, pos: true, inventory: true });
    const p = await api.createProduct({
      name: `E2E مرتجع ${uniqueTag()}`,
      sellingPrice: unitPrice,
      costPrice: 2000,
    });
    productId = p.id;
    await api.addStock(productId!, 50);
    // Give createSale a cash/shift context.
    await api.closeOpenShift();
    await api.openShift(0);
  });

  test.afterAll(async ({ api }) => {
    try {
      await api.closeOpenShift();
      if (productId) await api.deleteProduct(productId);
    } finally {
      await restoreFlags?.();
    }
  });

  function freshSale(api: ApiClient, qty: number) {
    return api.createSale({
      items: [{ productId: productId!, quantity: qty, unitPrice }],
      paidAmount: qty * unitPrice,
    });
  }

  test('partial return records history and a net-after-returns total', async ({ saleDetails, page, api }) => {
    const sale = await freshSale(api, 3);
    await saleDetails.open(sale.id);
    await saleDetails.partialReturnFirstLine(1);
    await saleDetails.expectReturnsHistory();
    await expect(page.getByTestId(TID.saleDetails.netAfterReturns)).toBeVisible();
  });

  test('full return marks the invoice as fully returned', async ({ saleDetails, api }) => {
    const sale = await freshSale(api, 2);
    await saleDetails.open(sale.id);
    await saleDetails.partialReturnFirstLine(2); // return every unit
    await saleDetails.expectReturnsHistory();
    await saleDetails.expectFullyReturnedBadge();
  });
});
