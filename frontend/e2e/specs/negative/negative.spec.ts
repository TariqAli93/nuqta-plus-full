import { test, expect, AR, TID } from '../../fixtures/test';
import { uniqueTag } from '../../helpers/env';

test.describe('اختبارات سلبية — Negative & guard rails', () => {
  test('/sales/new stays open when installments are off — only the installment option is gated', async ({ page, api }) => {
    // The unified New-Sale invoice supports BOTH cash and installments. Turning
    // the installments module OFF must NOT block the page (a cash invoice is
    // still valid) — it only hides the installment payment option. Restored after.
    const restore = await api.withFlags({ installments: false });
    try {
      await page.goto('/sales/new');
      await expect(page).toHaveURL(/\/sales\/new/);
      // Cash is always available; the installment segment is hidden.
      await expect(page.getByTestId('payment-type-cash')).toBeVisible();
      await expect(page.getByTestId('payment-type-installment')).toHaveCount(0);
    } finally {
      await restore();
    }
  });

  test('product form refuses to save with empty required fields', async ({ products, productForm, page }) => {
    await products.open();
    await products.clickNew();
    await page.getByTestId(TID.productForm.save).click();
    await expect(page.getByText(AR.login.requiredField).first()).toBeVisible();
    await expect(page).toHaveURL(/\/products\/new/);
  });

  test('POS refuses checkout without an open shift', async ({ pos, page, api }) => {
    let restore: undefined | (() => Promise<void>);
    let productId: number | undefined;
    const name = `E2E سلبي ${uniqueTag()}`;
    try {
      restore = await api.withFlags({ accountingPeriods: false });
      await api.closeOpenShift();
      const p = await api.createProduct({ name, sellingPrice: 3000 });
      productId = p.id;
      await api.addStock(productId!, 5);

      await pos.open();
      await pos.dismissShiftDialogIfOpen(); // POS auto-prompts to open a shift
      await expect(page.getByTestId(TID.pos.openShift)).toBeVisible();
      await pos.addProduct(name);
      await pos.selectPaymentMethod('cash');
      await pos.payFull();
      await page.getByTestId(TID.pos.checkout).click();
      await pos.expectNoShiftWarning();
    } finally {
      if (productId) await api.deleteProduct(productId);
      await restore?.();
    }
  });

  test('non-admin user is forbidden from the users page', async ({ browser, api }) => {
    // Provision a low-privilege user via the API, then drive a real UI login in
    // an isolated context and assert the route guard blocks /users.
    const username = `e2eviewer${uniqueTag('v')}`.replace(/[^a-z0-9]/gi, '');
    const password = 'Passw0rd!123';
    let userId: number | undefined;
    try {
      const branchId = await api.resolveBranchId();
      const created = await api
        .createUser({ username, password, fullName: 'E2E Viewer', role: 'viewer', assignedBranchId: branchId })
        .catch(() => null);
      test.skip(!created, 'could not provision a non-admin user on this environment');
      userId = created!.id;

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      try {
        await page.goto('/auth/login');
        await page.getByTestId(TID.login.username).locator('input').fill(username);
        await page.getByTestId(TID.login.password).locator('input').fill(password);
        await page.getByTestId(TID.login.submit).click();
        // A viewer cannot reach POS — the post-login redirect is itself guarded.
        // Wait until we've left the login screen, then assert /users is blocked.
        await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20000 });
        await page.goto('/users');
        await expect(page).toHaveURL(/\/forbidden/);
      } finally {
        await context.close();
      }
    } finally {
      if (userId) await api.deleteUser(userId);
    }
  });
});
