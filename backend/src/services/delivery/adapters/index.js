/**
 * Delivery adapter registry.
 *
 * Maps a provider's `adapterKey` (falling back to its `code`) to a factory.
 * The rest of the system only calls `resolveAdapter(provider)` — it never
 * imports a concrete adapter. To add a real provider, write its factory and
 * register it here (replacing the unsupported stub).
 */

import { createBoxyAdapter } from './boxyAdapter.js';
import { createCustomAdapter } from './customAdapter.js';
import { createUnsupportedAdapter } from './baseAdapter.js';
import { DELIVERY_PROVIDER } from '../../../constants/delivery.js';

const REGISTRY = {
  [DELIVERY_PROVIDER.BOXY]: createBoxyAdapter,
  [DELIVERY_PROVIDER.CUSTOM]: createCustomAdapter,
  // Future providers — scaffolded as 501 stubs until their adapters land.
  [DELIVERY_PROVIDER.ALZAEEM]: (p) => createUnsupportedAdapter('ALZAEEM', 'الزعيم', p),
  [DELIVERY_PROVIDER.ALWASEET]: (p) => createUnsupportedAdapter('ALWASEET', 'الوسيط', p),
  [DELIVERY_PROVIDER.HI_EXPRESS]: (p) => createUnsupportedAdapter('HI_EXPRESS', 'Hi Express', p),
};

/** Adapter keys that have a real (non-stub) implementation. */
export const IMPLEMENTED_ADAPTERS = Object.freeze([
  DELIVERY_PROVIDER.BOXY,
  DELIVERY_PROVIDER.CUSTOM,
]);

export function listAdapterKeys() {
  return Object.keys(REGISTRY);
}

/**
 * Build the adapter for a provider row (with decrypted apiKey/webhookSecret).
 * Throws a 400 when no adapter is registered for the key/code.
 */
export function resolveAdapter(provider) {
  if (!provider) {
    const err = new Error('Provider is required to resolve a delivery adapter');
    err.statusCode = 400;
    throw err;
  }
  const factory = REGISTRY[provider.adapterKey] || REGISTRY[provider.code];
  if (!factory) {
    const err = new Error(`لا يوجد محوّل (adapter) لشركة التوصيل "${provider.code}".`);
    err.statusCode = 400;
    err.code = 'DELIVERY_ADAPTER_NOT_FOUND';
    throw err;
  }
  return factory(provider);
}
