import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';
import { AR } from '../helpers/arabic';

/** Invoice details, payments & returns (/sales/:id). */
export class SaleDetailsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(saleId: string | number) {
    await this.goto(`/sales/${saleId}`);
    await this.waitForLoadingIdle();
    await expect(this.tid(TID.saleDetails.invoiceNumber)).toBeVisible();
  }

  async invoiceNumber(): Promise<string> {
    return (await this.tid(TID.saleDetails.invoiceNumber).innerText()).trim();
  }

  async openReturnDialog() {
    await this.waitForLoadingIdle();
    await this.tid(TID.saleDetails.returnBtn).click();
    await expect(this.tid(TID.saleDetails.confirmReturn)).toBeVisible();
  }

  /** Set the return quantity for the first returnable line. */
  async setFirstLineReturnQty(qty: number) {
    await this.tid(TID.saleDetails.returnQty).first().locator('input').fill(String(qty));
  }

  /** Set the return quantity for a specific sale line by its sale-item id. */
  async setReturnQtyForItem(saleItemId: number | string, qty: number) {
    await this.page
      .locator(`[data-sale-item-id="${saleItemId}"] input`)
      .first()
      .fill(String(qty));
  }

  async setRefundAmount(amount: number) {
    await this.tid(TID.saleDetails.refundAmount).locator('input').fill(String(amount));
  }

  async confirmReturn() {
    await this.tid(TID.saleDetails.confirmReturn).click();
    // Dialog closes and the returns history section renders.
    await expect(this.tid(TID.saleDetails.confirmReturn)).toBeHidden();
    await expect(this.tid(TID.saleDetails.returnsHistory)).toBeVisible();
  }

  /** Perform a partial return of `qty` units of the first line (cash refund). */
  async partialReturnFirstLine(qty: number) {
    await this.openReturnDialog();
    await this.setFirstLineReturnQty(qty);
    await this.confirmReturn();
  }

  async expectReturnsHistory() {
    await expect(this.tid(TID.saleDetails.returnsHistory)).toBeVisible();
  }

  async expectFullyReturnedBadge() {
    await expect(this.page.getByText(AR.saleDetails.fullyReturned)).toBeVisible();
  }
}
