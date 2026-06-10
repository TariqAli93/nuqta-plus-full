import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Nuqta Plus (نقطة بلس) E2E browser suite.
 *
 * The app is a Vue 3 + Vuetify SPA (Arabic / RTL) that talks to a Fastify
 * backend. In dev `web` mode the SPA is served by Vite on :5173 and the
 * backend answers on :41732 (`/api`). See e2e/README.md for prerequisites.
 *
 * Two web servers are managed:
 *   1. backend  — reused if something already serves /health on :41732
 *                 (in most dev machines the installed NuqtaPlusBackend service
 *                  or a `node src/server.js` dev process is already up).
 *   2. frontend — `pnpm run dev:web` (VITE_TARGET=web) on :5173.
 *
 * State note: the backend is a single stateful Postgres-backed instance, and
 * several domain objects are singletons per user (open shift / open accounting
 * period). The suite therefore runs serially (workers: 1). Specs that mutate
 * shared state snapshot-and-restore it (feature flags) or clean up in
 * before/afterAll (shifts, periods) so they are order-independent.
 */

const FRONTEND_URL = process.env.NUQTA_BASE_URL ?? 'http://localhost:5173';
const BACKEND_HEALTH = process.env.NUQTA_API_HEALTH ?? 'http://127.0.0.1:41732/health';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e/specs',
  // Shared, stateful backend → keep deterministic ordering. Override locally
  // with `--workers=N` only for read-only specs.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Generous but bounded — never rely on arbitrary sleeps in specs.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.artifacts/html-report' }], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e/.artifacts/html-report' }]],

  outputDir: './e2e/.artifacts/test-results',

  use: {
    baseURL: FRONTEND_URL,
    // Arabic / RTL context so locale-formatted dates & numbers match the UI.
    locale: 'ar-IQ',
    timezoneId: 'Asia/Baghdad',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // ── Auth bootstrap: mint a token via the API and persist storageState ────
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // ── Authenticated suite (default) ────────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      // Login specs opt out of the stored session via test.use({ storageState }).
    },

    // Uncomment to also run cross-browser:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/admin.json' },
    //   dependencies: ['setup'],
    // },
  ],

  webServer: [
    {
      // Backend: reused if already running (installed service or dev process).
      command: 'node src/server.js',
      cwd: '../backend',
      url: BACKEND_HEALTH,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { NODE_ENV: 'development' },
    },
    {
      // Frontend dev server in web target.
      command: 'pnpm run dev:web',
      url: FRONTEND_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
