import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const usePurchaseStore = defineStore('purchase', {
  state: () => ({
    items: [],
    current: null,
    loading: false,
    pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  }),

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/purchases', { params });
        this.items = res?.data || [];
        if (res?.meta) {
          this.pagination = {
            page: Number(res.meta.page) || 1,
            limit: Number(res.meta.limit) || 25,
            total: Number(res.meta.total) || 0,
            totalPages: Number(res.meta.totalPages) || 0,
          };
        }
        return this.items;
      } finally {
        this.loading = false;
      }
    },

    async fetchOne(id) {
      this.loading = true;
      try {
        const res = await api.get(`/purchases/${id}`);
        this.current = res?.data || null;
        return this.current;
      } finally {
        this.loading = false;
      }
    },

    async create(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/purchases', payload);
      notify.success('تم تسجيل فاتورة الشراء');
      return res?.data;
    },

    async addPayment(id, payload) {
      const notify = useNotificationStore();
      const res = await api.post(`/purchases/${id}/payments`, payload);
      notify.success('تم تسجيل الدفعة للمورد');
      return res?.data;
    },

    async createReturn(id, payload) {
      const notify = useNotificationStore();
      const res = await api.post(`/purchases/${id}/returns`, payload);
      notify.success('تم تسجيل مرتجع الشراء');
      return res?.data;
    },

    async cancel(id, reason) {
      const notify = useNotificationStore();
      const res = await api.post(`/purchases/${id}/cancel`, { reason });
      notify.success('تم إلغاء فاتورة الشراء');
      return res?.data;
    },
  },
});
