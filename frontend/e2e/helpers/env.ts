/**
 * Centralised environment configuration for the E2E suite.
 *
 * Everything is overridable via env vars so the same specs run against a local
 * dev stack, a colleague's machine, or CI without edits. Defaults match the
 * documented local setup (frontend :5173 → backend :41732).
 */

export const ENV = {
  /** SPA origin under test (Playwright baseURL). */
  baseURL: process.env.NUQTA_BASE_URL ?? 'http://localhost:5173',

  /** Backend REST base, including the `/api` prefix. Used only for setup/cleanup. */
  apiURL: process.env.NUQTA_API_URL ?? 'http://127.0.0.1:41732/api',

  /** Seeded global-admin credentials (see e2e/README.md). */
  admin: {
    username: process.env.NUQTA_ADMIN_USER ?? 'admin',
    password: process.env.NUQTA_ADMIN_PASS ?? 'Admin@123',
  },

  /**
   * A non-admin user for permission/negative tests. Per the seed, most demo
   * users share the password `Passw0rd!`. Override if your DB differs.
   */
  cashier: {
    username: process.env.NUQTA_CASHIER_USER ?? 'cashier',
    password: process.env.NUQTA_CASHIER_PASS ?? 'Passw0rd!',
  },

  /**
   * Optional explicit warehouse id for API stock seeding. When unset the API
   * client resolves it from GET /api/warehouses.
   */
  warehouseId: process.env.NUQTA_WAREHOUSE_ID
    ? Number(process.env.NUQTA_WAREHOUSE_ID)
    : null,

  /** Where the persisted admin storageState lives. */
  adminStatePath: 'e2e/.auth/admin.json',
} as const;

/** A short unique token for test data names so reruns never collide. */
export function uniqueTag(prefix = 'e2e'): string {
  // No Date.now()/Math.random reliance for determinism across retries within a
  // single test: callers pass their own seed when they need stability. This is
  // for one-off fresh names where uniqueness (not determinism) matters.
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `${prefix}-${process.pid.toString(36)}-${rand}`;
}
