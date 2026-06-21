import accountingPeriodService, { CLOSE_REASONS } from '../services/accountingPeriodService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AccountingPeriodCloseJob');

/**
 * Auto-close every accounting period whose end time has elapsed.
 *
 * Runs once on startup (runOnStart) — the boot catch-up that closes any period
 * that expired while the app/server was down — AND on a short repeating timer
 * while running, so periods close within one tick of their end time without any
 * user action. The very first (startup) invocation is recorded as
 * `auto_startup`; subsequent timer ticks as `auto`.
 *
 * The engine is idempotent (a closed period is skipped) and per-period isolated
 * (one failure never stops the rest), so running often — or twice in a row — is
 * always safe.
 */
let bootCatchupDone = false;

export async function runAccountingPeriodCloseJob({ logger = log } = {}) {
  const reason = bootCatchupDone ? CLOSE_REASONS.AUTO : CLOSE_REASONS.AUTO_STARTUP;
  bootCatchupDone = true;
  return accountingPeriodService.closeExpiredPeriods({ reason, logger });
}

export default runAccountingPeriodCloseJob;
