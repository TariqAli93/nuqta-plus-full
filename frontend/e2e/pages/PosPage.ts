import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';
import { AR } from '../helpers/arabic';

/** Point-of-sale screen (/sales/pos). */
export class PosPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/sales/pos');
    await this.waitForLoadingIdle();
  }

  // ── Shift bar ────────────────────────────────────────────────────────────
  async hasOpenShift(): Promise<boolean> {
    return this.tid(TID.pos.closeShift).isVisible();
  }

  /**
   * Open a shift through the OpenShiftDialog. POS auto-opens this dialog on
   * mount when no shift is active and a period exists, so only click the
   * trigger button when the dialog isn't already showing (clicking a button
   * whose modal scrim already covers it would hang).
   */
  async openShift(openingCash = 0) {
    await this.waitForLoadingIdle();
    const confirm = this.tid(TID.openShift.confirm);
    if (!(await confirm.isVisible().catch(() => false))) {
      await this.tid(TID.pos.openShift).click();
    }
    await expect(confirm).toBeVisible();
    await this.tid(TID.openShift.cash).locator('input').fill(String(openingCash));
    await confirm.click();
    await expect(this.tid(TID.pos.closeShift)).toBeVisible();
  }

  /** Dismiss the auto-opened shift dialog (used by no-shift negative tests). */
  async dismissShiftDialogIfOpen() {
    await this.waitForLoadingIdle();
    const cancel = this.tid(TID.openShift.cancel);
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      await expect(this.tid(TID.openShift.confirm)).toBeHidden();
    }
  }

  /** Close the open shift through the CloseShiftDialog. */
  async closeShift(closingCash = 0) {
    await this.waitForLoadingIdle();
    await this.tid(TID.pos.closeShift).click();
    await expect(this.tid(TID.closeShift.confirm)).toBeVisible();
    await this.tid(TID.closeShift.cash).locator('input').fill(String(closingCash));
    await this.tid(TID.closeShift.confirm).click();
    await expect(this.tid(TID.pos.openShift)).toBeVisible();
  }

  // ── Catalogue / cart ───────────────────────────────────────────────────────
  async search(text: string) {
    await this.tid(TID.pos.search).locator('input').fill(text);
  }

  productTile(name: string): Locator {
    return this.tid(TID.pos.product).filter({ hasText: name }).first();
  }

  /** Search for a product and click its tile to add it to the cart. */
  async addProduct(name: string) {
    await this.waitForLoadingIdle();
    await this.search(name);
    const tile = this.productTile(name);
    await expect(tile).toBeVisible();
    await tile.click();
  }

  async cartTotalText(): Promise<string> {
    return (await this.tid(TID.pos.total).innerText()).trim();
  }

  async selectPaymentMethod(method: 'cash' | 'card') {
    await this.tid(TID.pos.payMethod(method)).click();
  }

  /**
   * Tender the exact total. The paid amount now auto-fills with the cart total
   * (the old «المبلغ كامل» button was removed), so this is a no-op kept for
   * backward-compatible test flows.
   */
  async payFull() {
    /* paid auto-fills with the total — nothing to click */
  }

  /**
   * Complete the sale. On success the app navigates to the invoice details
   * page; returns the new sale id parsed from the URL.
   */
  async checkout(): Promise<string> {
    await this.waitForLoadingIdle();
    await this.tid(TID.pos.checkout).click();
    await this.page.waitForURL(/\/sales\/\d+$/);
    const m = this.page.url().match(/\/sales\/(\d+)$/);
    expect(m, 'checkout did not navigate to a sale').toBeTruthy();
    return m![1];
  }

  /** Convenience: add one product, pay cash in full, complete. Returns sale id. */
  async sellSingle(name: string): Promise<string> {
    await this.addProduct(name);
    await this.selectPaymentMethod('cash');
    await this.payFull();
    return this.checkout();
  }

  async expectNoShiftWarning() {
    await this.expectMessage(AR.pos.noShiftWarning);
  }
}
