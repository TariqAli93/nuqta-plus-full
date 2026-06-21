import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useRecurringExpensesStore = defineStore('recurringExpenses', {
  state: () => ({
    items: [],
    loading: false,
  }),

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/recurring-expenses', { params });
        this.items = res?.data || [];
        return this.items;
      } finally {
        this.loading = false;
      }
    },

    async create(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/recurring-expenses', payload);
      notify.success('تم إنشاء المصروف الثابت');
      return res?.data;
    },

    async update(id, payload) {
      const notify = useNotificationStore();
      const res = await api.put(`/recurring-expenses/${id}`, payload);
      notify.success('تم تحديث المصروف الثابت');
      return res?.data;
    },

    async setActive(id, isActive) {
      const notify = useNotificationStore();
      const res = await api.patch(`/recurring-expenses/${id}/active`, { isActive });
      notify.success(isActive ? 'تم تفعيل المصروف الثابت' : 'تم إيقاف المصروف الثابت');
      return res?.data;
    },

    async remove(id) {
      const notify = useNotificationStore();
      await api.delete(`/recurring-expenses/${id}`);
      notify.success('تم حذف المصروف الثابت');
    },

    async runNow() {
      const notify = useNotificationStore();
      const res = await api.post('/recurring-expenses/run', {});
      const generated = res?.data?.generated ?? 0;
      notify.success(generated > 0 ? `تم توليد ${generated} مصروف مستحق` : 'لا توجد مصاريف مستحقة حالياً');
      return res?.data;
    },
  },
});
