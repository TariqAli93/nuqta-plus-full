import crypto from 'crypto';
import { getDb, getPool, saveDatabase } from '../../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  deliveryProviders,
  deliveryShipments,
  deliveryEvents,
  deliveryWebhookLogs,
  deliveryActionLogs,
  sales,
  customers,
  onlineOrders,
  onlineOrderItems,
  saleItems,
  salesChannels,
} from '../../models/index.js';
import * as schema from '../../models/index.js';
import { and, eq, ne, or, desc, sql, ilike, gte, lte } from 'drizzle-orm';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AppError,
} from '../../utils/errors.js';
import {
  DELIVERY_STATUS,
  DELIVERY_EVENT_TYPE,
  DELIVERY_ACTION,
  DELIVERY_TERMINAL_STATUSES,
  isValidDeliveryStatus,
  boxyBaseUrl,
} from '../../constants/delivery.js';
import {
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
} from '../../constants/orders.js';
import { resolveAdapter, IMPLEMENTED_ADAPTERS } from './adapters/index.js';
import { encrypt, decrypt } from '../notifications/crypto.js';
import { OnlineOrderService } from '../onlineOrderService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('DeliveryService');
const onlineOrderService = new OnlineOrderService();

async function withTransaction(callback) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txDb = drizzle(client, { schema });
    const result = await callback(txDb);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const money = (v) => (Number(v) || 0).toFixed(4);

/**
 * Stable idempotency key for an inbound webhook. Prefers the provider's own
 * event id; otherwise hashes provider + shipment + status + raw body, so an
 * identical replayed delivery dedupes to the same key.
 */
function webhookDedupeKey(providerCode, shipmentId, parsed, rawBody) {
  if (parsed.eventId) return `${providerCode}:evt:${parsed.eventId}`;
  const basis = `${shipmentId}|${parsed.providerStatus || ''}|${parsed.occurredAt || ''}|${
    rawBody || JSON.stringify(parsed)
  }`;
  return `${providerCode}:hash:${crypto.createHash('sha256').update(basis).digest('hex')}`;
}

// Canonical delivery status → online-order workflow status (best-effort sync).
const ORDER_STATUS_FROM_SHIPMENT = {
  [DELIVERY_STATUS.DELIVERED]: ORDER_STATUS_DELIVERED,
  [DELIVERY_STATUS.RETURNED]: ORDER_STATUS_RETURNED,
};

export class DeliveryService {
  // ── Providers ──────────────────────────────────────────────────────────────
  /**
   * Strip secrets before a provider row ever leaves the service. The raw
   * (encrypted) credential columns are dropped entirely and replaced with
   * boolean "is it set" flags + a fixed placeholder — the plaintext key is
   * NEVER decrypted for display, so it can never reach the frontend.
   */
  _maskProvider(row) {
    if (!row) return row;
    const { apiKeyEncrypted, apiSecretEncrypted, webhookSecretEncrypted, credentialsEncrypted, ...rest } =
      row;
    const cfg = row.config || {};
    const isBoxy = row.code === 'BOXY' || row.adapterKey === 'BOXY';
    const baseUrl = isBoxy ? boxyBaseUrl(cfg.environment) || cfg.baseUrl || null : cfg.baseUrl || null;

    // Connection status: needs both credentials, then reflects the last test.
    let connectionStatus = 'not_configured';
    if (apiKeyEncrypted && apiSecretEncrypted) {
      if (cfg.lastTestStatus === 'success') connectionStatus = 'connected';
      else if (cfg.lastTestStatus === 'failed') connectionStatus = 'failed';
    }

    return {
      ...rest,
      environment: cfg.environment || null,
      baseUrl,
      hasApiKey: !!apiKeyEncrypted,
      apiKeyMasked: apiKeyEncrypted ? '••••••••' : '',
      hasApiSecret: !!apiSecretEncrypted,
      apiSecretMasked: apiSecretEncrypted ? '••••••••' : '',
      hasWebhookSecret: !!webhookSecretEncrypted,
      hasCredentials: !!credentialsEncrypted,
      connectionStatus,
      lastTestAt: cfg.lastTestAt || null,
      lastTestStatus: cfg.lastTestStatus || null,
      lastTestMessage: cfg.lastTestMessage || null,
      lastSuccessfulTestAt: cfg.lastSuccessfulTestAt || null,
      isImplemented:
        IMPLEMENTED_ADAPTERS.includes(row.adapterKey) || IMPLEMENTED_ADAPTERS.includes(row.code),
    };
  }

  /** Internal: provider row with decrypted secrets, for adapter use only. */
  async _loadProviderForAdapter(where) {
    const db = await getDb();
    const [row] = await db.select().from(deliveryProviders).where(where).limit(1);
    if (!row) throw new NotFoundError('Delivery provider');
    // The extra credentials bag (username + access token) is an encrypted JSON
    // blob — decode it defensively (a corrupt/legacy value must not break the
    // adapter, which may not need these fields at all).
    let username = null;
    let accessToken = null;
    if (row.credentialsEncrypted) {
      try {
        const bag = JSON.parse(decrypt(row.credentialsEncrypted) || '{}');
        username = bag.username ?? null;
        accessToken = bag.accessToken ?? null;
      } catch {
        /* ignore malformed credentials bag */
      }
    }
    return {
      ...row,
      apiKey: decrypt(row.apiKeyEncrypted),
      apiSecret: decrypt(row.apiSecretEncrypted),
      webhookSecret: decrypt(row.webhookSecretEncrypted),
      baseUrl: (row.config && row.config.baseUrl) || null,
      username,
      accessToken,
    };
  }

  async listProviders() {
    const db = await getDb();
    const rows = await db.select().from(deliveryProviders).orderBy(desc(deliveryProviders.isActive), deliveryProviders.id);
    return rows.map((r) => this._maskProvider(r));
  }

