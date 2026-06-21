import { runCreditScoringJob } from './creditScoringJob.js';
import { runOverdueReminderJob } from '../services/notifications/overdueReminderJob.js';
import { runDeliverySyncJob } from './deliverySyncJob.js';
import { runRecurringExpensesJob } from './recurringExpensesJob.js';

/**
 * Lightweight internal scheduler.
 *
 * Registered jobs are owned by this module — no external cron dependency.
 * The scheduler only decides "when"; each runner owns "what/how".
 *
 * A job registered with intervalMs runs on a repeating timer. On startup we
 * optionally run once immediately (runOnStart=true) — otherwise the first run
 * is delayed by the initial interval.
 *
 * Env overrides:
 *   CREDIT_SCORING_INTERVAL_MS  — override daily interval (e.g. 60000 for tests)
 *   CREDIT_SCORING_RUN_ON_START — '1' to trigger a run at server boot
 *   CREDIT_SCORING_DISABLED     — '1' to skip registration entirely
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const timers = new Map();

export function scheduleJob(name, { intervalMs, runOnStart = false, run, logger }) {
  if (timers.has(name)) return; // idempotent — safe to call twice
  const log = logger || console;

  const tick = async () => {
    try {
      await run({ logger: log });
    } catch (err) {
      log.error?.(`[scheduler:${name}] run failed:`, err);
    }
  };

  if (runOnStart) {
    // Fire-and-forget so we don't block startup
    setImmediate(tick);
  }

  const handle = setInterval(tick, intervalMs);
  // Don't keep the event loop alive just for the scheduler
  if (typeof handle.unref === 'function') handle.unref();
  timers.set(name, handle);
}

export function unscheduleAll() {
  for (const [, h] of timers) clearInterval(h);
  timers.clear();
}

export function registerDefaultJobs(fastify) {
  if (process.env.CREDIT_SCORING_DISABLED === '1') {
    fastify.log.info('[scheduler] credit scoring job disabled via env');
    return;
  }

  const intervalMs =
    Number(process.env.CREDIT_SCORING_INTERVAL_MS) || DAY_MS;
  const runOnStart = process.env.CREDIT_SCORING_RUN_ON_START === '1';

  scheduleJob('creditScoring', {
    intervalMs,
    runOnStart,
    run: runCreditScoringJob,
    logger: fastify.log,
  });

  fastify.log.info(
    `[scheduler] creditScoring registered (intervalMs=${intervalMs}, runOnStart=${runOnStart})`
  );

  // Overdue reminder scan — once an hour by default. The notification service
  // dedupes per-installment-per-day, so running often is safe and means a
  // freshly enabled feature starts catching up within minutes.
  if (process.env.OVERDUE_REMINDER_DISABLED !== '1') {
    const overdueIntervalMs =
      Number(process.env.OVERDUE_REMINDER_INTERVAL_MS) || 60 * 60 * 1000;
    const overdueRunOnStart = process.env.OVERDUE_REMINDER_RUN_ON_START === '1';
    scheduleJob('overdueReminder', {
      intervalMs: overdueIntervalMs,
      runOnStart: overdueRunOnStart,
      run: runOverdueReminderJob,
      logger: fastify.log,
    });
    fastify.log.info(
      `[scheduler] overdueReminder registered (intervalMs=${overdueIntervalMs}, runOnStart=${overdueRunOnStart})`
    );
  }

  // Delivery status auto-sync — poll active providers for non-terminal shipments.
  // Webhooks remain the primary update path; this catches providers without
  // webhooks (and missed deliveries). The service already dedupes/no-ops when a
  // status hasn't changed.
  if (process.env.DELIVERY_SYNC_DISABLED !== '1') {
    const deliveryIntervalMs = Number(process.env.DELIVERY_SYNC_INTERVAL_MS) || 30 * 60 * 1000;
    const deliveryRunOnStart = process.env.DELIVERY_SYNC_RUN_ON_START === '1';
    scheduleJob('deliverySync', {
      intervalMs: deliveryIntervalMs,
      runOnStart: deliveryRunOnStart,
      run: runDeliverySyncJob,
      logger: fastify.log,
    });
    fastify.log.info(
      `[scheduler] deliverySync registered (intervalMs=${deliveryIntervalMs}, runOnStart=${deliveryRunOnStart})`
    );
  }

  // Recurring (fixed) expenses — generate every due occurrence into the normal
  // expenses table. Runs ONCE on startup by default (catch-up after the program
  // was closed across due dates) plus a daily timer. The service is idempotent,
  // so a start-up run that overlaps the timer never double-charges.
  if (process.env.RECURRING_EXPENSES_DISABLED !== '1') {
    const recurringIntervalMs = Number(process.env.RECURRING_EXPENSES_INTERVAL_MS) || DAY_MS;
    // Default ON — catching up missed expenses on launch is a core requirement.
    const recurringRunOnStart = process.env.RECURRING_EXPENSES_RUN_ON_START !== '0';
    scheduleJob('recurringExpenses', {
      intervalMs: recurringIntervalMs,
      runOnStart: recurringRunOnStart,
      run: runRecurringExpensesJob,
      logger: fastify.log,
    });
    fastify.log.info(
      `[scheduler] recurringExpenses registered (intervalMs=${recurringIntervalMs}, runOnStart=${recurringRunOnStart})`
    );
  }
}
