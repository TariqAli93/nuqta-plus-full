import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

/**
 * Collections workflow store. Thin wrapper over the /api/installments and
 * /api/collections endpoints. Components own their own loading/error state
 * so the store stays stateless and stays out of the way of refresh logic.
 */
export const useCollectionsStore = defineStore('collections', {
  actions: {
    async listActions(installmentId) {
      const res = await api.get(`/installments/${installmentId}/actions`);
      return res?.data || [];
    },

    async recordAction(installmentId, payload) {
      const toast = useNotificationStore();
      try {
        const res = await api.post(`/installments/${installmentId}/actions`, payload);
        toast.success('تم تسجيل الإجراء');
        return res?.data || null;
      } catch (err) {
        toast.error(err.response?.data?.message || 'فشل تسجيل الإجراء');
        throw err;
      }
    },

    async overdue(params = {}) {
      const res = await api.get('/collections/overdue', { params });
      return {
        data: res?.data || [],
        meta: res?.meta || { page: 1, limit: 50, total: 0, totalPages: 0 },
      };
    },

    // Unified installments list for the collections workspace (read-only).
    // `config` forwards an AbortController signal from useServerSearch.
    async listInstallments(params = {}, config = {}) {
      const res = await api.get('/collections/installments', { params, ...config });
      return {
        data: res?.data || [],
        meta: res?.meta || { page: 1, limit: 25, total: 0, totalPages: 0 },
      };
    },

    // Summary stats for the dashboard cards (read-only).
    async stats(params = {}) {
      const res = await api.get('/collections/stats', { params });
      return (
        res?.data || {
          dueTodayCount: 0,
          overdueCount: 0,
          customersWithUnpaid: 0,
          dueByCurrency: [],
          overdueByCurrency: [],
        }
      );
    },

    // Collect an installment payment. Reuses the canonical payment write path
    // (POST /installments/:id/actions, actionType 'payment') — no new logic.
    async collectInstallment(installmentId, { amount, paymentMethod = 'cash', note, currency } = {}) {
      const toast = useNotificationStore();
      try {
        const res = await api.post(`/installments/${installmentId}/actions`, {
          actionType: 'payment',
          amount,
          paymentMethod,
          ...(currency ? { currency } : {}),
          ...(note ? { note } : {}),
        });
        toast.success('تم تحصيل القسط');
        return res?.data || null;
      } catch (err) {
        toast.error(err.response?.data?.message || 'فشل تحصيل القسط');
        throw err;
      }
    },

    async customerHistory(customerId) {
      const res = await api.get(`/collections/customer/${customerId}`);
      return res?.data || [];
    },
  },
});
