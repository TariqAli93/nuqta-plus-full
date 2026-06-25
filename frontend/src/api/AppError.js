import axios from 'axios';
// Relative (not `@/`) so this module is unit-testable under `node --test`,
// which doesn't resolve the Vite `@` alias. errorTranslator is dependency-free.
import {
  buildArabicErrorMessage,
  extractArabicDetails,
  extractFieldErrors,
} from '../utils/errorTranslator.js';

/**
 * AppError — the single, normalized error shape the whole app works with.
 *
 * The axios response interceptor rejects with an AppError, so every `catch`
 * receives the same object: a user-safe Arabic `message` (never a raw network
 * string — rule 5), a stable `code`, the HTTP `status`, human `details` lines,
 * a per-field `fieldErrors` map for form binding, and the `originalError` for
 * logging/debugging only.
 */

/** Transport/HTTP error code families. Backend `data.code` (e.g.
 *  CUSTOMER_PHONE_DUPLICATE) takes precedence when present. */
export const ErrorCodes = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  CANCELED: 'CANCELED',
  BAD_REQUEST: 'BAD_REQUEST', // 400
  UNAUTHENTICATED: 'UNAUTHENTICATED', // 401
  FORBIDDEN: 'FORBIDDEN', // 403
  NOT_FOUND: 'NOT_FOUND', // 404
  CONFLICT: 'CONFLICT', // 409
  UNPROCESSABLE: 'UNPROCESSABLE', // 422
  RATE_LIMITED: 'RATE_LIMITED', // 429
  SERVER_ERROR: 'SERVER_ERROR', // 5xx
  HTTP_ERROR: 'HTTP_ERROR', // other
  UNKNOWN: 'UNKNOWN',
};

export class AppError extends Error {
  constructor({ code, message, status, details, fieldErrors, originalError } = {}) {
    super(message || 'حدث خطأ غير متوقع');
    this.name = 'AppError';
    this.isAppError = true;
    this.code = code || ErrorCodes.UNKNOWN;
    this.status = status ?? null;
    // Alias kept for existing readers that check `error.statusCode`.
    this.statusCode = status ?? null;
    this.details = Array.isArray(details) ? details : [];
    this.fieldErrors = fieldErrors && typeof fieldErrors === 'object' ? fieldErrors : {};
    this.originalError = originalError || null;
  }

  get isNetwork() {
    return this.code === ErrorCodes.NETWORK;
  }
  get isTimeout() {
    return this.code === ErrorCodes.TIMEOUT;
  }
  get isCanceled() {
    return this.code === ErrorCodes.CANCELED;
  }
  get isValidation() {
    return (
      this.code === ErrorCodes.BAD_REQUEST ||
      this.code === ErrorCodes.UNPROCESSABLE ||
      Object.keys(this.fieldErrors).length > 0
    );
  }
  get hasFieldErrors() {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

/** Map an HTTP status to a generic code (used only when the backend sent none). */
function codeForStatus(status) {
  switch (status) {
    case 400:
      return ErrorCodes.BAD_REQUEST;
    case 401:
      return ErrorCodes.UNAUTHENTICATED;
    case 403:
      return ErrorCodes.FORBIDDEN;
    case 404:
      return ErrorCodes.NOT_FOUND;
    case 409:
      return ErrorCodes.CONFLICT;
    case 422:
      return ErrorCodes.UNPROCESSABLE;
    case 429:
      return ErrorCodes.RATE_LIMITED;
    default:
      if (status >= 500) return ErrorCodes.SERVER_ERROR;
      if (status >= 400) return ErrorCodes.HTTP_ERROR;
      return ErrorCodes.UNKNOWN;
  }
}

/**
 * Normalize ANY thrown value (axios error, AppError, plain Error) into an
 * AppError. Idempotent: an AppError passes through unchanged.
 */
export function toAppError(error) {
  if (error?.isAppError) return error;

  // Canceled/superseded request (debounced search etc.) — not a real failure.
  if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED') {
    return new AppError({
      code: ErrorCodes.CANCELED,
      message: 'تم إلغاء الطلب',
      originalError: error,
    });
  }

  // Network failure (no response received).
  if (error?.message === 'Network Error' || (error?.request && !error?.response)) {
    return new AppError({
      code: ErrorCodes.NETWORK,
      message: 'فشل الاتصال بالخادم. تحقق من اتصال الإنترنت',
      originalError: error,
    });
  }

  // Timeout.
  if (error?.code === 'ECONNABORTED') {
    return new AppError({
      code: ErrorCodes.TIMEOUT,
      message: 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى',
      originalError: error,
    });
  }

  const status = error?.response?.status ?? null;
  const data = error?.response?.data || {};
  const message =
    buildArabicErrorMessage(error) || (status ? `خطأ (${status})` : 'حدث خطأ غير متوقع');

  return new AppError({
    code: data.code || codeForStatus(status),
    message,
    status,
    details: extractArabicDetails(error),
    fieldErrors: extractFieldErrors(error),
    originalError: error,
  });
}
