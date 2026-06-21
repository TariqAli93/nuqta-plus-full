import recurringExpensesService from '../services/recurringExpensesService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RecurringExpensesJob');

/**
 * Generate every due fixed-expense occurrence up to today.
 *
 * Runs on a daily timer AND once on startup (runOnStart) so a program that was
 * closed across one or more due dates fills them all on the next launch. The
 * service is fully idempotent (pre-check + unique index), so running it often —
 * or twice in a row — never double-charges.
 */
export async function runRecurringExpensesJob({ logger = log } = {}) {
  return recurringExpensesService.generateDue({ logger });
}

export default runRecurringExpensesJob;
