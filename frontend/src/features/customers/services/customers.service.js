import api from '@/plugins/axios';
import { cleanParams } from '@/utils/requestParams';

/**
 * Customers HTTP service — the single place customer endpoints are called.
 *
 * Thin wrappers over the shared axios instance (`@/plugins/axios`), which owns
 * auth/context headers, the response-unwrap and the error→AppError conversion.
 * Nothing here re-implements request or error logic (rule 11); pages and
 * composables call these functions instead of `api.get(...)` inline (rule 10).
 *
 * All calls set `meta.handled` so the interceptor does NOT auto-present errors:
 * the feature decides presentation itself (via `runAction` / the page's error
 * state). The response interceptor resolves to the body `{ success, data, meta }`.
 */
const HANDLED = { meta: { handled: true } };

export const customersService = {
  list(params = {}, { signal, silent = false } = {}) {
    return api.get('/customers', { params: cleanParams(params), signal, meta: { silent, handled: true } });
  },
  get(id) {
    return api.get(`/customers/${id}`, HANDLED);
  },
  profile(id) {
    return api.get(`/customers/${id}/profile`, HANDLED);
  },
  aging(id) {
    return api.get(`/customers/${id}/aging`, HANDLED);
  },
  create(payload) {
    return api.post('/customers', payload, HANDLED);
  },
  update(id, payload) {
    return api.put(`/customers/${id}`, payload, HANDLED);
  },
  remove(id) {
    return api.delete(`/customers/${id}`, HANDLED);
  },
};
