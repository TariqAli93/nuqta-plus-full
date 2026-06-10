import { expect } from '@playwright/test';

/** Demo credentials (seeded dev DB). */
export const ADMIN = { username: 'admin', password: 'Admin@123' };

/**
 * Log in through the real login form and wait until the app shell renders.
 * Tolerant of an already-authenticated session (skips the form if absent).
 */
export async function login(page, creds = ADMIN) {
  await page.goto('/');
  // The login form has username + password fields; if we're already in, skip.
  const userField = page.locator('input[type="text"], input[autocomplete="username"]').first();
  if (await userField.isVisible().catch(() => false)) {
    await userField.fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await page.getByRole('button', { name: /دخول|تسجيل/ }).first().click();
  }
  // Wait for the app bar / sidebar to be present (authenticated shell).
  await expect(page.locator('.v-app-bar, .v-navigation-drawer').first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Open the command palette via Ctrl+K and wait for it. */
export async function openPalette(page) {
  const input = page.getByPlaceholder(/ابحث عن منتج/);
  // Focus the document body so the global Ctrl+K handler receives the keydown.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+k');
  try {
    await expect(input).toBeVisible({ timeout: 4000 });
  } catch {
    // Fallback to the same global event the header/work-hub buttons dispatch.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-quick-search')));
    await expect(input).toBeVisible({ timeout: 6000 });
  }
}
