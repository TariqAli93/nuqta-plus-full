import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';
import { AR } from '../helpers/arabic';

const TYPE_LABEL: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  yearly: 'سنوي',
};

/** Accounting periods / القيود المحاسبية (/accounting-periods). */
export class AccountingPeriodsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/accounting-periods');
    await this.waitForLoadingIdle();
    await expect(this.page.getByText(AR.periods.title).first()).toBeVisible();
  }

  /** Open a new accounting period of the given type. */
  async openPeriod(type: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily') {
    await this.waitForLoadingIdle();
    await this.tid(TID.periods.openBtn).click();
    await expect(this.tid(TID.periods.submitOpen)).toBeVisible();
    await this.chooseOption(TID.periods.type, TYPE_LABEL[type]);
    await this.tid(TID.periods.submitOpen).click();
    // Dialog closes on success (avoids depending on toast timing).
    await expect(this.tid(TID.periods.submitOpen)).toBeHidden();
  }

  /** Open the new-period dialog and read back the "already open" warning, if any. */
  async openDialogAndExpectAlreadyOpenWarning() {
    await this.tid(TID.periods.openBtn).click();
    await expect(this.tid(TID.periods.submitOpen)).toBeVisible();
    await expect(this.page.getByText(AR.periods.alreadyOpenWarning)).toBeVisible();
  }

  openRow(): Locator {
    return this.tid(TID.periods.table)
      .locator('tbody tr', { hasText: AR.periods.statusOpen })
      .first();
  }

  async expectOpenPeriodExists() {
    await expect(this.openRow()).toBeVisible();
  }

  /** Close the first open period (confirms the pre-close summary dialog). */
  async closeFirstOpenPeriod() {
    await this.openRow().getByTestId(TID.periods.closeBtn).click();
    await expect(this.tid(TID.periods.confirmClose)).toBeVisible();
    await this.tid(TID.periods.confirmClose).click();
    await expect(this.tid(TID.periods.confirmClose)).toBeHidden();
  }
}
