<template>
  <nav class="dt-menubar" aria-label="شريط القوائم">
    <v-menu
      v-for="menu in visibleMenus"
      :key="menu.key"
      location="bottom start"
      transition="fade-transition"
    >
      <template #activator="{ props }">
        <button class="dt-menubar__btn" v-bind="props">{{ menu.label }}</button>
      </template>
      <v-list density="compact" min-width="220" class="dt-menubar__list">
        <template v-for="(entry, i) in menu.visibleItems" :key="entry.key || `sep-${i}`">
          <v-divider v-if="entry.divider" class="my-1" />
          <v-list-item v-else :prepend-icon="entry.icon" @click="run(entry)">
            <v-list-item-title>{{ entry.label }}</v-list-item-title>
            <template v-if="entry.shortcut" #append>
              <span class="dt-menubar__shortcut">{{ entry.shortcut }}</span>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-menu>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useShellLayout } from '@/composables/useShellLayout';
import { useAppTheme } from '@/composables/useAppTheme';

const router = useRouter();
const authStore = useAuthStore();
const { toggleNav, toggleMenuBar } = useShellLayout();
const { toggleTheme } = useAppTheme();

const perm = (p) => authStore.hasPermission(p);
const can = (c) => authStore.can(c);

const go = (to) => router.push(to);
const dispatch = (name) => window.dispatchEvent(new CustomEvent(name));

const exitApp = () => {
  // Reuse the existing close path (keeps the main-process confirm dialog).
  if (window.electronAPI?.windowControls?.close) window.electronAPI.windowControls.close();
  else if (window.electronAPI?.closeApp) window.electronAPI.closeApp();
};

const checkUpdates = () => window.electronAPI?.checkUpdatesManually?.();

const printPage = () => window.print();

const toggleFullscreen = () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
};

// Data-driven menus. `show` (when present and false) hides the item; menus with
// no visible items are dropped entirely. RBAC is honoured via perm()/can().
const menus = computed(() => [
  {
    key: 'file',
    label: 'ملف',
    items: [
      {
        key: 'new-sale',
        label: 'بيع جديد',
        icon: 'mdi-cash-register',
        show: can('canUsePOS'),
        action: () => go('/sales/pos'),
      },
      {
        key: 'new-installment',
        label: 'فاتورة تقسيط',
        icon: 'mdi-calendar-clock',
        show: can('canUseInstallments'),
        action: () => go('/sales/new'),
      },
      {
        key: 'new-purchase',
        label: 'فاتورة شراء',
        icon: 'mdi-cart-arrow-down',
        show: can('canUsePurchases'),
        action: () => go('/purchases/new'),
      },
      { divider: true },
      { key: 'print', label: 'طباعة الصفحة', icon: 'mdi-printer', action: printPage },
      { divider: true },
      { key: 'exit', label: 'خروج', icon: 'mdi-logout-variant', action: exitApp },
    ],
  },
  {
    key: 'edit',
    label: 'تحرير',
    items: [
      {
        key: 'command-palette',
        label: 'بحث / لوحة الأوامر',
        icon: 'mdi-magnify',
        shortcut: 'Ctrl+K',
        action: () => dispatch('open-quick-search'),
      },
    ],
  },
  {
    key: 'view',
    label: 'عرض',
    items: [
      {
        key: 'theme',
        label: 'تبديل السمة (فاتح/داكن)',
        icon: 'mdi-theme-light-dark',
        action: toggleTheme,
      },
      {
        key: 'toggle-nav',
        label: 'طيّ / توسيع القائمة الجانبية',
        icon: 'mdi-dock-left',
        action: toggleNav,
      },
      {
        key: 'hide-menubar',
        label: 'إخفاء شريط القوائم',
        icon: 'mdi-menu-open',
        action: toggleMenuBar,
      },
      { divider: true },
      {
        key: 'fullscreen',
        label: 'ملء الشاشة',
        icon: 'mdi-fullscreen',
        shortcut: 'F11',
        action: toggleFullscreen,
      },
    ],
  },
  {
    key: 'tools',
    label: 'أدوات',
    items: [
      {
        key: 'settings',
        label: 'إعدادات النظام',
        icon: 'mdi-tune',
        show: perm('view:settings'),
        action: () => go('/settings'),
      },
      {
        key: 'feature-flags',
        label: 'إعدادات الميزات والنمط',
        icon: 'mdi-toggle-switch',
        show: perm('manage_feature_toggles'),
        action: () => go('/settings/feature-flags'),
      },
      {
        key: 'users',
        label: 'الموظفون',
        icon: 'mdi-account-cog',
        show: perm('view:users'),
        action: () => go('/users'),
      },
      {
        key: 'roles',
        label: 'الأدوار والصلاحيات',
        icon: 'mdi-shield-account-outline',
        show: perm('roles:read'),
        action: () => go('/roles'),
      },
    ],
  },
  {
    key: 'help',
    label: 'مساعدة',
    items: [
      {
        key: 'shortcuts',
        label: 'اختصارات لوحة المفاتيح',
        icon: 'mdi-keyboard',
        shortcut: '?',
        action: () => dispatch('open-shortcuts-help'),
      },
      {
        key: 'about',
        label: 'حول البرنامج',
        icon: 'mdi-information-outline',
        action: () => go('/about'),
      },
      { key: 'updates', label: 'التحقق من التحديثات', icon: 'mdi-update', action: checkUpdates },
    ],
  },
]);

const visibleMenus = computed(() =>
  menus.value
    .map((m) => ({
      ...m,
      visibleItems: m.items.filter((it) => it.divider || it.show === undefined || it.show),
    }))
    // Drop menus whose only entries are dividers / fully hidden.
    .filter((m) => m.visibleItems.some((it) => !it.divider))
);

function run(entry) {
  entry.action?.();
}
</script>

<style scoped lang="scss">
.dt-menubar {
  display: flex;
  align-items: center;
  height: 30px;
  padding-inline-start: 4px;
  background: rgb(var(--v-theme-surface));
}

.dt-menubar__btn {
  appearance: none;
  border: none;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  padding: 0 10px;
  height: 100%;
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.07);
  }
}

.dt-menubar__shortcut {
  font-size: 11px;
  opacity: 0.6;
}
</style>
