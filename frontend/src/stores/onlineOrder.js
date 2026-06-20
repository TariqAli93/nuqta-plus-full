import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useOnlineOrderStore = defineStore('onlineOrder', {
  state: () => ({
    orders: [],
    currentOrder: null,
    loading: false,
    filters: {
      search: '',
      status: null,
      channelId: null,
      dateFrom: null,
      dateTo: null,
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  }),

  actions: {
    async fetchOrders(params = {}) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const query = {
          page: this.pagination.page,
          limit: this.pagination.limit,
          ...(this.filters.search ? { search: this.filters.search } : {}),
          ...(this.filters.status ? { status: this.filters.status } : {}),
          ...(this.filters.channelId ? { channelId: this.filters.channelId } : {}),
          ...(this.filters.dateFrom ? { dateFrom: this.filters.dateFrom } : {}),
          ...(this.filters.dateTo ? { dateTo: this.filters.dateTo } : {}),
          ...params,
        };
        const response = await api.get('/online-orders', { params: query });
        if (response.data?.data && Array.isArray(response.data.data)) {
          this.orders = response.data.data;
        } else if (Array.isArray(response.data)) {
          this.orders = response.data;
        } else {
          this.orders = [];
        }

        if (response?.data?.meta) {
          this.pagination = {
            page: Number(response.data.meta.page) || this.pagination.page,
            limit: Number(response.data.meta.limit) || this.pagination.limit,
            total: Number(response.data.meta.total) || this.pagination.total,
            totalPages: Number(response.data.meta.totalPages) || this.pagination.totalPages,
          };
        }
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل الطلبات');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchOrder(id) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.get(`/online-orders/${id}`);
        this.currentOrder = response.data?.data || response.data;
        return this.currentOrder;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحميل بيانات الطلب');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createOrder(orderData) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.post('/online-orders', orderData);
        notificationStore.success('تم إنشاء الطلب بنجاح');
        await this.fetchOrders();
        return response.data?.data || response.data;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل إنشاء الطلب');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateOrder(id, orderData) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.put(`/online-orders/${id}`, orderData);
        notificationStore.success('تم تحديث الطلب بنجاح');
        await this.fetchOrders();
        return response.data?.data || response.data;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحديث الطلب');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async changeStatus(id, status) {
      const notificationStore = useNotificationStore();
      try {
        const response = await api.patch(`/online-orders/${id}/status`, { status });
        const updated = response.data?.data || response.data;
        const index = this.orders.findIndex((o) => o.id === id);
        if (index !== -1 && updated) {
          this.orders[index] = { ...this.orders[index], status: updated.status };
        }
        notificationStore.success('تم تحديث حالة الطلب');
        return updated;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحديث حالة الطلب');
        throw error;
      }
    },

    async convertOrder(id, payload = {}) {
      const notificationStore = useNotificationStore();
      try {
        const response = await api.post(`/online-orders/${id}/convert`, payload);
        const data = response.data?.data || response.data;
        const invoiceNumber = data?.sale?.invoiceNumber;
        // Reflect the new converted state in the list without a full refetch.
        const index = this.orders.findIndex((o) => o.id === id);
        if (index !== -1 && data?.order) {
          this.orders[index] = { ...this.orders[index], ...data.order };
        }
        notificationStore.success(
          invoiceNumber ? `تم إنشاء الفاتورة ${invoiceNumber}` : 'تم تحويل الطلب إلى فاتورة'
        );
        return data;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحويل الطلب إلى فاتورة');
        throw error;
      }
    },

    async deleteOrder(id) {
      const notificationStore = useNotificationStore();
      try {
        const response = await api.delete(`/online-orders/${id}`);
        this.orders = this.orders.filter((o) => o.id !== id);
        notificationStore.success('تم حذف الطلب بنجاح');
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل حذف الطلب');
        throw error;
      }
    },
  },
});
