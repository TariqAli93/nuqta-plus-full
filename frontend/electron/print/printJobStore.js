/**
 * Print Job Store (main process).
 *
 * Instead of shipping the (potentially large) invoice payload through the window
 * URL, we stash the print job here and hand the preview/print window only a tiny
 * `jobId`. The window then pulls the full job back over IPC (`print:get-job`).
 *
 * Jobs are ephemeral: they live in memory and self-expire so a long-running app
 * doesn't accumulate stale invoices.
 */

import logger from '../scripts/logger.js';

const TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for a human reviewing a preview
const jobs = new Map();

let seq = 0;

/** Monotonic, collision-free id (Math.random/Date are fine in main — not a workflow script). */
function nextId() {
  seq += 1;
  return `job_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/**
 * Create and store a print job.
 * @param {object} job - { type, template, data, settings }
 * @returns {object} the stored job (with id + createdAt)
 */
export function create(job) {
  const id = nextId();
  const stored = {
    id,
    type: job.type || 'sale-invoice',
    template: job.template || 'receipt',
    data: job.data || {},
    settings: {
      paper: job.settings?.paper || 'roll-80',
      theme: job.settings?.theme || 'classic',
      printerName: job.settings?.printerName || null,
      silent: job.settings?.silent ?? false,
      copies: Number(job.settings?.copies) > 0 ? Number(job.settings.copies) : 1,
    },
    createdAt: Date.now(),
  };
  jobs.set(id, stored);
  logger.info(`[print] job created ${id} (paper=${stored.settings.paper}, theme=${stored.settings.theme})`);
  clearExpired();
  return stored;
}

/** Fetch a job by id (or null). */
export function get(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Shallow-merge new settings into an existing job (used when the preview toolbar
 * changes paper/theme/printer before printing). Returns the updated job or null.
 */
export function updateSettings(jobId, settings) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.settings = { ...job.settings, ...(settings || {}) };
  if (Number(job.settings.copies) <= 0) job.settings.copies = 1;
  return job;
}

/** Remove a job. */
export function remove(jobId) {
  return jobs.delete(jobId);
}

/** Drop every job older than the TTL. */
export function clearExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL_MS) {
      jobs.delete(id);
      logger.debug(`[print] job expired ${id}`);
    }
  }
}

export function size() {
  return jobs.size;
}
