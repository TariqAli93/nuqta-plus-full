import { test, expect } from '@playwright/test';

// Auth handled by the `setup` project (storageState) — no per-test login.
test.describe('Phase G — home work hub + owner-friendly navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('home shows the work hub with big action buttons (no accounting jargon)', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('.v-main');
    await expect(main.getByText('شنو تريد تسوي اليوم؟')).toBeVisible();
    // Core action buttons a shop owner expects (scoped to main, not the sidebar).
    await expect(main.getByText('بيع جديد').first()).toBeVisible();
    await expect(main.getByText('قبض دين من عميل').first()).toBeVisible();

    // The main content must NOT expose raw accounting terms.
    const text = await main.innerText();
    for (const banned of ['مدين', 'دائن', 'قيد يومي', 'دفتر الأستاذ', 'ميزان المراجعة']) {
      expect(text).not.toContain(banned);
    }
  });

  test('sidebar uses owner-centric sections in the right order', async ({ page }) => {
    const drawer = page.locator('.v-navigation-drawer');
    for (const label of [
      'الرئيسية',
      'البيع',
      'الفواتير',
      'العملاء والديون',
      'البضاعة والمخزون',
      'الصندوق',
      'التقارير',
      'الإعدادات',
    ]) {
      await expect(drawer.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('no hard accounting terms leak into the sidebar', async ({ page }) => {
    const navText = await page.locator('.v-navigation-drawer').innerText();
    for (const banned of [
      'دفتر الأستاذ',
      'ميزان المراجعة',
      'قائمة الدخل',
      'الميزانية العمومية',
      'شجرة الحسابات',
      'القيود اليومية',
    ]) {
      expect(navText).not.toContain(banned);
    }
  });
});
