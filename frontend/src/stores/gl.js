import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

/**
 * المحاسبة العامة (General Ledger): شجرة الحسابات + القيود اليومية + ربط
 * الحسابات + إصلاح القيود. Mirrors backend /api/gl.
 */
export const useGlStore = defineStore('gl', {
  state: () => ({
    accounts: [],
    entries: [],
    systemAccounts: [],
    failures: [],
    templates: [],
    loading: false,
    entriesPagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  }),

  getters: {
    // Flat list → only postable, active leaves (valid targets for manual lines).
    postableAccounts: (state) => state.accounts.filter((a) => a.isPostable && a.isActive !== false),
  },

  actions: {
    // ── شجرة الحسابات ──────────────────────────────────────────────────────
    async fetchAccounts(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/gl/accounts', { params });
        this.accounts = res?.data || [];
        return this.accounts;
      } finally {
        this.loading = false;
      }
    },

    async createAccount(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/gl/accounts', payload);
      notify.success('تم إنشاء الحساب');
      return res?.data;
    },

    async updateAccount(id, payload) {
      const notify = useNotificationStore();
      const res = await api.put(`/gl/accounts/${id}`, payload);
      notify.success('تم تحديث الحساب');
      return res?.data;
    },

    async deleteAccount(id) {
      const notify = useNotificationStore();
      const res = await api.delete(`/gl/accounts/${id}`);
      notify.success('تم حذف الحساب');
      return res;
    },

    async fetchTemplates() {
      const res = await api.get('/gl/templates');
      this.templates = res?.data || [];
      return this.templates;
    },

    async seedTemplate(template) {
      const notify = useNotificationStore();
      const res = await api.post('/gl/templates/seed', { template });
      notify.success('تم إنشاء شجرة الحسابات');
      return res?.data;
    },

    // ── القيود اليومية ─────────────────────────────────────────────────────
    async fetchEntries(params = {}) {
      this.loading = true;
      try {
        const res = await api.get('/gl/journal', { params });
        this.entries = res?.data || [];
        if (res?.meta) {
          this.entriesPagination = {
            page: Number(res.meta.page) || 1,
            limit: Number(res.meta.limit) || 25,
            total: Number(res.meta.total) || 0,
            totalPages: Number(res.meta.totalPages) || 0,
          };
        }
        return this.entries;
      } finally {
        this.loading = false;
      }
    },

    async fetchEntry(id) {
      const res = await api.get(`/gl/journal/${id}`);
      return res?.data || null;
    },

    async createManualEntry(payload) {
      const notify = useNotificationStore();
      const res = await api.post('/gl/journal', payload);
      notify.success('تم ترحيل القيد اليدوي');
      return res?.data;
    },

    async reverseEntry(id, reason) {
      const notify = useNotificationStore();
      const res = await api.post(`/gl/journal/${id}/reverse`, { reason });
      notify.success('تم عكس القيد');
      return res?.data;
    },

    // ── ربط الحسابات ───────────────────────────────────────────────────────
    async fetchSystemAccounts() {
      this.loading = true;
      try {
        const res = await api.get('/gl/system-accounts');
        this.systemAccounts = res?.data || [];
        return this.systemAccounts;
      } finally {
        this.loading = false;
      }
    },

    async setSystemAccount(key, accountId) {
      const notify = useNotificationStore();
      const res = await api.put('/gl/system-accounts', { key, accountId });
      notify.success('تم تحديث الربط');
      return res?.data;
    },

    // ── إصلاح القيود ───────────────────────────────────────────────────────
    async fetchFailures(status = 'pending') {
      this.loading = true;
      try {
        const res = await api.get('/gl/posting-failures', { params: { status } });
        this.failures = res?.data || [];
        return this.failures;
      } finally {
        this.loading = false;
      }
    },

    async repostFailure(id) {
      const notify = useNotificationStore();
      const res = await api.post(`/gl/posting-failures/${id}/repost`);
      notify.success('تمت إعادة الترحيل');
      return res?.data;
    },

    async ignoreFailure(id) {
      const notify = useNotificationStore();
      const res = await api.post(`/gl/posting-failures/${id}/ignore`);
      notify.success('تم تجاهل السجل');
      return res?.data;
    },

    // ── التقارير المالية ───────────────────────────────────────────────────
    async fetchTrialBalance(params = {}) {
      const res = await api.get('/reports/financial/trial-balance', { params });
      return res?.data || null;
    },
    async fetchIncomeStatement(params = {}) {
      const res = await api.get('/reports/financial/income-statement', { params });
      return res?.data || null;
    },
    async fetchBalanceSheet(params = {}) {
      const res = await api.get('/reports/financial/balance-sheet', { params });
      return res?.data || null;
    },
    async fetchGeneralLedger(params = {}) {
      const res = await api.get('/reports/financial/general-ledger', { params });
      return res?.data || null;
    },
    async fetchAccountStatement(params = {}) {
      const res = await api.get('/reports/financial/account-statement', { params });
      return res?.data || null;
    },
  },
});
