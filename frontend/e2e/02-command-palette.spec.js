import { test, expect } from '@playwright/test';
import { openPalette } from './helpers.js';

test.describe('Phase G — quick search command palette (Ctrl+K)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Ctrl+K opens the palette and shows screen shortcuts', async ({ page }) => {
    await openPalette(page);
    // Empty state shows the "start typing" hint + shortcut chips (scoped to the
    // dialog so it never matches the hidden sidebar item of the same name).
    const dialog = page.locator('.v-dialog');
    await expect(dialog.getByText('ابدأ الكتابة')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('بيع جديد').first()).toBeVisible();
  });

  test('typing a term surfaces results (or a clean empty state)', async ({ page }) => {
    await openPalette(page);
    await page.getByPlaceholder(/ابحث عن منتج/).fill('a');
    // Either results render or the "no results" message — never an error.
    await page.waitForTimeout(600);
    const text = await page.locator('.v-dialog').innerText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('undefined');
  });

  test('the work hub "بحث سريع" button opens the palette', async ({ page }) => {
    await page.goto('/');
    await page.getByText('بحث سريع').first().click();
    await expect(page.getByPlaceholder(/ابحث عن منتج/)).toBeVisible({ timeout: 10_000 });
  });
});
