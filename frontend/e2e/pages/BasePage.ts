import { Locator, Page, expect } from '@playwright/test';

/** Shared helpers for all page objects. */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Locator by data-testid. */
  protected tid(id: string): Locator {
    return this.page.getByTestId(id);
  }

  /** Navigate to an in-app route (dev uses HTML5 history mode). */
  async goto(routePath: string) {
    await this.page.goto(routePath);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Select an option from a Vuetify v-select/v-autocomplete that carries a
   * data-testid. Opens the menu and clicks the option by its visible text.
   */
  protected async chooseOption(selectTestId: string, optionText: string | RegExp) {
    await this.tid(selectTestId).click();
    await this.page.getByRole('option', { name: optionText }).click();
  }

  /** Assert a Vuetify snackbar / inline alert with the given Arabic text shows. */
  async expectMessage(text: string | RegExp) {
    await expect(this.page.getByText(text).first()).toBeVisible();
  }

  /**
   * Wait out the app's global loading overlay, which is shown during in-flight
   * requests and intercepts pointer events. Without this, clicks that open a
   * dialog can race the overlay and never land. The overlay is `v-if`-rendered,
   * so "hidden" also covers "detached".
   */
  async waitForLoadingIdle() {
    await expect(this.page.locator('.loading-overlay')).toBeHidden({ timeout: 15000 });
  }

  url(): string {
    return this.page.url();
  }
}
