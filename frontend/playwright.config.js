import { defineConfig, devices } from '@playwright/test';

/**
 * Phase G E2E — owner-friendly UX flows clicked through a real browser against
 * the running web frontend (port 5173) + dev backend (port 41732).
 *
 * Run:
 *   1. Stop the packaged Windows service:  Stop-Service NuqtaPlusBackend -Force
 *   2. Start the dev backend:               cd backend && node src/server.js
 *   3. Start the web frontend:              cd frontend && pnpm dev:web   (5173)
 *   4. Run the tests:                       cd frontend && npx playwright test
 *
 * The webServer block auto-starts the frontend if it isn't already up; the
 * backend must be started separately (see steps 1–2).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    locale: 'ar-IQ',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1366, height: 900 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'pnpm dev:web',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
