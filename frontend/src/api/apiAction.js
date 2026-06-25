import { toAppError } from './AppError';
import { presentAppError } from './errorPresenter';
import { logApiError } from './logger';

/**
 * Convert any thrown value to a user-facing AppError and (optionally) present
 * it. Use from a command/page action that owns the "show it?" decision.
 */
export function presentError(error, { silent = false } = {}) {
  const appError = toAppError(error);
  logApiError('presentError', appError);
  if (!silent && !appError.isCanceled) presentAppError(appError);
  return appError;
}

/**
 * Run an async action with unified error handling so pages/commands don't
 * repeat try/catch (rule 8) and never swallow errors (rule 9):
 *   - converts the failure to an AppError,
 *   - binds field errors to an optional form helper (useFormErrors),
 *   - logs it (env-aware),
 *   - presents it once (skip with `present: false` / `silent: true`),
 *   - rethrows the AppError so the caller can still branch (e.g. on a code).
 *
 * Pair with service calls that set `meta: { handled: true }` so the interceptor
 * defers presentation to here (no double toast).
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ form?: { clear?: Function, setFromError?: Function }, present?: boolean, silent?: boolean }} [opts]
 * @returns {Promise<T>}
 */
export async function runAction(fn, { form = null, present = true, silent = false } = {}) {
  try {
    form?.clear?.();
    return await fn();
  } catch (error) {
    const appError = toAppError(error);
    if (appError.isCanceled) throw appError; // superseded request — ignore quietly
    form?.setFromError?.(appError);
    logApiError('runAction', appError);
    if (present && !silent) presentAppError(appError);
    throw appError;
  }
}
