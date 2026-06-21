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
      // Order-status + creator filters (apply to the orders funnel).
      status: null,
      userId: null,
      // Shipping filters: by carrier (delivery provider) and shipment status.
      shippingProviderId: null,
      shippingStatus: null,
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
        ...(f.status ? { status: f.status } : {}),
        ...(f.userId ? { userId: f.userId } : {}),
        ...(f.shippingProviderId ? { shippingProviderId: f.shippingProviderId } : {}),
        ...(f.shippingStatus ? { shippingStatus: f.shippingStatus } : {}),
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
        // The axios interceptor already unwraps to the response body
        // ({ success, data }), so the payload is `res.data` (NOT res.data.data).
        this.widgets = res?.data || null;
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
        // Interceptor unwraps to the body, so the payload is `res.data`.
        const overviewRes = await api.get('/reports/online-commerce/overview', { params });
        this.overview = overviewRes.data || null;

        // Profit is permission-gated (reports:read_profit). Any failure just
        // means "hide the profit table" — never block the rest of the report.
        try {
          const profitRes = await api.get('/reports/online-commerce/profit', { params });
          this.profit = profitRes.data?.profitByChannel || [];
          this.profitDenied = false;
        } catch {
          this.profit = [];
          this.profitDenied = true;
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
