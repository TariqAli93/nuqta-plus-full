import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

// Dedup concurrent fetchProviders() (e.g. many list rows mounting at once).
let providersInflight = null;

/**
 * Delivery provider settings. ALL provider/Boxy communication is server-side:
 * the frontend only ever talks to the Nuqta backend, never to Boxy directly.
 * Secrets are write-only — responses carry masked placeholders only.
 */
export const useDeliveryProviderStore = defineStore('deliveryProvider', {
  state: () => ({
    providers: [],
    loading: false,
    saving: false,
    testing: false,
    error: null,
  }),

  actions: {
    /**
     * Fetch the provider list.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.optional=false] - When true this is treated as an
     *   OPTIONAL sub-feature load (e.g. probing Boxy status from inside the
     *   invoice page). The request is skipped entirely when the user lacks
     *   `delivery_providers:read`, and any 403 resolves silently to an empty
     *   list — no toast, no thrown error. Page-level callers (the providers
     *   settings page) leave it false so genuine failures still surface.
     */
    async fetchProviders({ optional = false } = {}) {
      if (providersInflight) return providersInflight;

      this.loading = true;
      this.error = null;

      const notificationStore = useNotificationStore();

      providersInflight = (async () => {
        try {
          const res = await api.get(
            '/delivery/providers',
            optional
              ? {
                  permission: 'delivery_providers:read',
                  permissionMode: 'optional_feature',
                  fallbackValue: null,
                }
              : undefined
          );

          const payload = Array.isArray(res?.data?.data)
            ? res.data.data
            : Array.isArray(res?.data?.providers)
              ? res.data.providers
              : Array.isArray(res?.data)
                ? res.data
                : [];

          this.providers = payload;

          return this.providers;
        } catch (error) {
          this.error = error?.message || 'فشل تحميل موفّري التوصيل';
          // Optional loads stay silent (the interceptor already suppressed any
          // 403); only surface a toast for explicit page-level loads.
          if (!optional) {
            notificationStore.error(this.error);
            throw error;
          }
          return this.providers;
        } finally {
          this.loading = false;
          providersInflight = null;
        }
      })();

      return providersInflight;
    },

    /** Load (or refresh) a single provider by its code, e.g. 'BOXY'. */
    async getByCode(code, { optional = false } = {}) {
      if (!this.providers.length) await this.fetchProviders({ optional });
      return this.providers.find((p) => p.code === code) || null;
    },

    async updateProvider(id, payload) {
      this.saving = true;
      const notificationStore = useNotificationStore();
      try {
        const res = await api.put(`/delivery/providers/${id}`, payload);
        const updated = res.data?.data;
        this._merge(updated);
        notificationStore.success('تم حفظ الإعدادات');
        return updated;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل حفظ الإعدادات');
        throw error;
      } finally {
        this.saving = false;
      }
    },

    async testConnection(id) {
      this.testing = true;
      const notificationStore = useNotificationStore();
      try {
        const res = await api.post(`/delivery/providers/${id}/test`);
        const data = res.data || {};
        if (data.provider) this._merge(data.provider);
        if (data.ok) notificationStore.success('تم الاتصال بنجاح');
        else notificationStore.error(`فشل الاتصال: ${data.message || ''}`);
        return data;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر اختبار الاتصال');
        throw error;
      } finally {
        this.testing = false;
      }
    },

    /** Debugging: inbound webhook logs (perm delivery_webhooks:view). */
    async fetchWebhookLogs(params = {}) {
      const notificationStore = useNotificationStore();
      try {
        const res = await api.get('/delivery/webhook-logs', { params });
        return { data: res.data?.data || [], meta: res.data?.meta || {} };
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل سجل الـ Webhook');
        throw error;
      }
    },

    _merge(updated) {
      if (!updated?.id) return;
      const i = this.providers.findIndex((p) => p.id === updated.id);
      if (i !== -1) this.providers[i] = updated;
      else this.providers.push(updated);
    },
  },
});
