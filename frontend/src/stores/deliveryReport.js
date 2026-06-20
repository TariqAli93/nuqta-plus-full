import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

/**
 * Delivery / shipping reports (تقارير الشحن). Mirrors the online-commerce
 * report store: a single overview payload (KPIs + breakdowns) driven by filters.
 */
export const useDeliveryReportStore = defineStore('deliveryReport', {
  state: () => ({
    overview: null,
    loading: false,
    filters: {
      dateFrom: null,
      dateTo: null,
      providerId: null,
      status: null,
    },
  }),

  actions: {
    _params() {
      const f = this.filters;
      return {
        ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
        ...(f.dateTo ? { dateTo: f.dateTo } : {}),
        ...(f.providerId ? { providerId: f.providerId } : {}),
        ...(f.status ? { status: f.status } : {}),
      };
    },

    async fetchOverview() {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const res = await api.get('/reports/delivery/overview', { params: this._params() });
        this.overview = res.data?.data || null;
        return this.overview;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل تقارير الشحن');
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