  async getProvider(id) {
    const db = await getDb();
    const [row] = await db.select().from(deliveryProviders).where(eq(deliveryProviders.id, Number(id))).limit(1);
    if (!row) throw new NotFoundError('Delivery provider');
    return this._maskProvider(row);
  }

  /** Update a provider's settings + (optionally) its encrypted credentials. */
  async updateProvider(id, data) {
    const db = await getDb();
    const [existing] = await db
      .select()
      .from(deliveryProviders)
      .where(eq(deliveryProviders.id, Number(id)))
      .limit(1);
    if (!existing) throw new NotFoundError('Delivery provider');

    const setPayload = { updatedAt: new Date() };
    for (const f of ['name', 'adapterKey', 'isActive']) {
      if (Object.prototype.hasOwnProperty.call(data, f)) setPayload[f] = data[f];
    }
    const makeDefault =
      Object.prototype.hasOwnProperty.call(data, 'isDefault') && data.isDefault === true;
    if (Object.prototype.hasOwnProperty.call(data, 'isDefault')) {
      setPayload.isDefault = !!data.isDefault;
    }

    // Merge config (preserve lastTest* and other keys); `environment` is a
    // first-class field that lands in config and drives the base URL.
    const nextConfig = { ...(existing.config || {}) };
    if (Object.prototype.hasOwnProperty.call(data, 'config') && data.config) {
      Object.assign(nextConfig, data.config);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'environment')) {
      nextConfig.environment = data.environment;
    }
    // Generic providers set their API base URL directly (Boxy derives it from
    // the environment instead).
    if (Object.prototype.hasOwnProperty.call(data, 'baseUrl')) {
      nextConfig.baseUrl = data.baseUrl || null;
    }
    setPayload.config = nextConfig;

