import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';

export interface ProductInput {
  name: string;
  sellingPrice: number;
  costPrice?: number;
  /** Category name — REQUIRED by the backend. Seed it via api.ensureCategory(). */
  category: string;
}

/** Product create/edit form (/products/new, /products/:id/edit). */
export class ProductFormPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async fill(p: ProductInput) {
    await this.tid(TID.productForm.name).locator('input').fill(p.name);
    // The category autocomplete: type the (pre-seeded) name and press Enter,
    // which selects the existing category. The backend rejects a null category.
    const cat = this.tid(TID.productForm.category).locator('input');
    await cat.fill(p.category);
    await cat.press('Enter');
    // cost/selling price fields are formatted text inputs driven by handlers;
    // filling the raw number is parsed correctly by the component.
    if (p.costPrice != null) {
      await this.tid(TID.productForm.costPrice).locator('input').fill(String(p.costPrice));
    }
    await this.tid(TID.productForm.sellingPrice).locator('input').fill(String(p.sellingPrice));
  }

  async save() {
    await this.tid(TID.productForm.save).click();
  }

  /**
   * After creating an inventory product the app prompts to add opening stock.
   * Choose 'add' to go to the inventory adjust flow, or 'skip' to return to
   * the list.
   */
  async handleOpeningStockPrompt(choice: 'add' | 'skip') {
    const btn = choice === 'add' ? TID.productForm.openingStockAdd : TID.productForm.openingStockSkip;
    await expect(this.tid(btn)).toBeVisible();
    await this.tid(btn).click();
  }

  /**
   * Create a product and land back on the list. The opening-stock prompt only
   * appears for inventory products when the user can adjust stock — tolerate
   * either branch (prompt → skip, or a direct navigation to the list).
   */
  async createAndSkipStock(p: ProductInput) {
    await this.fill(p);
    await this.save();
    const skip = this.tid(TID.productForm.openingStockSkip);
    await Promise.race([
      skip.waitFor({ state: 'visible' }).catch(() => {}),
      this.page.waitForURL('**/products').catch(() => {}),
    ]);
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await this.page.waitForURL('**/products');
  }
}
