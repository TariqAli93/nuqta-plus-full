import { defineStore } from 'pinia';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';

/**
 * Dynamic RBAC management — talks ONLY to /api/rbac. Permission keys are
 * internal; the UI shows the Arabic names/groups returned by the catalog.
 */
/**
 * Unwrap an API result into the payload, tolerant of either response shape.
 *
 * The axios response interceptor (plugins/axios.js) already returns
 * `response.data`, so a successful `await api.get()` resolves to the JSON BODY
 * — `{ success, data }` — NOT the raw axios response. The actual payload is
 * therefore `body.data`. These helpers also fall back to `body.data.data` so
 * they keep working if the interceptor convention ever changes (raw axios).
 */
const asArray = (body) =>
  Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.data) ? body.data.data : [];
const asObject = (body) => body?.data?.data ?? body?.data ?? null;

export const useRbacStore = defineStore('rbac', {
  state: () => ({
    catalog: [], // [{ group, permissions: [{ key, nameAr, descriptionAr }] }]
    roles: [],
    currentRole: null, // { ..., permissionKeys: [] }
    loading: false,
    saving: false,
  }),

  actions: {
    async fetchCatalog() {
      try {
        const res = await api.get('/rbac/permissions');
        this.catalog = asArray(res);
        return this.catalog;
      } catch (error) {
        useNotificationStore().error(error?.message || 'فشل تحميل الصلاحيات');
        throw error;
      }
    },

    async fetchRoles() {
      this.loading = true;
      try {
        const res = await api.get('/rbac/roles');
        this.roles = asArray(res);
        return this.roles;
      } catch (error) {
        useNotificationStore().error(error?.message || 'تعذر تحميل الأدوار');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchRole(id) {
      try {
        const res = await api.get(`/rbac/roles/${id}`);
        this.currentRole = asObject(res);
        return this.currentRole;
      } catch (error) {
        useNotificationStore().error(error?.message || 'فشل تحميل الدور');
        throw error;
      }
    },

    async createRole(payload) {
      this.saving = true;
      const notify = useNotificationStore();
      try {
        const res = await api.post('/rbac/roles', payload);
        notify.success('تم إنشاء الدور');
        await this.fetchRoles();
        return asObject(res);
      } catch (error) {
        notify.error(error?.message || 'فشل إنشاء الدور');
        throw error;
      } finally {
        this.saving = false;
      }
    },

    async updateRole(id, payload) {
      this.saving = true;
      const notify = useNotificationStore();
      try {
        const res = await api.put(`/rbac/roles/${id}`, payload);
        notify.success('تم تحديث الدور');
        await this.fetchRoles();
        return asObject(res);
      } catch (error) {
        notify.error(error?.message || 'فشل تحديث الدور');
        throw error;
      } finally {
        this.saving = false;
      }
    },

    async setRolePermissions(id, permissionKeys) {
      this.saving = true;
      const notify = useNotificationStore();
      try {
        const res = await api.put(`/rbac/roles/${id}/permissions`, { permissionKeys });
        notify.success('تم حفظ صلاحيات الدور');
        const updated = asObject(res);
        if (updated) this.currentRole = updated;
        await this.fetchRoles();
        return updated;
      } catch (error) {
        notify.error(error?.message || 'فشل حفظ الصلاحيات');
        throw error;
      } finally {
        this.saving = false;
      }
    },

    async deleteRole(id) {
      const notify = useNotificationStore();
      try {
        await api.delete(`/rbac/roles/${id}`);
        notify.success('تم حذف الدور');
        if (this.currentRole?.id === id) this.currentRole = null;
        await this.fetchRoles();
      } catch (error) {
        notify.error(error?.message || 'فشل حذف الدور');
        throw error;
      }
    },
  },
});
