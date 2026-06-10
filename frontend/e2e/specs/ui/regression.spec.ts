import { test, expect } from '../../fixtures/test';

/**
 * Lightweight UI-regression smoke: every primary screen renders its Arabic
 * heading and produces no fatal console errors, and the shell is RTL.
 */
test.describe('انحدار الواجهة — UI regression', () => {
  const screens = [
    { path: '/sales/pos', text: 'السلة' },
    { path: '/products', text: 'إدارة المنتجات' },
    { path: '/customers', text: 'إدارة العملاء' },
    { path: '/expenses', text: 'إدارة المصاريف' },
    { path: '/reports', text: 'التقارير' },
  ];

  for (const s of screens) {
    test(`renders ${s.path} in Arabic with no fatal console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(s.path);
      await expect(page.getByText(s.text).first()).toBeVisible();

      // Ignore benign resource/observer noise; fail on genuine JS errors.
      const fatal = errors.filter(
        (e) => !/(favicon|ResizeObserver|Failed to load resource|net::ERR|\b404\b)/i.test(e),
      );
      expect(fatal, `console errors on ${s.path}:\n${fatal.join('\n')}`).toEqual([]);
    });
  }

  test('application shell is right-to-left', async ({ page }) => {
    await page.goto('/products');
    const dir = await page.evaluate(() => {
      const root = document.querySelector('.v-application') || document.body;
      return getComputedStyle(root).direction;
    });
    expect(dir).toBe('rtl');
  });
});
