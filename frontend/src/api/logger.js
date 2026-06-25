/**
 * Environment-aware API logger.
 *
 * - development: rich, structured output to help debugging.
 * - production: only the stable code + status — NEVER the raw message,
 *   payload, headers, or original error, so user data / tokens don't leak to
 *   the console of a packaged desktop app (rule 10).
 */
const isDev = (() => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) return !!import.meta.env.DEV;
  } catch {
    /* import.meta not available (e.g. node test) */
  }
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
})();

/** Log a normalized AppError with context. */
export function logApiError(context, appError) {
  if (!appError) return;
  if (isDev) {
    console.error(`[api] ${context}`, {
      code: appError.code,
      status: appError.status,
      message: appError.message,
      details: appError.details,
      fieldErrors: appError.fieldErrors,
      original: appError.originalError,
    });
  } else {
    // Code + status only — no message/payload (may contain PII).
    console.error(`[api] ${context}: ${appError.code}${appError.status ? ` (${appError.status})` : ''}`);
  }
}

/** Verbose debug logging — dev only. */
export function logApiDebug(...args) {
  if (isDev) console.debug('[api]', ...args);
}
