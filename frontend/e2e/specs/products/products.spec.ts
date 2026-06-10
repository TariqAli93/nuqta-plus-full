import { test, expect, AR, TID } from '../../fixtures/test';
import { uniqueTag } from '../../helpers/env';

test.describe('المنتجات — Products CRUD', () => {
  const name = `E2E سلعة ${uniqueTag()}`;
  const category = 'تصنيف E2E';

  test.beforeAll(async ({ api }) => {
    await api.ensureCategory(category); // backend requires a category
  });

  test.afterAll(async ({ api }) => {
    // Best-effort cleanup in case a test failed before its own delete.
    const found = await api.listProducts(name);
    for (const p of Array.isArray(found) ? found : []) {
      if (p.name === name) await api.deleteProduct(p.id);
    }
  });

  test('create → list → edit → delete', async ({ products, productForm, page }) => {
    await products.open();
    await products.clickNew();
    await productForm.createAndSkipStock({ name, category, sellingPrice: 7500, costPrice: 4000 });

    await products.search(name);
    await products.expectProductVisible(name);

    await products.editProduct(name);
    await expect(page).toHaveURL(/\/products\/\d+\/edit/);
    await page.getByTestId(TID.productForm.sellingPrice).locator('input').fill('9000');
    await page.getByTestId(TID.productForm.save).click();
    await page.waitForURL('**/products');

    await products.search(name);
    await products.deleteProduct(name);
    await products.search(name);
    await expect(products.rowByName(name)).toHaveCount(0);
  });

  test('required-field validation is shown in Arabic', async ({ products, productForm, page }) => {
    await products.open();
    await products.clickNew();
    await page.getByTestId(TID.productForm.save).click();
    await expect(page.getByText(AR.login.requiredField).first()).toBeVisible();
    await expect(page).toHaveURL(/\/products\/new/);
  });
});
