import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useSupplierStore = defineStore('supplier', {
  state: () => ({
    items: [],
    current: null,
    debts: null,
    statement: null,
    loading: false,
    pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  }),

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/suppliers', { params });
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
      const res = await api.get(`/suppliers/${id}`);
      this.current = res?.data || null;
      return this.current;
    },

    async fetchDebts(id) {
      const res = await api.get(`/suppliers/${id}/debts`);
      this.debts = res?.data || null;
      return this.debts;
    },

    async fetchStatement(id, params = {}) {
      const res = await api.get(`/suppliers/${id}/statement`, { params });
      this.statement = res?.data || null;
      return this.statement;
    },

    async create(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/suppliers', payload);
      notify.success('تم إنشاء المورد');
      return res?.data;
    },

    async update(id, payload) {
      const notify = useNotificationStore();
      const res = await api.put(`/suppliers/${id}`, payload);
      notify.success('تم تحديث المورد');
      return res?.data;
    },

    async remove(id) {
      const notify = useNotificationStore();
      const res = await api.delete(`/suppliers/${id}`);
      notify.success(res?.message || 'تم حذف المورد');
      return res;
    },
  },
});
