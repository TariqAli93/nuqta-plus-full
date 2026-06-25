import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import { useLoadingStore } from '@/stores/loading';
import { useInventoryStore } from '@/stores/inventory';
import router from '@/router';
import { hasPermission } from '@/auth/permissions';
import { toAppError, ErrorCodes } from '@/api/AppError';
import { presentAppError } from '@/api/errorPresenter';

/**
 * Central API client.
 *
 * One axios instance for the whole app. Two responsibilities, kept separate:
 *   1. Request interceptor — enrich every request with shared context
 *      (auth token, branch, locale, request id).
 *   2. Response interceptor — unwrap the body on success; on failure convert to
 *      a unified AppError, run the unavoidable GLOBAL side-effects (session
 *      expiry / capability refresh), and present it ONCE — unless the caller
 *      opted out via `meta.silent` (inline UX) or `meta.handled` (the
 *      command/page presents it itself). The interceptor NEVER re-implements
 *      per-page error handling, and the conversion (toAppError) is independent
 *      of the decision to show (presentAppError) — rule 6.
 *
 * Callers read the unwrapped JSON body: `res.data` / `res.meta`.
 */

/** Optional/silent permission request — a 403 just means "feature unavailable". */
const isOptionalPermissionRequest = (config) =>
  config?.permissionMode === 'optional_feature' || config?.silentPermissionCheck === true;

/** Fallback value an optional request resolves to when blocked/denied. */
const optionalFallback = (config) =>
  config && Object.prototype.hasOwnProperty.call(config, 'fallbackValue')
    ? config.fallbackValue
    : null;

/** Correlation id for tracing a request through logs (no PII). */
function newRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* not available */
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Active branch id (best-effort, never throws / blocks a request). */
function currentBranchId() {
  try {
    const inventory = useInventoryStore();
    return inventory?.selectedBranchId ?? null;
  } catch {
    return null;
  }
}

const api = axios.create({
  baseURL: 'http://127.0.0.1:41732/api', // overridden at runtime by initAxiosBaseUrl()
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sync the axios baseURL with the connection store (call once after Pinia is
 * ready) and keep it reactive to future server-URL changes.
 */
export function initAxiosBaseUrl(connectionStore) {
  if (connectionStore.apiBaseUrl) {
    api.defaults.baseURL = connectionStore.apiBaseUrl;
  }
  import('vue').then(({ watch }) => {
    watch(
      () => connectionStore.apiBaseUrl,
      (newUrl) => {
        if (newUrl) api.defaults.baseURL = newUrl;
      }
    );
  });
}

/** Attach shared request context: token, branch, locale, request id. */
function applyRequestContext(config) {
  const authStore = useAuthStore();
  const token = authStore.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Locale + correlation id (don't clobber a per-call override).
  if (!config.headers['Accept-Language']) config.headers['Accept-Language'] = 'ar';
  if (!config.headers['X-Request-Id']) config.headers['X-Request-Id'] = newRequestId();

  // Branch context, when one is active and not explicitly overridden.
  if (config.headers['X-Branch-Id'] == null) {
    const branchId = currentBranchId();
    if (branchId != null) config.headers['X-Branch-Id'] = String(branchId);
  }

  // Let the browser set the multipart boundary for FormData uploads.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  return config;
}

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Optional-feature pre-check: never hit the network for an optional request
    // the user isn't allowed to make. Resolved to a silent fallback below.
    if (
      config.permission &&
      isOptionalPermissionRequest(config) &&
      !hasPermission(config.permission)
    ) {
      const blocked = new Error('PERMISSION_OPTIONAL_BLOCKED');
      blocked.__optionalBlocked = true;
      blocked.config = config;
      return Promise.reject(blocked);
    }

    // Global loading bar (silent requests render their own inline state).
    const loadingStore = useLoadingStore();
    if (!config.meta?.silent) loadingStore.startRequest();

    return applyRequestContext(config);
  },
  (error) => {
    const loadingStore = useLoadingStore();
    if (!error.config?.meta?.silent) loadingStore.endRequest();
    return Promise.reject(toAppError(error));
  }
);

// ── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    const loadingStore = useLoadingStore();
    if (!response.config?.meta?.silent) loadingStore.endRequest();
    // Unwrap to the JSON body `{ success, data, meta }`.
    return response.data;
  },
  (error) => {
    // Optional request short-circuited before sending → silent fallback.
    if (error?.__optionalBlocked) return optionalFallback(error.config);

    const loadingStore = useLoadingStore();
    const isSilent = !!error.config?.meta?.silent;
    if (!isSilent) loadingStore.endRequest();

    // Canceled/superseded request — keep the RAW error so axios.isCancel() and
    // isCanceledRequest() still detect it; never a real failure, never shown.
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    // Silent requests own their UX inline — convert (for consistent catch) but
    // never present.
    if (isSilent) return Promise.reject(toAppError(error));

    // Optional-feature request that WAS sent: 403 → silent fallback; any other
    // failure of an optional background call stays quiet.
    if (isOptionalPermissionRequest(error.config)) {
      if (error.response?.status === 403) return optionalFallback(error.config);
      return Promise.reject(toAppError(error));
    }

    const appError = toAppError(error);
    const status = appError.status;
    // The caller (command/page action) will present this itself.
    const handled = error.config?.meta?.handled === true;

    // ── Global side-effects (always, even when `handled`) ──────────────────
    if (status === 401) {
      // Invalid/expired token: wipe session and bounce to login. Use
      // clearSessionState (not logout) so no extra "logged out" toast fires,
      // and skip redirect when the failed call WAS /auth/session.
      const authStore = useAuthStore();
      const isSessionCheck = error.config?.url?.endsWith('/auth/session');
      authStore.clearSessionState();
      if (!isSessionCheck && router.currentRoute.value.meta?.requiresAuth) {
        router.push({ name: 'Login' });
      }
    } else if (status === 403) {
      // FEATURE_DISABLED / CAPABILITY_DENIED → another tab may have changed
      // state; refresh the session so menus/routes re-evaluate. The refresh
      // latch prevents an infinite loop.
      const isSessionCheck = error.config?.url?.endsWith('/auth/session');
      if (!isSessionCheck && (appError.code === 'FEATURE_DISABLED' || appError.code === 'CAPABILITY_DENIED')) {
        try {
          const authStore = useAuthStore();
          if (authStore.isAuthenticated && !authStore.isHydrating) {
            authStore.refreshSession({ force: true });
          }
        } catch {
          /* non-fatal */
        }
      }
    }

    // ── Default presentation (skipped when handled by the caller) ──────────
    if (!handled) {
      if (status === 429) {
        const retryAfter = error.response?.headers?.['retry-after'] || 40;
        useNotificationStore().warning(
          `تم تجاوز حد الطلبات. حاول مرة أخرى بعد ${retryAfter} ثانية`,
          6000
        );
      } else if (appError.code !== ErrorCodes.CANCELED) {
        presentAppError(appError);
      }
    }

    return Promise.reject(appError);
  }
);

export default api;
