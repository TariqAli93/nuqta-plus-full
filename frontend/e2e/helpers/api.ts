import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';
import { ENV } from './env';

/**
 * Thin REST client over the Nuqta Plus backend, used ONLY for test setup and
 * cleanup (seeding products/stock, snapshotting feature flags, closing dangling
 * shifts/periods, deleting created rows). User-facing behaviour is always
 * exercised through the browser in the specs — never here.
 *
 * All calls hit ENV.apiURL with an absolute path so the client is independent
 * of the Playwright context's baseURL.
 */

type Json = Record<string, any>;

export interface SessionPayload {
  token: string;
  user: Json;
  featureFlags: Record<string, boolean>;
  capabilities: Json;
  scope: Json | null;
  setupMode?: string;
  appMode?: string;
}

export class ApiClient {
  private constructor(
    private readonly request: APIRequestContext,
    public token: string,
    public session: SessionPayload,
  ) {}

  /** Log in and return a ready-to-use authenticated client. */
  static async signIn(
    request: APIRequestContext,
    creds: { username: string; password: string } = ENV.admin,
  ): Promise<ApiClient> {
    const res = await request.post(`${ENV.apiURL}/auth/login`, { data: creds });
    expect(res.ok(), `login failed (${res.status()}): ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const data = body.data ?? body;
    const session: SessionPayload = {
      token: data.token,
      user: data.user,
      featureFlags: data.featureFlags ?? {},
      capabilities: data.capabilities ?? {},
      scope: data.scope ?? null,
      setupMode: data.setupMode,
      appMode: data.appMode,
    };
    return new ApiClient(request, data.token, session);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async unwrap(res: import('@playwright/test').APIResponse, label: string) {
    expect(res.ok(), `${label} failed (${res.status()}): ${await res.text()}`).toBeTruthy();
    const body = await res.json().catch(() => ({}));
    return body.data ?? body;
  }

  async get(path: string) {
    return this.request.get(`${ENV.apiURL}${path}`, { headers: this.headers() });
  }
  async post(path: string, data?: Json) {
    return this.request.post(`${ENV.apiURL}${path}`, { headers: this.headers(), data });
  }
  async put(path: string, data?: Json) {
    return this.request.put(`${ENV.apiURL}${path}`, { headers: this.headers(), data });
  }
  async del(path: string) {
    return this.request.delete(`${ENV.apiURL}${path}`, { headers: this.headers() });
  }

  // ── Feature flags ──────────────────────────────────────────────────────────
  async getFlags(): Promise<Record<string, boolean>> {
    const data = await this.unwrap(await this.get('/feature-flags'), 'getFlags');
    return data.flags ?? data;
  }

  async setFlags(overrides: Record<string, boolean>) {
    return this.unwrap(await this.put('/feature-flags', overrides), 'setFlags');
  }

  /**
   * Apply flag overrides and return a restore() that puts the affected keys
   * back exactly as they were — so a spec never leaves the running app in a
   * changed state.
   */
  async withFlags(overrides: Record<string, boolean>): Promise<() => Promise<void>> {
    const before = await this.getFlags();
    const previous: Record<string, boolean> = {};
    for (const key of Object.keys(overrides)) previous[key] = before[key] ?? false;
    await this.setFlags(overrides);
    return async () => {
      await this.setFlags(previous);
    };
  }

  // ── Products ────────────────────────────────────────────────────────────────
  async createProduct(p: {
    name: string;
    sellingPrice: number;
    costPrice?: number;
    currency?: string;
    sku?: string;
    productType?: 'inventory' | 'service';
  }) {
    return this.unwrap(
      await this.post('/products', {
        name: p.name,
        sku: p.sku,
        sellingPrice: p.sellingPrice,
        costPrice: p.costPrice ?? Math.max(1, Math.floor(p.sellingPrice * 0.6)),
        currency: p.currency ?? 'IQD',
        productType: p.productType ?? 'inventory',
      }),
      'createProduct',
    );
  }

  async deleteProduct(id: number | string) {
    // Best-effort cleanup: a product referenced by a sale cannot be deleted,
    // which is fine — swallow the rejection.
    await this.del(`/products/${id}`).catch(() => {});
  }

  async listProducts(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}&limit=50` : '?limit=50';
    return this.unwrap(await this.get(`/products${q}`), 'listProducts');
  }

  // ── Warehouses / stock ───────────────────────────────────────────────────────
  private _warehouseId: number | null = null;
  async resolveWarehouseId(): Promise<number> {
    if (ENV.warehouseId) return ENV.warehouseId;
    if (this._warehouseId) return this._warehouseId;
    const data = await this.unwrap(await this.get('/warehouses'), 'getWarehouses');
    const list: Json[] = Array.isArray(data) ? data : (data.items ?? []);
    const wh = list.find((w) => w.isActive !== false) ?? list[0];
    expect(wh?.id, 'no warehouse found — set NUQTA_WAREHOUSE_ID').toBeTruthy();
    this._warehouseId = Number(wh.id);
    return this._warehouseId;
  }

  /** Increase a product's stock via an inventory movement (opening balance). */
  async addStock(productId: number | string, quantity: number, warehouseId?: number) {
    const wid = warehouseId ?? (await this.resolveWarehouseId());
    return this.unwrap(
      await this.post('/inventory/adjust', {
        productId: Number(productId),
        warehouseId: wid,
        quantityChange: quantity,
        movementType: 'opening_balance',
        reason: 'e2e seed',
      }),
      'addStock',
    );
  }

  // ── Accounting periods ────────────────────────────────────────────────────────
  async openPeriod(type: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily', notes?: string) {
    return this.unwrap(await this.post('/accounting-periods', { type, notes }), 'openPeriod');
  }
  async closePeriod(id: number | string) {
    return this.unwrap(await this.post(`/accounting-periods/${id}/close`, {}), 'closePeriod');
  }
  async currentPeriod() {
    const data = await this.unwrap(await this.get('/accounting-periods/current'), 'currentPeriod');
    return data ?? null;
  }
  async listPeriods(): Promise<Json[]> {
    const data = await this.unwrap(await this.get('/accounting-periods'), 'listPeriods');
    return Array.isArray(data) ? data : (data.items ?? []);
  }
  /** Close every open period — hermetic reset for period-dependent specs. */
  async closeAllOpenPeriods() {
    const periods = await this.listPeriods().catch(() => []);
    for (const p of periods.filter((x) => x.status === 'open')) {
      await this.closePeriod(p.id).catch(() => {});
    }
  }

  // ── Cash sessions / shifts ──────────────────────────────────────────────────
  async openShift(openingCash = 0, currency = 'IQD') {
    return this.unwrap(
      await this.post('/cash-sessions/open', { openingCash, currency }),
      'openShift',
    );
  }
  async closeShift(id: number | string, closingCash = 0) {
    return this.unwrap(
      await this.post(`/cash-sessions/${id}/close`, { closingCash }),
      'closeShift',
    );
  }
  async currentShift() {
    const data = await this.unwrap(await this.get('/cash-sessions/current'), 'currentShift');
    return data ?? null;
  }
  /** Close the acting user's open shift if there is one. */
  async closeOpenShift() {
    const cur = await this.currentShift().catch(() => null);
    if (cur?.id) await this.closeShift(cur.id, cur.expectedCash ?? cur.openingCash ?? 0).catch(() => {});
  }

  // ── Sales / returns ──────────────────────────────────────────────────────────
  async createSale(sale: {
    items: { productId: number; quantity: number; unitPrice: number }[];
    currency?: string;
    paidAmount?: number;
    paymentMethod?: 'cash' | 'card';
  }) {
    const total = sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    return this.unwrap(
      await this.post('/sales', {
        items: sale.items,
        currency: sale.currency ?? 'IQD',
        saleSource: 'POS',
        saleType: 'CASH',
        paymentMethod: sale.paymentMethod ?? 'cash',
        paidAmount: sale.paidAmount ?? total,
      }),
      'createSale',
    );
  }
  async getSale(id: number | string) {
    return this.unwrap(await this.get(`/sales/${id}`), 'getSale');
  }
  async createReturn(
    saleId: number | string,
    items: { saleItemId?: number; productId?: number; quantity: number; unitId?: number | null }[],
    opts: { refundAmount?: number; refundMethod?: 'cash' | 'card' | 'credit'; reason?: string } = {},
  ) {
    return this.unwrap(
      await this.post(`/sales/${saleId}/return`, {
        items,
        refundAmount: opts.refundAmount ?? 0,
        refundMethod: opts.refundMethod ?? 'cash',
        reason: opts.reason,
      }),
      'createReturn',
    );
  }

  // ── Misc setup helpers ────────────────────────────────────────────────────────
  async createCategory(name: string) {
    return this.unwrap(await this.post('/categories', { name }), 'createCategory');
  }

  async listCategories(): Promise<Json[]> {
    const data = await this.unwrap(await this.get('/categories?limit=1000'), 'listCategories');
    return Array.isArray(data) ? data : (data.items ?? []);
  }

  /** Reuse a category by name, creating it once if missing (stable across runs). */
  async ensureCategory(name: string): Promise<Json> {
    const existing = (await this.listCategories().catch(() => [])).find((c) => c.name === name);
    return existing ?? this.createCategory(name);
  }
  async createCustomer(c: { name: string; phone?: string }) {
    return this.unwrap(await this.post('/customers', c), 'createCustomer');
  }
  async createExpense(e: { category: string; amount: number; currency?: string; note?: string }) {
    return this.unwrap(
      await this.post('/expenses', { currency: 'IQD', ...e }),
      'createExpense',
    );
  }

  async resolveBranchId(): Promise<number | null> {
    const data = await this.unwrap(await this.get('/branches'), 'getBranches').catch(() => null);
    const list: Json[] = Array.isArray(data) ? data : (data?.items ?? []);
    return list[0]?.id ?? null;
  }

  async createUser(u: {
    username: string;
    password: string;
    fullName: string;
    role?: string;
    assignedBranchId?: number | null;
  }) {
    return this.unwrap(
      await this.post('/users', {
        role: 'cashier',
        ...u,
      }),
      'createUser',
    );
  }

  async deleteUser(id: number | string) {
    await this.del(`/users/${id}`).catch(() => {});
  }
}

/**
 * Build a standalone authenticated client backed by its own request context.
 * Use inside `test.beforeAll` / `test.afterAll`, where the test-scoped `api`
 * fixture is unavailable. Dispose the returned context when done.
 */
export async function createApiClient(creds = ENV.admin) {
  const ctx = await playwrightRequest.newContext();
  const client = await ApiClient.signIn(ctx, creds);
  return { client, dispose: () => ctx.dispose() };
}
