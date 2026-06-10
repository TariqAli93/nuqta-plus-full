import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';
import { AR } from '../helpers/arabic';

/** Products catalogue list (/products). */
export class ProductsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/products');
    await expect(this.tid(TID.products.newBtn)).toBeVisible();
  }

  async clickNew() {
    await this.tid(TID.products.newBtn).click();
    await this.page.waitForURL('**/products/new');
  }

  async search(text: string) {
    // SearchBar is a shared component; target its input by placeholder.
    await this.page.getByPlaceholder(/ابحث بالاسم/).fill(text);
  }

  rowByName(name: string): Locator {
    return this.tid(TID.products.table).locator('tbody tr', { hasText: name }).first();
  }

  async expectProductVisible(name: string) {
    await expect(this.rowByName(name)).toBeVisible();
  }

  async editProduct(name: string) {
    await this.rowByName(name).getByTestId(TID.products.edit).click();
    await this.page.waitForURL('**/products/*/edit');
  }

  async deleteProduct(name: string) {
    await this.rowByName(name).getByTestId(TID.products.delete).click();
    // Shared ConfirmDialog — confirm with its Arabic action label.
    await this.page.getByRole('button', { name: AR.products.deleteConfirm }).click();
  }
}
