import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';

const MOVEMENT_LABEL: Record<string, string> = {
  opening_balance: 'رصيد افتتاحي',
  stock_in: 'إضافة مخزون',
  adjustment_in: 'تعديل (زيادة)',
};

/** Inventory / stock management (/inventory). */
export class InventoryPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/inventory');
  }

  /** Open the add/adjust-stock dialog if it isn't already open. */
  async ensureAdjustDialogOpen() {
    if (await this.tid(TID.inventory.adjustSave).isVisible().catch(() => false)) return;
    await this.tid(TID.inventory.adjustBtn).click();
    await expect(this.tid(TID.inventory.adjustSave)).toBeVisible();
  }

  /**
   * Record a stock movement. When `product` is omitted the dialog is assumed
   * to have arrived with a product pre-selected (the post-create flow from the
   * product form passes ?productId=…&action=adjust).
   */
  async addStock(qty: number, opts: { product?: string; type?: keyof typeof MOVEMENT_LABEL } = {}) {
    await this.ensureAdjustDialogOpen();

    if (opts.product) {
      const ac = this.tid(TID.inventory.adjustProduct);
      await ac.locator('input').fill(opts.product);
      await this.page.getByRole('option', { name: opts.product }).first().click();
    }

    if (opts.type) {
      await this.chooseOption(TID.inventory.adjustType, MOVEMENT_LABEL[opts.type]);
    }

    await this.tid(TID.inventory.adjustQty).locator('input').fill(String(qty));
    await this.tid(TID.inventory.adjustSave).click();
    await expect(this.tid(TID.inventory.adjustSave)).toBeHidden();
  }

  /**
   * Used by the post-create "add opening stock" flow: the product form
   * deep-links to /inventory?productId=…&action=adjust, which auto-opens the
   * adjust dialog with the product already selected. We wait for it, set the
   * quantity, and save (movement type defaults to opening balance).
   */
  async addStockForCreatedProduct(qty: number) {
    await this.waitForLoadingIdle();
    await expect(this.tid(TID.inventory.adjustSave)).toBeVisible();
    await this.tid(TID.inventory.adjustQty).locator('input').fill(String(qty));
    await this.tid(TID.inventory.adjustSave).click();
    await expect(this.tid(TID.inventory.adjustSave)).toBeHidden();
  }
}
