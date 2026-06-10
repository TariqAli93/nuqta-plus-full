import { test as setup, expect } from '@playwright/test';
import { login } from './helpers.js';

const authFile = 'e2e/.auth/admin.json';

/**
 * One-time authentication. Logs in once and saves the storage state so every
 * test reuses the session instead of re-logging-in (which would hammer the dev
 * backend and cause flaky timeout cascades).
 */
setup('authenticate as admin', async ({ page }) => {
  await login(page);
  await expect(page.locator('.v-navigation-drawer').first()).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: authFile });
});
