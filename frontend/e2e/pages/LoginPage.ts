import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { TID } from '../helpers/testids';
import { AR } from '../helpers/arabic';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/auth/login');
    await expect(this.tid(TID.login.submit)).toBeVisible();
  }

  /** Fill the form via a real input element (Vuetify wraps the <input>). */
  async fillCredentials(username: string, password: string) {
    await this.tid(TID.login.username).locator('input').fill(username);
    await this.tid(TID.login.password).locator('input').fill(password);
  }

  async submit() {
    await this.tid(TID.login.submit).click();
  }

  async login(username: string, password: string) {
    await this.fillCredentials(username, password);
    await this.submit();
  }

  /** A successful login lands on the POS screen. */
  async expectLoggedIn() {
    await this.page.waitForURL('**/sales/pos');
  }

  async expectInvalidCredentialsError() {
    await expect(this.tid(TID.login.error)).toContainText(AR.login.invalidCredentials);
  }
}
