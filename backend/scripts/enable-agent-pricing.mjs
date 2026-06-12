/**
 * One-off: enable the wholesale/agent price-tier feature (تسعير الوكلاء) for
 * THIS installation, without changing the global default in featureFlagsService
 * (which must stay off so other installs keep their behaviour after auto-update).
 *
 * Run from the backend directory (DB must be up + migrated):
 *   node scripts/enable-agent-pricing.mjs
 *
 * Idempotent — running it again is a no-op. After it succeeds, reload the
 * frontend (or let it refresh the session) so `hasFeature('agentPricing')`
 * flips on and the three-price UI + valuation report appear.
 */
import 'dotenv/config';
import featureFlags from '../src/services/featureFlagsService.js';
import { closeDatabase } from '../src/db.js';

try {
  const flags = await featureFlags.updateFeatureFlags({ agentPricing: true });
  console.log('✅ agentPricing enabled for this install. Current flags:');
  console.log(JSON.stringify({ agentPricing: flags.agentPricing }, null, 2));
} catch (err) {
  console.error('❌ Failed to enable agentPricing:', err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
