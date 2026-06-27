# Nuqta Plus — Playwright E2E Suite

Browser-driven end-to-end tests for the Vue 3 + Vuetify POS / inventory /
accounting app (Arabic, RTL). Real user actions in a real browser; the REST API
is used **only** for setup/cleanup and for minting the auth session.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Backend running on `:41732`** | The installed `NuqtaPlusBackend` service, or `cd backend && NODE_ENV=development node src/server.js`. Playwright reuses whatever already serves `http://127.0.0.1:41732/health`. |
| **Postgres seeded** | `nuqta_db` (postgres/root @ localhost:5432), seeded with the demo users/products. |
| **Seeded admin** | `admin / Admin@123` (global admin). Override via env (below). |
| **Node + pnpm** | The frontend dev server is started with `pnpm run dev:web` (port 5173). |
| **Playwright browsers** | `pnpm run test:e2e:install` (one-time). |

The frontend dev server is started automatically by Playwright's `webServer`.
The backend is **reused if already up**; otherwise Playwright tries to start a
dev backend (`node src/server.js` in `../backend`).

### Environment overrides

All optional — defaults match the documented local stack:

```
NUQTA_BASE_URL     # default http://localhost:5173
NUQTA_API_URL      # default http://127.0.0.1:41732/api
NUQTA_ADMIN_USER   # default admin
NUQTA_ADMIN_PASS   # default Admin@123
NUQTA_WAREHOUSE_ID # optional; otherwise resolved from GET /api/warehouses
```

---

## 2. Run commands

```bash
# one-time: install the Chromium browser
pnpm run test:e2e:install

# run the whole suite (starts the dev server automatically)
pnpm run test:e2e

# interactive UI mode (great for authoring/debugging)
pnpm run test:e2e:ui

# headed / step debugger
pnpm run test:e2e:headed
pnpm run test:e2e:debug

# a single file or a grep
pnpm exec playwright test e2e/specs/flows/happy-path.spec.ts
pnpm exec playwright test -g "partial return"

# open the last HTML report
pnpm run test:e2e:report
```

> The suite runs **serially** (`workers: 1`) because the backend is a single
> stateful instance with per-user singletons (open shift / open period). Specs
> that change shared state (feature flags) snapshot-and-restore it, and shift/
> period state is reset in `before/afterAll`, so specs are order-independent.

---

## 3. Folder structure

```
e2e/
├─ README.md                 ← this file
├─ TEST-PLAN.md              ← full plan across every section (IDs + status)
├─ TESTID-MAP.md             ← component ↔ data-testid contract + wiring status
├─ tsconfig.json
├─ .gitignore                ← ignores .auth/ and .artifacts/
├─ setup/
│  └─ auth.setup.ts          ← mints the admin storageState (runs first)
├─ fixtures/
│  └─ test.ts                ← extends `test` with api + page-object fixtures
├─ helpers/
│  ├─ env.ts                 ← URLs / creds (env-overridable)
│  ├─ api.ts                 ← REST client (setup/cleanup only)
│  ├─ testids.ts             ← the data-testid contract (single source of truth)
│  └─ arabic.ts              ← Arabic UI strings asserted by specs
├─ pages/                    ← Page Object Models
│  ├─ BasePage.ts
│  ├─ LoginPage.ts
│  ├─ PosPage.ts
│  ├─ ProductsPage.ts
│  ├─ ProductFormPage.ts
│  ├─ AccountingPeriodsPage.ts
│  ├─ InventoryPage.ts
│  └─ SaleDetailsPage.ts
└─ specs/
   ├─ auth/login.spec.ts
   ├─ flows/happy-path.spec.ts     ← login→period→shift→product→stock→sell→return→reports→close
   ├─ accounting/periods.spec.ts
   ├─ products/products.spec.ts
   ├─ sales/pos-sale.spec.ts
   ├─ sales/returns.spec.ts
   ├─ negative/negative.spec.ts
   └─ ui/regression.spec.ts
```

---

## 4. How auth works

`setup/auth.setup.ts` runs once (a Playwright project dependency): it logs in via
the API and writes `e2e/.auth/admin.json` — a storageState that seeds the SPA's
`localStorage` (`token` + cached session) for the app origin. The frontend's
axios interceptor reads the token from the Pinia store, which initialises from
`localStorage.token` on boot, so every authenticated spec starts already logged
in and hydrated. The login **form** itself is covered separately in
`specs/auth/login.spec.ts` (which opts out of the stored session).

---

## 5. Conventions

- **Selectors:** prefer `data-testid` (via `helpers/testids.ts`). Fall back to
  `getByRole`/`getByText` with the Arabic copy from `helpers/arabic.ts` only for
  shared components without ids (e.g. the confirm dialog button).
- **No arbitrary sleeps.** Use web-first assertions (`expect(locator).toBeVisible()`)
  and `waitForURL`. Vuetify overlays render `role="option"`/dialog content into
  the DOM — locate them directly.
- **API for setup/cleanup only.** Never assert app behaviour through the API.
- **Hermetic state.** Toggle feature flags with `api.withFlags(...)` (returns a
  restore fn). Reset shifts/periods in `before/afterAll`.
- **Arabic assertions.** Validate the real user-facing copy so localization
  regressions fail the build.

---

## 5.1 Gotchas the suite already handles

These were discovered while building the suite against the live app — keep them
in mind when extending it:

- **Login is rate-limited to 10 requests / 5 minutes** (`backend/src/routes/authRoutes.js`).
  That's why `api` is a **worker-scoped** fixture (one login per run, shared by
  all hooks/tests) and authenticated specs reuse `storageState`. A full run uses
  ~5 logins. Avoid adding per-test logins.
- **POS auto-opens the shift dialog** on mount when no shift is active and a
  period is usable. `PosPage.openShift()` detects the already-open dialog instead
  of clicking the (scrim-covered) button; `dismissShiftDialogIfOpen()` closes it
  for no-shift negative tests.
- **The global loading overlay intercepts clicks.** Page objects call
  `waitForLoadingIdle()` before POS/inventory/return interactions.
- **Creating a product requires a category.** The backend rejects a null
  `categoryId`, so `ProductFormPage.fill()` selects one (seed it with
  `api.ensureCategory()`). The API client omits the field entirely (which is
  allowed), so API-seeded products don't need it.
- **`accountingPeriods` changes POS gating.** When ON, selling needs an open
  period → open shift. Specs that need it enable it via `api.withFlags(...)` and
  restore it; the rest run with it OFF (default).
- **Feature-flag defaults drift from older notes** — assert against live flags or
  set them explicitly (e.g. the New-Sale negative test forces `installments`
  OFF to assert `/sales/new` still opens but hides the installment option).

## 6. Adding a new screen

1. Add the `data-testid`s to the component and register them in
   `helpers/testids.ts` + `TESTID-MAP.md`.
2. Add a Page Object under `pages/` and expose it as a fixture in
   `fixtures/test.ts`.
3. Add a spec under `specs/<area>/`. Re-use `api.ts` for setup/cleanup.
4. Update `TEST-PLAN.md` (flip the case from _planned_ to _implemented_).
