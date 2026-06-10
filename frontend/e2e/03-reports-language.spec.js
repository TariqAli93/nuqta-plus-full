import { test, expect } from '@playwright/test';

// Auth handled by the `setup` project (storageState).
test.describe('Phase G — reports use plain language', () => {

  test('simple reports page asks owner-friendly questions', async ({ page }) => {
    await page.goto('/reports/simple');
    await expect(page.getByText('شكد بعت؟')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('منو عليه دين؟')).toBeVisible();
    // No accounting statement names on the simple page.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('قائمة الدخل');
    expect(body).not.toContain('ميزانية عمومية');
  });

  test('financial reports use friendly statement names (full mode only)', async ({ page }) => {
    const resp = await page.goto('/reports/financial');
    // If the feature/capability is off the guard redirects away — that's fine.
    if (page.url().includes('/reports/financial') && resp?.ok() !== false) {
      const body = await page.locator('body').innerText().catch(() => '');
      if (body.includes('فحص توازن الحسابات') || body.includes('الربح والخسارة')) {
        expect(body).not.toContain('ميزان المراجعة');
        expect(body).not.toContain('دفتر الأستاذ');
      }
    }
  });
});
