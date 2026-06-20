import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

export const useSalesChannelStore = defineStore('salesChannel', {
  state: () => ({
    channels: [],
    currentChannel: null,
    loading: false,
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 0,
    },
  }),

  actions: {
    async fetchChannels(params = {}) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.get('/sales-channels', { params });
        if (response.data?.data && Array.isArray(response.data.data)) {
          this.channels = response.data.data;
        } else if (Array.isArray(response.data)) {
          this.channels = response.data;
        } else {
          this.channels = [];
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
        notificationStore.error(error?.message || 'فشل تحميل قنوات البيع');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createChannel(channelData) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.post('/sales-channels', channelData);
        const created = response.data?.data || response.data;
        if (created && !this.channels.find((c) => c.id === created.id)) {
          this.channels.unshift(created);
        }
        notificationStore.success('تم إضافة قناة البيع بنجاح');
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل إضافة قناة البيع');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateChannel(id, channelData) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.put(`/sales-channels/${id}`, channelData);
        const updated = response.data?.data || response.data;
        const index = this.channels.findIndex((c) => c.id === id);
        if (index !== -1 && updated) {
          this.channels[index] = updated;
        }
        notificationStore.success('تم تحديث قناة البيع بنجاح');
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل تحديث قناة البيع');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async deleteChannel(id) {
      this.loading = true;
      const notificationStore = useNotificationStore();
      try {
        const response = await api.delete(`/sales-channels/${id}`);
        this.channels = this.channels.filter((c) => c.id !== id);
        notificationStore.success('تم حذف قناة البيع بنجاح');
        return response;
      } catch (error) {
        notificationStore.error(error?.message || 'فشل حذف قناة البيع');
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
