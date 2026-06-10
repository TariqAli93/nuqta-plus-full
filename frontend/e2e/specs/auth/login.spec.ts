import { test, expect, AR, ENV } from '../../fixtures/test';

// These specs exercise the real login form, so they must NOT inherit the
// persisted admin session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('المصادقة — Login', () => {
  test('valid admin credentials → lands on the POS screen', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(ENV.admin.username, ENV.admin.password);
    await loginPage.expectLoggedIn();
    await expect(page).toHaveURL(/\/sales\/pos/);
  });

  test('invalid credentials → localized Arabic error', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(ENV.admin.username, 'wrong-password-123');
    await loginPage.expectInvalidCredentialsError();
    // Stays on the login screen — no navigation.
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('empty submit → Arabic required-field validation', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.submit();
    await expect(page.getByText(AR.login.requiredField).first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
