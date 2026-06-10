import { test as base } from '@playwright/test';
import { ApiClient, createApiClient } from '../helpers/api';
import { LoginPage } from '../pages/LoginPage';
import { PosPage } from '../pages/PosPage';
import { ProductsPage } from '../pages/ProductsPage';
import { ProductFormPage } from '../pages/ProductFormPage';
import { AccountingPeriodsPage } from '../pages/AccountingPeriodsPage';
import { InventoryPage } from '../pages/InventoryPage';
import { SaleDetailsPage } from '../pages/SaleDetailsPage';

type TestFixtures = {
  loginPage: LoginPage;
  pos: PosPage;
  products: ProductsPage;
  productForm: ProductFormPage;
  periods: AccountingPeriodsPage;
  inventory: InventoryPage;
  saleDetails: SaleDetailsPage;
};

type WorkerFixtures = {
  /**
   * Authenticated REST client (admin) for setup/cleanup only. WORKER-scoped:
   * it logs in ONCE per worker and is shared by every hook and test. This is
   * deliberate — the backend caps `/auth/login` at 10 requests / 5 minutes, so
   * a per-test login would rate-limit the suite. Available in beforeAll/afterAll
   * too (worker fixtures are, test fixtures aren't).
   */
  api: ApiClient;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  api: [
    async ({}, use) => {
      const { client, dispose } = await createApiClient();
      await use(client);
      await dispose();
    },
    { scope: 'worker' },
  ],

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  pos: async ({ page }, use) => use(new PosPage(page)),
  products: async ({ page }, use) => use(new ProductsPage(page)),
  productForm: async ({ page }, use) => use(new ProductFormPage(page)),
  periods: async ({ page }, use) => use(new AccountingPeriodsPage(page)),
  inventory: async ({ page }, use) => use(new InventoryPage(page)),
  saleDetails: async ({ page }, use) => use(new SaleDetailsPage(page)),
});

export { expect } from '@playwright/test';
export { ENV } from '../helpers/env';
export { TID, DATA_ATTR } from '../helpers/testids';
export { AR } from '../helpers/arabic';
