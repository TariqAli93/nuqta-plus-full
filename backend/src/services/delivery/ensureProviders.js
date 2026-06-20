import { getPool } from '../../db.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('DeliveryProviders');

/**
 * Self-provision the carrier reference rows so the providers screen isn't empty
 * on installs that run migrations only (no `npm run seed`) — mirrors how RBAC
 * self-provisions. Idempotent via ON CONFLICT (code); never overrides an
 * operator's later edits. Carriers start INACTIVE (the operator activates one
 * after entering its API credentials); CUSTOM (manual) is active; BOXY is the
 * default carrier (the partial unique index allows exactly one default).
 */
export async function ensureDeliveryProviders() {
  const pool = await getPool();
  await pool.query(`
    INSERT INTO delivery_providers (code, name, adapter_key, is_active, is_default) VALUES
      ('BOXY','Boxy','BOXY', false, true),
      ('ALZAEEM','الزعيم','ALZAEEM', false, false),
      ('ALWASEET','الوسيط','ALWASEET', false, false),
      ('HI_EXPRESS','Hi Express','HI_EXPRESS', false, false),
      ('DHL','DHL','DHL', false, false),
      ('CUSTOM','شركة مخصّصة (يدوي)','CUSTOM', true, false)
    ON CONFLICT (code) DO NOTHING;
  `);
  log.info('Delivery providers ensured');
}

export default ensureDeliveryProviders;
