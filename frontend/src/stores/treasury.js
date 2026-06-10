import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

/**
 * الخزينة: الصناديق + الحسابات المصرفية + السندات + التحويلات.
 * Mirrors backend /api/treasury and /api/vouchers.
 */
export const useTreasuryStore = defineStore('treasury', {
  state: () => ({
    cashboxes: [],
    bankAccounts: [],
    vouchers: [],
    transfers: [],
    ledger: null,
    loading: false,
    vouchersPagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    transfersPagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  }),

  actions: {
    // ── الصناديق ─────────────────────────────────────────────────────────
    async fetchCashboxes(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/treasury/cashboxes', { params });
        this.cashboxes = res?.data || [];
        return this.cashboxes;
      } finally {
        this.loading = false;
      }
    },

    async createCashbox(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/treasury/cashboxes', payload);
      notify.success('تم إنشاء الصندوق');
      return res?.data;
    },

    async updateCashbox(id, payload) {
      const notify = useNotificationStore();
      const res = await api.put(`/treasury/cashboxes/${id}`, payload);
      notify.success('تم تحديث الصندوق');
      return res?.data;
    },

    async setDefaultCashbox(id) {
      const notify = useNotificationStore();
      const res = await api.post(`/treasury/cashboxes/${id}/set-default`);
      notify.success('تم تعيين الصندوق الافتراضي');
      return res?.data;
    },

    async fetchLedger(cashboxId, params = {}) {
      this.loading = true;
      try {
        const res = await api.get(`/treasury/cashboxes/${cashboxId}/ledger`, { params });
        this.ledger = res?.data || null;
        return this.ledger;
      } finally {
        this.loading = false;
      }
    },

    // ── الحسابات المصرفية ────────────────────────────────────────────────
    async fetchBankAccounts(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/treasury/bank-accounts', { params });
        this.bankAccounts = res?.data || [];
        return this.bankAccounts;
      } finally {
        this.loading = false;
      }
    },

    async createBankAccount(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/treasury/bank-accounts', payload);
      notify.success('تم إنشاء الحساب المصرفي');
      return res?.data;
    },

    async updateBankAccount(id, payload) {
      const notify = useNotificationStore();
      const res = await api.put(`/treasury/bank-accounts/${id}`, payload);
      notify.success('تم تحديث الحساب المصرفي');
      return res?.data;
    },

    // ── السندات ──────────────────────────────────────────────────────────
    async fetchVouchers(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/vouchers', { params });
        this.vouchers = res?.data || [];
        if (res?.meta) {
          this.vouchersPagination = {
            page: Number(res.meta.page) || 1,
            limit: Number(res.meta.limit) || 25,
            total: Number(res.meta.total) || 0,
            totalPages: Number(res.meta.totalPages) || 0,
          };
        }
        return this.vouchers;
      } finally {
        this.loading = false;
      }
    },

    async createVoucher(voucherType, payload) {
      const notify = useNotificationStore();
      const path = voucherType === 'receipt' ? '/vouchers/receipt' : '/vouchers/payment';
      const res = await api.post(path, payload);
      notify.success(voucherType === 'receipt' ? 'تم إنشاء سند القبض' : 'تم إنشاء سند الصرف');
      return res?.data;
    },

    async cancelVoucher(id, reason) {
      const notify = useNotificationStore();
      const res = await api.post(`/vouchers/${id}/cancel`, { reason });
      notify.success('تم إلغاء السند');
      return res?.data;
    },

    // ── التحويلات ────────────────────────────────────────────────────────
    async fetchTransfers(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/treasury/transfers', { params });
        this.transfers = res?.data || [];
        if (res?.meta) {
          this.transfersPagination = {
            page: Number(res.meta.page) || 1,
            limit: Number(res.meta.limit) || 25,
            total: Number(res.meta.total) || 0,
            totalPages: Number(res.meta.totalPages) || 0,
          };
        }
        return this.transfers;
      } finally {
        this.loading = false;
      }
    },

    async createTransfer(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/treasury/transfers', payload);
      notify.success('تم تنفيذ التحويل');
      return res?.data;
    },

    async cancelTransfer(id, reason) {
      const notify = useNotificationStore();
      const res = await api.post(`/treasury/transfers/${id}/cancel`, { reason });
      notify.success('تم إلغاء التحويل');
      return res?.data;
    },
  },
});
