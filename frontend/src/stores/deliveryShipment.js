import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useDeliveryShipmentStore = defineStore('deliveryShipment', {
  state: () => ({
    shipments: [],
    currentShipment: null,
    providers: [],
    loading: false,
    filters: {
      status: null,
      providerId: null,
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  }),

  actions: {
    async fetchShipments(params = {}) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const query = {
          page: this.pagination.page,
          limit: this.pagination.limit,
          ...(this.filters.status ? { status: this.filters.status } : {}),
          ...(this.filters.providerId ? { providerId: this.filters.providerId } : {}),
          ...params,
        };
        const response = await api.get('/delivery/shipments', { params: query });
        this.shipments = Array.isArray(response.data?.data) ? response.data.data : [];
        if (response?.data?.meta) {
          this.pagination = {
            page: Number(response.data.meta.page) || this.pagination.page,
            limit: Number(response.data.meta.limit) || this.pagination.limit,
            total: Number(response.data.meta.total) || 0,
            totalPages: Number(response.data.meta.totalPages) || 0,
          };
        }
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل الشحنات');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /** Shipments tied to a given order/sale (to detect an active one). */
    async fetchForEntity({ onlineOrderId, saleId } = {}) {
      const params = {};
      if (onlineOrderId) params.onlineOrderId = onlineOrderId;
      if (saleId) params.saleId = saleId;
      try {
        const res = await api.get('/delivery/shipments', { params });
        return Array.isArray(res.data?.data) ? res.data.data : [];
      } catch {
        return [];
      }
    },

    /** Create + dispatch a shipment. Returns the shipment (caller inspects status). */
    async createShipment(payload) {
      const notificationStore = useNotificationStore();
      try {
        const res = await api.post('/delivery/shipments', payload);
        return res.data?.data || res.data;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر إنشاء الشحنة');
        throw error;
      }
    },

    /**
     * Re-send an order/sale to the carrier (perm online_orders:resend_to_shipping).
     * Supersedes any active shipment, then creates a fresh one.
     */
    async resendShipment(payload) {
      const notificationStore = useNotificationStore();
      try {
        const res = await api.post('/delivery/shipments/resend', payload);
        return res.data?.data || res.data;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر إعادة إرسال الشحنة');
        throw error;
      }
    },

    /**
     * Quote shipping cost (provider optional → default). Does NOT toast here so
     * the caller can show an inline hint (e.g. a muted "غير مدعوم" on 409).
     */
    async quote(payload) {
      const res = await api.post('/delivery/quote', payload);
      return res.data?.data || res.data;
    },

    /** Outbound action logs for a shipment (perm delivery_logs:view, optional). */
    async fetchActionLogs(params = {}) {
      try {
        const res = await api.get('/delivery/action-logs', {
          params,
          permission: 'delivery_logs:view',
          permissionMode: 'optional_feature',
          fallbackValue: null,
        });
        return { data: res?.data?.data || [], meta: res?.data?.meta || {} };
      } catch {
        return { data: [], meta: {} };
      }
    },

    /** Fetch a printable label URL (provider must support it). */
    async fetchLabel(id) {
      const notificationStore = useNotificationStore();
      try {
        const res = await api.get(`/delivery/shipments/${id}/label`);
        return res.data?.data?.url || null;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر جلب ملصق الشحنة');
        throw error;
      }
    },

    /**
     * Comprehensive shipments list — pure params (no shared filter state),
     * used by the /delivery/shipments page.
     */
    async searchShipments(params = {}) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const res = await api.get('/delivery/shipments', { params });
        this.shipments = Array.isArray(res.data?.data) ? res.data.data : [];
        if (res?.data?.meta) {
          this.pagination = {
            page: Number(res.data.meta.page) || 1,
            limit: Number(res.data.meta.limit) || 20,
            total: Number(res.data.meta.total) || 0,
            totalPages: Number(res.data.meta.totalPages) || 0,
          };
        }
        return res;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل الشحنات');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchShipment(id) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.get(`/delivery/shipments/${id}`);
        this.currentShipment = response.data?.data || response.data;
        return this.currentShipment;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل بيانات الشحنة');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async syncShipment(id) {
      const notificationStore = useNotificationStore();
      try {
        const response = await api.post(`/delivery/shipments/${id}/sync`);
        const updated = response.data?.data || response.data;
        this._mergeIntoList(updated);
        if (this.currentShipment?.id === id) this.currentShipment = updated;
        notificationStore.success('تمت مزامنة حالة الشحنة');
        return updated;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر مزامنة حالة الشحنة');
        throw error;
      }
    },

    async cancelShipment(id) {
      const notificationStore = useNotificationStore();
      try {
        const response = await api.post(`/delivery/shipments/${id}/cancel`);
        const updated = response.data?.data || response.data;
        this._mergeIntoList(updated);
        if (this.currentShipment?.id === id) this.currentShipment = updated;
        notificationStore.success('تم إلغاء الشحنة');
        return updated;
      } catch (error) {
        notificationStore.error(error?.message || 'تعذّر إلغاء الشحنة');
        throw error;
      }
    },

    async fetchProviders() {
      try {
        // Providers only drive the filter dropdown here — an OPTIONAL feature.
        // Skip the call (and stay silent on 403) when the user can't read
        // providers, so the global interceptor never raises a toast/dialog.
        const response = await api.get('/delivery/providers', {
          permission: 'delivery_providers:read',
          permissionMode: 'optional_feature',
          fallbackValue: null,
        });
        this.providers = Array.isArray(response?.data?.data) ? response.data.data : [];
        return this.providers;
      } catch {
        // Any other failure — fail quietly.
        this.providers = [];
      }
    },

    _mergeIntoList(updated) {
      if (!updated?.id) return;
      const i = this.shipments.findIndex((s) => s.id === updated.id);
      if (i !== -1) this.shipments[i] = { ...this.shipments[i], ...updated };
    },
  },
});
