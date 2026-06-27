/**
 * Print "page painted" signal store (main process).
 *
 * Each hidden print/PDF render gets a unique token (NOT the jobId — the same job
 * may be printed then PDF'd, so a jobId-keyed flag would go stale). The render
 * window calls `print:ready` with its token once REAL content is on screen; main
 * awaits that exact token before printing. A timeout still rejects so a stuck
 * page surfaces as an error (and a debug dump), never a silent blank PDF.
 */

import logger from '../scripts/logger.js';

let seq = 0;
const waiters = new Map(); // token → { resolve, readyAlready }

export function nextToken() {
  seq += 1;
  return `rt_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** Called by the `print:ready` IPC handler when the render window is painted. */
export function markReady(token) {
  if (!token) return;
  const entry = waiters.get(token);
  if (entry) {
    entry.readyAlready = true;
    if (entry.resolve) {
      entry.resolve(true);
      logger.debug(`[print] ready signal consumed for ${token}`);
    }
  } else {
    // Signal arrived before main started awaiting — record it so waitForReady
    // resolves immediately.
    waiters.set(token, { resolve: null, readyAlready: true });
    logger.debug(`[print] ready signal stored (early) for ${token}`);
  }
}

/** Resolve when the token is marked ready, or reject after timeoutMs. */
export function waitForReady(token, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const existing = waiters.get(token);
    if (existing?.readyAlready) {
      waiters.delete(token);
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      waiters.delete(token);
      reject(new Error(`Print ready timeout for ${token}`));
    }, timeoutMs);
    waiters.set(token, {
      readyAlready: false,
      resolve: (v) => {
        clearTimeout(timer);
        waiters.delete(token);
        resolve(v);
      },
    });
  });
}

export function reset(token) {
  waiters.delete(token);
}
