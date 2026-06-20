import { getDb } from '../db.js';
import { deliveryShipments, deliveryProviders } from '../models/index.js';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DELIVERY_TERMINAL_STATUSES, DELIVERY_PROVIDER } from '../constants/delivery.js';
import { IMPLEMENTED_ADAPTERS } from '../services/delivery/adapters/index.js';
import deliveryService from '../services/delivery/deliveryService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DeliverySyncJob');

/**
 * Poll provider status for active, non-terminal shipments.
 *
 * Only providers with a REAL adapter (IMPLEMENTED_ADAPTERS) that are active and
 * are NOT the manual CUSTOM courier are polled — stub providers would only 501,
 * and CUSTOM has no upstream to poll. Each shipment is synced in isolation so a
 * single provider/shipment failure never aborts the batch. Oldest-synced first,
 * bounded per run (DELIVERY_SYNC_BATCH, default 50).
 */
export async function runDeliverySyncJob({ logger = log } = {}) {
  const db = await getDb();
  const batch = Number(process.env.DELIVERY_SYNC_BATCH || 50);

  // Providers we can actually poll: implemented adapter, active, not CUSTOM.
  const pollableCodes = IMPLEMENTED_ADAPTERS.filter((c) => c !== DELIVERY_PROVIDER.CUSTOM);
  if (pollableCodes.length === 0) {
    return { scanned: 0, synced: 0, failed: 0, skipped: 0 };
  }

  const candidates = await db
    .select({ id: deliveryShipments.id })
    .from(deliveryShipments)
    .innerJoin(deliveryProviders, eq(deliveryShipments.providerId, deliveryProviders.id))
    .where(
      and(
        notInArray(deliveryShipments.status, DELIVERY_TERMINAL_STATUSES),
        eq(deliveryProviders.isActive, true),
        inArray(deliveryProviders.code, pollableCodes)
      )
    )
    .orderBy(sql`${deliveryShipments.lastSyncedAt} ASC NULLS FIRST`)
    .limit(batch);

  let synced = 0;
  let failed = 0;
  for (const s of candidates) {
    try {
      // null user → SYNC event recorded with createdBy = null (system).
      await deliveryService.syncStatus(s.id, null);
      synced += 1;
    } catch (err) {
      failed += 1;
      logger.warn?.(`[deliverySync] shipment ${s.id} sync failed: ${err.message}`);
    }
  }

  const result = { scanned: candidates.length, synced, failed, skipped: 0 };
  if (candidates.length) logger.info?.(`[deliverySync] ${JSON.stringify(result)}`);
  return result;
}

export default runDeliverySyncJob;
