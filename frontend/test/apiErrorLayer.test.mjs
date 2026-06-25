import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AppError, toAppError, ErrorCodes } from '../src/api/AppError.js';
import { extractFieldErrors } from '../src/utils/errorTranslator.js';
import { useFormErrors } from '../src/composables/useFormErrors.js';

/**
 * API error-layer unit tests: error→AppError mapping for the required
 * scenarios, plus the form-error binding helper. Pure (no real network).
 *   node --test test/apiErrorLayer.test.mjs
 */

// Build a fake axios error.
const axiosError = ({ status, data, code, message } = {}) => ({
  message: message || 'Request failed',
  code,
  response: status ? { status, data: data || {}, headers: {} } : undefined,
  config: { url: '/x' },
});

// ── Pass-through / shape ────────────────────────────────────────────────────
test('toAppError is idempotent and carries the unified shape', () => {
  const e = new AppError({ code: 'X', message: 'm', status: 400 });
  assert.equal(toAppError(e), e);
  assert.equal(e.isAppError, true);
  assert.equal(e.statusCode, 400, 'statusCode aliases status for legacy readers');
  assert.deepEqual(e.details, []);
  assert.deepEqual(e.fieldErrors, {});
});

// ── Session expired (401) ───────────────────────────────────────────────────
test('401 → UNAUTHENTICATED with a safe Arabic message', () => {
  const err = toAppError(axiosError({ status: 401, data: { error: 'Unauthorized' } }));
  assert.equal(err.code, ErrorCodes.UNAUTHENTICATED);
  assert.equal(err.status, 401);
  assert.ok(err.message && !/Unauthorized|Request failed/.test(err.message), 'no raw english leaks');
});

// ── Permission denied (403) ─────────────────────────────────────────────────
test('403 PERMISSION_DENIED keeps the backend code + composed message', () => {
  const err = toAppError(
    axiosError({
      status: 403,
      data: {
        code: 'PERMISSION_DENIED',
        message: 'ليس لديك صلاحية حذف مستخدم',
        details: { reason: 'الدور لا يملك الإذن', suggestion: 'اطلب من المدير' },
      },
    })
  );
  assert.equal(err.code, 'PERMISSION_DENIED'); // backend code wins over generic FORBIDDEN
  assert.equal(err.status, 403);
  assert.match(err.message, /صلاحية/);
});

// ── Record conflict (409) ───────────────────────────────────────────────────
test('409 → CONFLICT (generic) or backend code when present', () => {
  const generic = toAppError(axiosError({ status: 409, data: { error: 'ConflictError' } }));
  assert.equal(generic.code, ErrorCodes.CONFLICT);
  assert.equal(generic.status, 409);

  const coded = toAppError(
    axiosError({ status: 409, data: { code: 'CUSTOMER_PHONE_DUPLICATE' } })
  );
  assert.equal(coded.code, 'CUSTOMER_PHONE_DUPLICATE');
  assert.match(coded.message, /رقم الهاتف/);
});

// ── Network failure ─────────────────────────────────────────────────────────
test('network failure → NETWORK, no status', () => {
  const err = toAppError({ message: 'Network Error', request: {} });
  assert.equal(err.code, ErrorCodes.NETWORK);
  assert.equal(err.status, null);
  assert.match(err.message, /الاتصال/);
});

test('timeout → TIMEOUT', () => {
  const err = toAppError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });
  assert.equal(err.code, ErrorCodes.TIMEOUT);
  assert.match(err.message, /مهلة/);
});

test('canceled request → CANCELED (so callers can ignore it)', () => {
  const err = toAppError({ code: 'ERR_CANCELED', name: 'CanceledError' });
  assert.equal(err.code, ErrorCodes.CANCELED);
  assert.equal(err.isCanceled, true);
});

// ── Field validation (400/422) ──────────────────────────────────────────────
test('validation error maps details[] to a per-field error map', () => {
  const err = toAppError(
    axiosError({
      status: 422,
      data: {
        error: 'ValidationError',
        details: [
          { field: 'name', message: 'Required' },
          { field: 'phone', message: 'Too short' },
        ],
      },
    })
  );
  assert.equal(err.code, ErrorCodes.UNPROCESSABLE);
  assert.equal(err.isValidation, true);
  assert.equal(err.hasFieldErrors, true);
  assert.deepEqual(err.fieldErrors.name, ['مطلوب']); // translated
  assert.deepEqual(err.fieldErrors.phone, ['قصير جدًا']);
});

test('extractFieldErrors ignores reason-based (stock) details', () => {
  const map = extractFieldErrors(
    axiosError({ status: 400, data: { details: [{ reason: 'insufficient_stock', productId: 5 }] } })
  );
  assert.deepEqual(map, {});
});

// ── Form-error helper (rule 7) ──────────────────────────────────────────────
test('useFormErrors binds, reads and clears an AppError fieldErrors', () => {
  const fe = useFormErrors();
  assert.deepEqual(fe.messagesFor('name'), []);
  assert.equal(fe.has('name'), false);

  fe.setFromError(new AppError({ fieldErrors: { name: ['مطلوب'], phone: ['قصير جدًا'] } }));
  assert.deepEqual(fe.messagesFor('name'), ['مطلوب']);
  assert.equal(fe.has('phone'), true);

  // Re-binding a cleaner error replaces (does not merge) the map.
  fe.setFromError(new AppError({ fieldErrors: { name: ['غير صالح'] } }));
  assert.deepEqual(fe.messagesFor('name'), ['غير صالح']);
  assert.equal(fe.has('phone'), false);

  fe.clear();
  assert.deepEqual(fe.messagesFor('name'), []);
});
