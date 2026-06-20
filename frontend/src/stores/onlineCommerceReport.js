import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useOnlineCommerceReportStore = defineStore('onlineCommerceReport', {
  state: () => ({
    overview: null, // reports 1–6
    profit: [], // report 7 (null/[] when no profit permission)
    profitDenied: false,
    widgets: null, // dashboard summary widgets
    widgetsLoading: false,
    loading: false,
    filters: {
      dateFrom: null,
      dateTo: null,
      channelId: null,
      currency: null,
      // Branch scope (الفرع). The backend onlineCommerceReportService already
      // honours `branchId` (resolveBranch) and clamps it to the user's allowed
      // branches, so this is a safe, scope-aware narrow.
      branchId: null,
    },
  }),

  actions: {
    _params() {
      const f = this.filters;
      return {
        ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
        ...(f.dateTo ? { dateTo: f.dateTo } : {}),
        ...(f.channelId ? { channelId: f.channelId } : {}),
        ...(f.currency ? { currency: f.currency } : {}),
        ...(f.branchId ? { branchId: f.branchId } : {}),
      };
    },

    async fetchWidgets(params = {}) {
      this.widgetsLoading = true;
      try {
        // Optional dashboard widget: when the user lacks
        // `online_commerce_reports:read` the request is skipped and resolves to
        // null silently (no toast/dialog from the global interceptor).
        const res = await api.get('/reports/online-commerce/widgets', {
          params,
          permission: 'online_commerce_reports:read',
          permissionMode: 'optional_feature',
          fallbackValue: null,
        });
        this.widgets = res?.data?.data || null;
        return this.widgets;
      } catch {
        // Any other failure — fail quietly (no data yet, network, etc.).
        this.widgets = null;
        return null;
      } finally {
        this.widgetsLoading = false;
      }
    },

    async fetchAll() {
      this.loading = true;
      const notificationStore = useNotificationStore();
      const params = this._params();
      try {
        const overviewRes = await api.get('/reports/online-commerce/overview', { params });
        this.overview = overviewRes.data?.data || null;

        // Profit is permission-gated — a 403 just means "hide the profit table".
        try {
          const profitRes = await api.get('/reports/online-commerce/profit', { params });
          this.profit = profitRes.data?.data?.profitByChannel || [];
          this.profitDenied = false;
        } catch (err) {
          if (err.response?.status === 403) {
            this.profit = [];
            this.profitDenied = true;
          } else {
            throw err;
          }
        }
        return this.overview;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل التقارير');
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