    // Secrets: empty string clears, undefined leaves untouched, a value re-encrypts.
    if (Object.prototype.hasOwnProperty.call(data, 'apiKey')) {
      setPayload.apiKeyEncrypted = data.apiKey ? encrypt(data.apiKey) : null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'apiSecret')) {
      setPayload.apiSecretEncrypted = data.apiSecret ? encrypt(data.apiSecret) : null;
    } else if (Object.prototype.hasOwnProperty.call(data, 'password')) {
      // Generic providers expose "Password" which maps onto the api-secret slot.
      setPayload.apiSecretEncrypted = data.password ? encrypt(data.password) : null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'webhookSecret')) {
      setPayload.webhookSecretEncrypted = data.webhookSecret ? encrypt(data.webhookSecret) : null;
    }
    // Extra credentials (username + access token) → encrypted JSON bag, with the
    // same empty=clear / undefined=keep semantics, per field.
    if (
      Object.prototype.hasOwnProperty.call(data, 'username') ||
      Object.prototype.hasOwnProperty.call(data, 'accessToken')
    ) {
      let bag = {};
      if (existing.credentialsEncrypted) {
        try {
          bag = JSON.parse(decrypt(existing.credentialsEncrypted) || '{}');
        } catch {
          bag = {};
        }
      }
      if (Object.prototype.hasOwnProperty.call(data, 'username')) {
        if (data.username) bag.username = data.username;
        else delete bag.username;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'accessToken')) {
        if (data.accessToken) bag.accessToken = data.accessToken;
        else delete bag.accessToken;
      }
      setPayload.credentialsEncrypted = Object.keys(bag).length ? encrypt(JSON.stringify(bag)) : null;
    }
    // Setting this provider as default must clear any other default in the same
    // transaction (the partial unique index allows only one).
    let row;
    if (makeDefault) {
      row = await withTransaction(async (tx) => {
        await tx
          .update(deliveryProviders)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(ne(deliveryProviders.id, Number(id)), eq(deliveryProviders.isDefault, true)));
        const [r] = await tx
          .update(deliveryProviders)
          .set(setPayload)
          .where(eq(deliveryProviders.id, Number(id)))
          .returning();
        saveDatabase();
        return r;
      });
    } else {
      [row] = await db
        .update(deliveryProviders)
        .set(setPayload)
        .where(eq(deliveryProviders.id, Number(id)))
        .returning();
      saveDatabase();
    }
    if (!row) throw new NotFoundError('Delivery provider');
    return this._maskProvider(row);
  }

  /** Make a provider THE default, clearing any other default atomically. */
  async setDefaultProvider(id) {
    const pid = Number(id);
    const row = await withTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(deliveryProviders)
        .where(eq(deliveryProviders.id, pid))
        .limit(1);
      if (!existing) throw new NotFoundError('Delivery provider');
      await tx
        .update(deliveryProviders)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(ne(deliveryProviders.id, pid), eq(deliveryProviders.isDefault, true)));
      const [r] = await tx
        .update(deliveryProviders)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(deliveryProviders.id, pid))
        .returning();
      saveDatabase();
      return r;
    });
    return this._maskProvider(row);
  }

  /**
   * Resolve a provider (with decrypted credentials) from
   * {providerId|providerCode}, falling back to the default when neither is
   * given. Throws a friendly error when nothing matches and none was specified.
   */
  async _resolveProvider(ref = {}) {
    let where;
    if (ref.providerId) where = eq(deliveryProviders.id, Number(ref.providerId));
    else if (ref.providerCode) where = eq(deliveryProviders.code, ref.providerCode);
    else where = eq(deliveryProviders.isDefault, true);
    try {
      return await this._loadProviderForAdapter(where);
    } catch (err) {
      if (!ref.providerId && !ref.providerCode && err instanceof NotFoundError) {
        throw new ValidationError('لم يتم تحديد شركة توصيل ولا توجد شركة افتراضية.');
      }
      throw err;
    }
  }

  /**
   * Test the saved credentials against the provider's API (server-side only —
   * the frontend never calls the provider). Records the outcome on the provider
   * config (lastTestAt/Status/Message, and lastSuccessfulTestAt on success).
   */
  async testConnection(id) {
    const provider = await this._loadProviderForAdapter(eq(deliveryProviders.id, Number(id)));
    const adapter = resolveAdapter(provider);
    if (typeof adapter.testConnection !== 'function') {
      throw new ConflictError('هذا المزود لا يدعم اختبار الاتصال.');
    }

    let result;
    try {
      result = await adapter.testConnection();
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    const now = new Date().toISOString();
    const cfg = { ...(provider.config || {}) };
    cfg.lastTestAt = now;
    cfg.lastTestStatus = result.ok ? 'success' : 'failed';
    cfg.lastTestMessage = result.ok ? 'OK' : result.error || 'Connection failed';
    if (result.ok) cfg.lastSuccessfulTestAt = now;

    const db = await getDb();
    const [row] = await db
      .update(deliveryProviders)
      .set({ config: cfg, updatedAt: new Date() })
      .where(eq(deliveryProviders.id, Number(id)))
      .returning();
    saveDatabase();

    return {
      ok: result.ok,
      message: cfg.lastTestMessage,
      provider: this._maskProvider(row),
    };
  }

  // ── Shipments ───────────────────────────────────────────────────────────────
  /**
   * Create a shipment for an online order and dispatch it to the provider.
   *
   * Local writes (the shipment row + CREATED event) happen in a transaction;
   * the provider HTTP call is then made and the outcome recorded as a second
   * transaction (SUBMITTED + tracking, or FAILED + error). This is the standard
   * shape for an external-call integration — the local record is never lost
   * even if the provider call fails.
   */
  async createShipment(input, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const db = await getDb();

    // ── Resolve the source: an online order and/or a sale ─────────────────────
    let order = null;
    let onlineOrderId = input.onlineOrderId ? Number(input.onlineOrderId) : null;
    let saleId = input.saleId ? Number(input.saleId) : null;
    let sale = null;

    if (onlineOrderId) {
      order = await onlineOrderService.getById(onlineOrderId);
      if (order.status === 'CANCELLED') throw new ConflictError('لا يمكن إنشاء شحنة لطلب ملغي.');
      if (!saleId) saleId = order.convertedSaleId || null;
    }
    if (saleId) {
      [sale] = await db
        .select({
          id: sales.id,
          status: sales.status,
          onlineOrderId: sales.onlineOrderId,
          total: sales.total,
          currency: sales.currency,
          customerId: sales.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerAddress: customers.address,
          customerCity: customers.city,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(eq(sales.id, saleId))
        .limit(1);
      if (!sale) throw new NotFoundError('Sale');
      if (sale.status === 'cancelled') throw new ConflictError('لا يمكن إنشاء شحنة لفاتورة ملغاة.');
      if (!onlineOrderId && sale.onlineOrderId) onlineOrderId = sale.onlineOrderId;
    }
    if (!order && !sale) {
      throw new ValidationError('يلزم تحديد طلب أو فاتورة لإنشاء الشحنة.');
    }

    // ── One active shipment per order/sale (a terminal one can be superseded) ─
    const refs = [];
    if (onlineOrderId) refs.push(eq(deliveryShipments.onlineOrderId, onlineOrderId));
    if (saleId) refs.push(eq(deliveryShipments.saleId, saleId));
    const existing = await db
      .select({ id: deliveryShipments.id, status: deliveryShipments.status })
      .from(deliveryShipments)
      .where(refs.length === 1 ? refs[0] : or(...refs));
    if (existing.some((s) => !DELIVERY_TERMINAL_STATUSES.includes(s.status))) {
      throw new ConflictError('توجد شحنة نشطة لهذا الطلب/الفاتورة بالفعل.');
    }

    const provider = await this._resolveProvider({
      providerId: input.providerId,
      providerCode: input.providerCode,
    });
    if (!provider.isActive) {
      throw new ConflictError(`شركة التوصيل "${provider.name}" غير مفعّلة.`);
    }
    const adapter = resolveAdapter(provider);

    // Recipient/COD defaults from the source; dialog input always wins.
    const def = (a, b) => (a != null && a !== '' ? a : b);
    const recipientName = def(input.recipientName, order?.customerName ?? sale?.customerName ?? '');
    const recipientPhone = def(input.recipientPhone, order?.customerPhone ?? sale?.customerPhone ?? null);
    const recipientAddress = def(input.recipientAddress, order?.customerAddress ?? sale?.customerAddress ?? null);
    const province = def(input.province, order?.province ?? sale?.customerCity ?? null);
    const sourceTotal = order?.totalAmount ?? sale?.total ?? 0;

    // Insert the local PENDING shipment + CREATED event atomically.
    const shipment = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(deliveryShipments)
        .values({
          providerId: provider.id,
          onlineOrderId: onlineOrderId || null,
          saleId: saleId || null,
          status: DELIVERY_STATUS.PENDING,
          recipientName,
          recipientPhone,
          secondaryPhone: input.secondaryPhone || null,
          province,
          region: input.region || null,
          recipientAddress,
          description: input.description || null,
          size: input.size || null,
          fragile: !!input.fragile,
          readyToPickup: !!input.readyToPickup,
          paymentType: input.paymentType || 'COLLECT_ON_DELIVERY',
          feeType: input.feeType || 'BY_MERCHANT',
          codAmount: money(input.codAmount != null ? input.codAmount : sourceTotal),
          deliveryFee: money(input.deliveryFee || 0),
          currency: input.currency || sale?.currency || 'IQD',
          notes: input.notes || null,
          createdBy: userId ?? null,
        })
        .returning();
      await tx.insert(deliveryEvents).values({
        shipmentId: row.id,
        eventType: DELIVERY_EVENT_TYPE.CREATED,
        status: DELIVERY_STATUS.PENDING,
        message: `تم إنشاء الشحنة لدى "${provider.name}"`,
        createdBy: userId ?? null,
      });
      saveDatabase();
      return row;
    });

    // Dispatch to the provider (external).
    let result;
    try {
      result = await adapter.createShipment(shipment);
    } catch (err) {
      await this._logAction({
        action: DELIVERY_ACTION.CREATE,
        shipmentId: shipment.id,
        provider,
        request: shipment,
        result: { ok: false, error: err.message },
        userId,
      });
      await this._applyStatus(shipment.id, DELIVERY_STATUS.FAILED, {
        eventType: DELIVERY_EVENT_TYPE.ERROR,
        message: err.message,
        userId,
      });
      throw err; // surfaces 501/400/etc. to the caller; shipment kept as FAILED
    }
    await this._logAction({
      action: DELIVERY_ACTION.CREATE,
      shipmentId: shipment.id,
      provider,
      request: shipment,
      result,
      userId,
    });

    if (!result.ok) {
      await this._applyStatus(shipment.id, DELIVERY_STATUS.FAILED, {
        eventType: DELIVERY_EVENT_TYPE.ERROR,
        providerStatus: result.providerStatus,
        message: result.error || 'Provider rejected the shipment',
        payload: result.response || null,
        responsePayload: result.response || null,
        userId,
      });
      return this.getShipmentById(shipment.id);
    }

    await this._applyStatus(shipment.id, result.status || DELIVERY_STATUS.SUBMITTED, {
      eventType: DELIVERY_EVENT_TYPE.STATUS_UPDATE,
      providerStatus: result.providerStatus,
      message: 'تم قبول الشحنة من شركة التوصيل',
      payload: result.response || null,
      responsePayload: result.response || null,
      providerShipmentId: result.providerShipmentId || null,
      platformCode: result.platformCode || null,
      trackingNumber: result.trackingNumber || null,
      trackingUrl: result.trackingUrl || null,
      userId,
    });
    return this.getShipmentById(shipment.id);
  }

  async getShipmentById(id) {
    const db = await getDb();
    const [shipment] = await db
      .select({
        id: deliveryShipments.id,
        shipmentNumber: deliveryShipments.shipmentNumber,
        providerId: deliveryShipments.providerId,
        providerName: deliveryProviders.name,
        providerCode: deliveryProviders.code,
        onlineOrderId: deliveryShipments.onlineOrderId,
        saleId: deliveryShipments.saleId,
        status: deliveryShipments.status,
        providerShipmentId: deliveryShipments.providerShipmentId,
        platformCode: deliveryShipments.platformCode,
        providerStatus: deliveryShipments.providerStatus,
        trackingNumber: deliveryShipments.trackingNumber,
        trackingUrl: deliveryShipments.trackingUrl,
        recipientName: deliveryShipments.recipientName,
        recipientPhone: deliveryShipments.recipientPhone,
        secondaryPhone: deliveryShipments.secondaryPhone,
        province: deliveryShipments.province,
        region: deliveryShipments.region,
        recipientAddress: deliveryShipments.recipientAddress,
        description: deliveryShipments.description,
        size: deliveryShipments.size,
        fragile: deliveryShipments.fragile,
        readyToPickup: deliveryShipments.readyToPickup,
        paymentType: deliveryShipments.paymentType,
        feeType: deliveryShipments.feeType,
        codAmount: deliveryShipments.codAmount,
        deliveryFee: deliveryShipments.deliveryFee,
        currency: deliveryShipments.currency,
        notes: deliveryShipments.notes,
        // Raw provider exchange (Boxy response data).
        requestPayload: deliveryShipments.requestPayload,
        responsePayload: deliveryShipments.responsePayload,
        lastSyncedAt: deliveryShipments.lastSyncedAt,
        createdAt: deliveryShipments.createdAt,
        updatedAt: deliveryShipments.updatedAt,
        // Related order / sale summaries.
        orderNumber: onlineOrders.orderNumber,
        orderStatus: onlineOrders.status,
        invoiceNumber: sales.invoiceNumber,
        saleStatus: sales.status,
        saleTotal: sales.total,
      })
      .from(deliveryShipments)
      .leftJoin(deliveryProviders, eq(deliveryShipments.providerId, deliveryProviders.id))
      .leftJoin(onlineOrders, eq(deliveryShipments.onlineOrderId, onlineOrders.id))
      .leftJoin(sales, eq(deliveryShipments.saleId, sales.id))
      .where(eq(deliveryShipments.id, Number(id)))
      .limit(1);
    if (!shipment) throw new NotFoundError('Shipment');

    const events = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.shipmentId, shipment.id))
      .orderBy(desc(deliveryEvents.createdAt), desc(deliveryEvents.id));

    // Products from the linked order (preferred) or sale.
    let products = [];
    if (shipment.onlineOrderId) {
      products = await db
        .select({
          productName: onlineOrderItems.productName,
          quantity: onlineOrderItems.quantity,
          unitPrice: onlineOrderItems.unitPrice,
        })
        .from(onlineOrderItems)
        .where(eq(onlineOrderItems.orderId, shipment.onlineOrderId))
        .orderBy(onlineOrderItems.id);
    } else if (shipment.saleId) {
      products = await db
        .select({
          productName: saleItems.productName,
          quantity: saleItems.quantity,
          unitPrice: saleItems.unitPrice,
        })
        .from(saleItems)
        .where(eq(saleItems.saleId, shipment.saleId))
        .orderBy(saleItems.id);
    }

    // Does this provider's adapter support label printing? (No creds needed to
    // check the capability — pass a bare provider descriptor.)
    let labelSupported = false;
    try {
      const adapter = resolveAdapter({ code: shipment.providerCode });
      labelSupported = typeof adapter.getLabel === 'function';
    } catch {
      labelSupported = false;
    }

    return { ...shipment, events, products, labelSupported };
  }

  /**
   * Fetch a printable label URL for a shipment, if the provider supports it.
   * (Boxy: not implemented yet → "not supported".) Server-side only.
   */
  async getLabel(id, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const shipment = await this.getShipmentById(id);
    const provider = await this._loadProviderForAdapter(eq(deliveryProviders.id, shipment.providerId));
    const adapter = resolveAdapter(provider);
    if (typeof adapter.getLabel !== 'function') {
      throw new ConflictError('طباعة الملصق غير مدعومة لهذا المزود.');
    }
    const result = await adapter.getLabel(shipment);
    await this._logAction({
      action: DELIVERY_ACTION.LABEL,
      shipmentId: shipment.id,
      provider,
      request: { ref: shipment.providerShipmentId || shipment.trackingNumber },
      result,
      userId,
    });
    if (!result?.ok || !result.url) {
      throw new AppError(result?.error || 'تعذّر جلب ملصق الشحنة', 502);
    }
    return { url: result.url };
  }

  /**
   * Quote shipping cost for a provider (id | code | default). Optional adapter
   * capability — unsupported providers raise a friendly 409, like getLabel.
   */
  async calculateCost(ref = {}, input = {}, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const provider = await this._resolveProvider(ref);
    const adapter = resolveAdapter(provider);
    if (typeof adapter.calculateCost !== 'function') {
      throw new ConflictError('حساب تكلفة الشحن غير مدعوم لهذا المزود.');
    }
    let result;
    try {
      result = await adapter.calculateCost(input);
    } catch (err) {
      await this._logAction({
        action: DELIVERY_ACTION.QUOTE,
        provider,
        request: input,
        result: { ok: false, error: err.message },
        userId,
      });
      throw err;
    }
    await this._logAction({ action: DELIVERY_ACTION.QUOTE, provider, request: input, result, userId });
    if (!result?.ok) throw new AppError(result?.error || 'تعذّر حساب تكلفة الشحن', 502);
    return {
      cost: Number(result.cost) || 0,
      currency: result.currency || input.currency || 'IQD',
      breakdown: result.breakdown || null,
    };
  }

  async listShipments(filters = {}) {
    const db = await getDb();
    const {
      page = 1,
      limit = 20,
      status,
      providerId,
      channelId,
      onlineOrderId,
      saleId,
      dateFrom,
      dateTo,
      search,
    } = filters;

    // Channel of a shipment = the order's channel, else the sale's channel.
    const channelExpr = sql`COALESCE(${onlineOrders.channelId}, ${sales.channelId})`;

    const conditions = [];
    if (status && isValidDeliveryStatus(status)) conditions.push(eq(deliveryShipments.status, status));
    if (providerId) conditions.push(eq(deliveryShipments.providerId, Number(providerId)));
    if (onlineOrderId) conditions.push(eq(deliveryShipments.onlineOrderId, Number(onlineOrderId)));
    if (saleId) conditions.push(eq(deliveryShipments.saleId, Number(saleId)));
    if (channelId) conditions.push(sql`${channelExpr} = ${Number(channelId)}`);
    if (dateFrom) conditions.push(gte(sql`${deliveryShipments.createdAt}::date`, dateFrom));
    if (dateTo) conditions.push(lte(sql`${deliveryShipments.createdAt}::date`, dateTo));
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          ilike(onlineOrders.orderNumber, term),
          ilike(sales.invoiceNumber, term),
          ilike(deliveryShipments.recipientName, term),
          ilike(deliveryShipments.recipientPhone, term),
          ilike(deliveryShipments.platformCode, term),
          ilike(deliveryShipments.trackingNumber, term)
        )
      );
    }
    const where = conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : and(...conditions);

    // Shared joins (data + count) so channel/search/order/invoice filters resolve.
    const withJoins = (q) =>
      q
        .from(deliveryShipments)
        .leftJoin(deliveryProviders, eq(deliveryShipments.providerId, deliveryProviders.id))
        .leftJoin(onlineOrders, eq(deliveryShipments.onlineOrderId, onlineOrders.id))
        .leftJoin(sales, eq(deliveryShipments.saleId, sales.id))
        .leftJoin(salesChannels, sql`${salesChannels.id} = ${channelExpr}`);

    let query = withJoins(
      db.select({
        id: deliveryShipments.id,
        shipmentNumber: deliveryShipments.shipmentNumber,
        providerId: deliveryShipments.providerId,
        providerName: deliveryProviders.name,
        providerCode: deliveryProviders.code,
        onlineOrderId: deliveryShipments.onlineOrderId,
        orderNumber: onlineOrders.orderNumber,
        saleId: deliveryShipments.saleId,
        invoiceNumber: sales.invoiceNumber,
        channelId: channelExpr,
        channelName: salesChannels.name,
        status: deliveryShipments.status,
        providerStatus: deliveryShipments.providerStatus,
        platformCode: deliveryShipments.platformCode,
        trackingNumber: deliveryShipments.trackingNumber,
        recipientName: deliveryShipments.recipientName,
        recipientPhone: deliveryShipments.recipientPhone,
        province: deliveryShipments.province,
        codAmount: deliveryShipments.codAmount,
        deliveryFee: deliveryShipments.deliveryFee,
        currency: deliveryShipments.currency,
        lastSyncedAt: deliveryShipments.lastSyncedAt,
        createdAt: deliveryShipments.createdAt,
      })
    );
    if (where) query = query.where(where);

    let countQuery = withJoins(db.select({ count: sql`count(*)` }));
    if (where) countQuery = countQuery.where(where);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const data = await query
      .orderBy(desc(deliveryShipments.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /** Poll the provider for the current status and record it. */
  async syncStatus(id, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const shipment = await this.getShipmentById(id);
    const provider = await this._loadProviderForAdapter(eq(deliveryProviders.id, shipment.providerId));
    const adapter = resolveAdapter(provider);

    const result = await adapter.getStatus(shipment);
    await this._logAction({
      action: DELIVERY_ACTION.SYNC,
      shipmentId: shipment.id,
      provider,
      request: { ref: shipment.providerShipmentId || shipment.trackingNumber },
      result,
      userId,
    });
    if (!result.ok) {
      await this._recordEvent(await getDb(), {
        shipmentId: shipment.id,
        eventType: DELIVERY_EVENT_TYPE.ERROR,
        providerStatus: result.providerStatus,
        message: result.error || 'Status sync failed',
        payload: result.response || null,
        userId,
      });
      throw new AppError(result.error || 'تعذّر تحديث حالة الشحنة من شركة التوصيل', 502);
    }

    const next = result.status && result.status !== DELIVERY_STATUS.UNKNOWN ? result.status : shipment.status;
    await this._applyStatus(shipment.id, next, {
      eventType: DELIVERY_EVENT_TYPE.SYNC,
      providerStatus: result.providerStatus,
      message: 'تمت مزامنة الحالة',
      payload: result.response || null,
      touchSyncedAt: true,
      userId,
    });
    return this.getShipmentById(shipment.id);
  }

  async cancelShipment(id, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const shipment = await this.getShipmentById(id);
    if (DELIVERY_TERMINAL_STATUSES.includes(shipment.status)) {
      throw new ConflictError(`لا يمكن إلغاء شحنة حالتها "${shipment.status}".`);
    }
    const provider = await this._loadProviderForAdapter(eq(deliveryProviders.id, shipment.providerId));
    const adapter = resolveAdapter(provider);

    const result = await adapter.cancelShipment(shipment);
    await this._logAction({
      action: DELIVERY_ACTION.CANCEL,
      shipmentId: shipment.id,
      provider,
      request: { ref: shipment.providerShipmentId || shipment.trackingNumber },
      result,
      userId,
    });
    if (!result.ok) {
      throw new AppError(result.error || 'تعذّر إلغاء الشحنة لدى شركة التوصيل', 502);
    }
    await this._applyStatus(shipment.id, DELIVERY_STATUS.CANCELLED, {
      eventType: DELIVERY_EVENT_TYPE.CANCELLED,
      message: 'تم إلغاء الشحنة',
      payload: result.response || null,
      userId,
    });
    return this.getShipmentById(shipment.id);
  }

  /**
   * Ingest an inbound provider webhook. Resolves the provider by code, verifies
   * the optional shared secret, maps the payload through the adapter, finds the
   * shipment and records the event + status.
   */
  async handleWebhook(providerCode, payload, headers = {}, rawBody = null) {
    // Every attempt is logged for debugging — including failures that never
    // reach a shipment. We build the log entry as we go and always write it.
    const logEntry = {
      providerCode,
      providerId: null,
      shipmentId: null,
      providerStatus: null,
      normalizedStatus: null,
      status: 'failed',
      errorMessage: null,
      payload,
    };
    let response = null;
    let thrown = null;

    try {
      const provider = await this._loadProviderForAdapter(eq(deliveryProviders.code, providerCode));
      logEntry.providerId = provider.id;
      const adapter = resolveAdapter(provider);

      // Signature verification (HMAC over raw body, else shared-secret header).
      if (typeof adapter.verifyWebhook === 'function') {
        const v = adapter.verifyWebhook({ rawBody, payload, headers });
        if (!v.ok) {
          const err = new AppError('Invalid webhook signature', 401);
          err.code = 'WEBHOOK_UNAUTHORIZED';
          throw err;
        }
      } else if (provider.webhookSecret) {
        const got = headers['x-webhook-secret'] || headers['X-Webhook-Secret'];
        if (got !== provider.webhookSecret) {
          const err = new AppError('Invalid webhook signature', 401);
          err.code = 'WEBHOOK_UNAUTHORIZED';
          throw err;
        }
      }

      const parsed = adapter.parseWebhook(payload, headers);
      if (!parsed.ok) throw new ValidationError(parsed.error || 'Unparseable webhook payload');
      logEntry.providerStatus = parsed.providerStatus || null;
      logEntry.normalizedStatus = parsed.status || null;

      const db = await getDb();
      const refs = [];
      if (parsed.providerShipmentId) refs.push(eq(deliveryShipments.providerShipmentId, String(parsed.providerShipmentId)));
      if (parsed.trackingNumber) refs.push(eq(deliveryShipments.trackingNumber, String(parsed.trackingNumber)));
      if (refs.length === 0) throw new ValidationError('Webhook has no shipment reference');

      const [shipment] = await db
        .select({ id: deliveryShipments.id, status: deliveryShipments.status })
        .from(deliveryShipments)
        .where(and(eq(deliveryShipments.providerId, provider.id), refs.length === 1 ? refs[0] : or(...refs)))
        .limit(1);
      if (!shipment) throw new NotFoundError('Shipment for webhook');
      logEntry.shipmentId = shipment.id;

      // ── Idempotency ──────────────────────────────────────────────────────────
      // Providers retry webhooks; the same delivery is processed once. A dedupe
      // key (provider event id, else a payload hash) is checked up-front and
      // enforced by the UNIQUE index on delivery_events.dedupe_key (race-safe).
      const dedupeKey = webhookDedupeKey(provider.code, shipment.id, parsed, rawBody);
      const [seen] = await db
        .select({ id: deliveryEvents.id })
        .from(deliveryEvents)
        .where(eq(deliveryEvents.dedupeKey, dedupeKey))
        .limit(1);
      if (seen) {
        logEntry.status = 'processed';
        logEntry.errorMessage = 'duplicate (ignored)';
        response = { ok: true, deduped: true, shipmentId: shipment.id, status: shipment.status };
      } else {
        const next = parsed.status && parsed.status !== DELIVERY_STATUS.UNKNOWN ? parsed.status : shipment.status;
        try {
          await this._applyStatus(shipment.id, next, {
            eventType: DELIVERY_EVENT_TYPE.WEBHOOK,
            providerStatus: parsed.providerStatus,
            message: 'تحديث من شركة التوصيل (webhook)',
            payload,
            occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
            dedupeKey,
          });
          logEntry.status = 'processed';
          response = { ok: true, shipmentId: shipment.id, status: next };
        } catch (err) {
          // Concurrent duplicate lost the UNIQUE race → tx rolled back. Idempotent.
          if (err?.code === '23505') {
            logEntry.status = 'processed';
            logEntry.errorMessage = 'duplicate (race)';
            response = { ok: true, deduped: true, shipmentId: shipment.id, status: shipment.status };
          } else {
            throw err;
          }
        }
      }
    } catch (e) {
      logEntry.errorMessage = e.message;
      thrown = e;
    }

    // Always record the attempt (best-effort — a log failure must not mask the
    // real outcome).
    try {
      await this._writeWebhookLog(logEntry);
    } catch (logErr) {
      log.warn(`Webhook log write failed: ${logErr.message}`);
    }

    if (thrown) throw thrown;
    return response;
  }

  async _writeWebhookLog(e) {
    const db = await getDb();
    await db.insert(deliveryWebhookLogs).values({
      providerId: e.providerId ?? null,
      providerCode: e.providerCode ?? null,
      shipmentId: e.shipmentId ?? null,
      status: e.status,
      providerStatus: e.providerStatus ?? null,
      normalizedStatus: e.normalizedStatus ?? null,
      errorMessage: e.errorMessage ?? null,
      payload: e.payload ?? null,
    });
    saveDatabase();
  }

  /** Deep-clone a payload with sensitive keys redacted, for action logging. */
  _sanitizeForLog(obj) {
    const SECRET = new Set([
      'authorization', 'apikey', 'api_key', 'apisecret', 'api_secret',
      'password', 'accesstoken', 'access_token', 'webhooksecret', 'webhook_secret',
      'x-api-key', 'x-api-secret', 'secret', 'token',
    ]);
    const seen = new WeakSet();
    const walk = (val) => {
      if (val == null || typeof val !== 'object') return val;
      if (seen.has(val)) return undefined; // break cycles
      seen.add(val);
      if (Array.isArray(val)) return val.map(walk);
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = SECRET.has(String(k).toLowerCase()) ? '[REDACTED]' : walk(v);
      }
      return out;
    };
    try {
      return walk(obj);
    } catch {
      return null;
    }
  }

  /**
   * Best-effort audit of one OUTBOUND provider call (create/cancel/sync/label/
   * quote). Never throws — a logging failure must not mask the real operation
   * outcome (mirrors _writeWebhookLog). Secrets are stripped before writing.
   */
  async _logAction({ action, shipmentId = null, provider = null, request = null, result = null, userId = null }) {
    try {
      const db = await getDb();
      await db.insert(deliveryActionLogs).values({
        shipmentId: shipmentId ?? null,
        providerId: provider?.id ?? null,
        providerCode: provider?.code ?? null,
        action,
        requestPayload: this._sanitizeForLog(request),
        responsePayload: this._sanitizeForLog(result?.response ?? result ?? null),
        success: !!result?.ok,
        errorMessage: result?.ok ? null : (result?.error ?? null),
        createdBy: userId ?? null,
      });
      saveDatabase();
    } catch (err) {
      log.warn(`Action log write failed (${action}): ${err.message}`);
    }
  }

  /** Debugging: list inbound webhook attempts (processed + failed). */
  async listWebhookLogs(filters = {}) {
    const db = await getDb();
    const { page = 1, limit = 20, providerId, providerCode, status, normalizedStatus, dateFrom, dateTo } = filters;

    const conditions = [];
    if (providerId) conditions.push(eq(deliveryWebhookLogs.providerId, Number(providerId)));
    if (providerCode) conditions.push(eq(deliveryWebhookLogs.providerCode, providerCode));
    if (status === 'processed' || status === 'failed') conditions.push(eq(deliveryWebhookLogs.status, status));
    if (normalizedStatus) conditions.push(eq(deliveryWebhookLogs.normalizedStatus, normalizedStatus));
    if (dateFrom) conditions.push(gte(sql`${deliveryWebhookLogs.createdAt}::date`, dateFrom));
    if (dateTo) conditions.push(lte(sql`${deliveryWebhookLogs.createdAt}::date`, dateTo));
    const where = conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : and(...conditions);

    let query = db
      .select({
        id: deliveryWebhookLogs.id,
        receivedAt: deliveryWebhookLogs.createdAt,
        status: deliveryWebhookLogs.status,
        providerCode: deliveryWebhookLogs.providerCode,
        shipmentId: deliveryWebhookLogs.shipmentId,
        shipmentNumber: deliveryShipments.shipmentNumber,
        providerStatus: deliveryWebhookLogs.providerStatus,
        normalizedStatus: deliveryWebhookLogs.normalizedStatus,
        errorMessage: deliveryWebhookLogs.errorMessage,
        payload: deliveryWebhookLogs.payload,
      })
      .from(deliveryWebhookLogs)
      .leftJoin(deliveryShipments, eq(deliveryWebhookLogs.shipmentId, deliveryShipments.id));
    if (where) query = query.where(where);

    let countQuery = db
      .select({ count: sql`count(*)` })
      .from(deliveryWebhookLogs)
      .leftJoin(deliveryShipments, eq(deliveryWebhookLogs.shipmentId, deliveryShipments.id));
    if (where) countQuery = countQuery.where(where);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const data = await query
      .orderBy(desc(deliveryWebhookLogs.createdAt), desc(deliveryWebhookLogs.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /** Audit list of OUTBOUND provider actions (create/cancel/sync/label/quote). */
  async listActionLogs(filters = {}) {
    const db = await getDb();
    const { page = 1, limit = 20, shipmentId, providerId, providerCode, action, success } = filters;

    const conditions = [];
    if (shipmentId) conditions.push(eq(deliveryActionLogs.shipmentId, Number(shipmentId)));
    if (providerId) conditions.push(eq(deliveryActionLogs.providerId, Number(providerId)));
    if (providerCode) conditions.push(eq(deliveryActionLogs.providerCode, providerCode));
    if (action) conditions.push(eq(deliveryActionLogs.action, action));
    if (success === true || success === 'true') conditions.push(eq(deliveryActionLogs.success, true));
    if (success === false || success === 'false') conditions.push(eq(deliveryActionLogs.success, false));
    const where = conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : and(...conditions);

    let query = db
      .select({
        id: deliveryActionLogs.id,
        createdAt: deliveryActionLogs.createdAt,
        action: deliveryActionLogs.action,
        success: deliveryActionLogs.success,
        providerCode: deliveryActionLogs.providerCode,
        shipmentId: deliveryActionLogs.shipmentId,
        shipmentNumber: deliveryShipments.shipmentNumber,
        errorMessage: deliveryActionLogs.errorMessage,
        requestPayload: deliveryActionLogs.requestPayload,
        responsePayload: deliveryActionLogs.responsePayload,
      })
      .from(deliveryActionLogs)
      .leftJoin(deliveryShipments, eq(deliveryActionLogs.shipmentId, deliveryShipments.id));
    if (where) query = query.where(where);

    let countQuery = db.select({ count: sql`count(*)` }).from(deliveryActionLogs);
    if (where) countQuery = countQuery.where(where);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const data = await query
      .orderBy(desc(deliveryActionLogs.createdAt), desc(deliveryActionLogs.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── Internals ───────────────────────────────────────────────────────────────
  async _recordEvent(dbOrTx, e) {
    await dbOrTx.insert(deliveryEvents).values({
      shipmentId: e.shipmentId,
      eventType: e.eventType,
      status: e.status ?? null,
      providerStatus: e.providerStatus ?? null,
      message: e.message ?? null,
      payload: e.payload ?? null,
      occurredAt: e.occurredAt ?? null,
      dedupeKey: e.dedupeKey ?? null,
      createdBy: e.userId ?? null,
    });
  }

  /**
   * Update a shipment's status (+ optional provider fields) and append the
   * matching event, atomically. Then best-effort sync the linked online order.
   */
  async _applyStatus(shipmentId, status, opts = {}) {
    if (!isValidDeliveryStatus(status)) {
      throw new ValidationError(`Unknown delivery status: ${status}`);
    }
    await withTransaction(async (tx) => {
      const setPayload = { status, updatedAt: new Date() };
      if (opts.providerShipmentId !== undefined) setPayload.providerShipmentId = opts.providerShipmentId;
      if (opts.platformCode !== undefined) setPayload.platformCode = opts.platformCode;
      if (opts.providerStatus != null) setPayload.providerStatus = opts.providerStatus;
      if (opts.trackingNumber !== undefined) setPayload.trackingNumber = opts.trackingNumber;
      if (opts.trackingUrl !== undefined) setPayload.trackingUrl = opts.trackingUrl;
      if (opts.responsePayload !== undefined) setPayload.responsePayload = opts.responsePayload;
      if (opts.touchSyncedAt) setPayload.lastSyncedAt = new Date();
      await tx.update(deliveryShipments).set(setPayload).where(eq(deliveryShipments.id, shipmentId));
      await this._recordEvent(tx, {
        shipmentId,
        eventType: opts.eventType || DELIVERY_EVENT_TYPE.STATUS_UPDATE,
        status,
        providerStatus: opts.providerStatus,
        message: opts.message,
        payload: opts.payload,
        occurredAt: opts.occurredAt,
        dedupeKey: opts.dedupeKey,
        userId: opts.userId,
      });
      saveDatabase();
    });

    await this._syncOrderStatus(shipmentId, status, opts.userId);
  }

  /**
   * Best-effort: when a shipment is DELIVERED/RETURNED, advance the linked
   * online order to the matching workflow status. Invalid transitions (e.g.
   * the order isn't READY_FOR_DELIVERY yet) are swallowed — delivery state must
   * never fail because the order's workflow disagrees.
   */
  async _syncOrderStatus(shipmentId, status, userId) {
    const target = ORDER_STATUS_FROM_SHIPMENT[status];
    if (!target) return;
    try {
      const db = await getDb();
      const [row] = await db
        .select({ onlineOrderId: deliveryShipments.onlineOrderId })
        .from(deliveryShipments)
        .where(eq(deliveryShipments.id, shipmentId))
        .limit(1);
      if (!row?.onlineOrderId) return;
      // Authoritative sync — forces the order to DELIVERED/RETURNED from any
      // non-terminal state (the courier is the source of truth), idempotently.
      const applied = await onlineOrderService.syncStatusFromShipment(
        row.onlineOrderId,
        target,
        userId ?? null,
        'تحديث تلقائي من حالة الشحنة'
      );
      if (applied) log.info(`Order ${row.onlineOrderId} → ${target} (from shipment ${shipmentId})`);
    } catch (err) {
      log.warn(`Order auto-sync skipped (${status}): ${err.message}`);
    }
  }
}

export default new DeliveryService();
