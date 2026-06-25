<template>
  <div class="dt-cmdbar">
    <!-- ── Start: navigation utilities + page commands ───────────── -->
    <div class="dt-cmdbar__start">
      <v-btn
        icon="mdi-dock-left"
        variant="text"
        size="small"
        :aria-label="navCollapsed ? 'توسيع القائمة الجانبية' : 'طيّ القائمة الجانبية'"
        @click="toggleNav"
      />
      <v-btn icon="mdi-arrow-right" variant="text" size="small" aria-label="رجوع" @click="goBack" />
      <v-btn
        icon="mdi-refresh"
        variant="text"
        size="small"
        aria-label="تحديث"
        :loading="isLoading('app.refresh')"
        @click="execute('app.refresh')"
      />

      <v-divider vertical class="mx-1 my-2" />

      <span class="dt-cmdbar__title text-truncate">{{ pageTitle }}</span>

      <!-- Selection commands (appear only when rows are selected) -->
      <template v-if="bar.selection.length">
        <v-chip size="small" color="primary" variant="tonal" class="ms-2">
          {{ selection.length }} محدد
        </v-chip>
        <v-btn
          v-for="cmd in bar.selection"
          :key="cmd.id"
          class="ms-1"
          color="primary"
          variant="text"
          size="small"
          :prepend-icon="cmd.icon"
          :disabled="!isEnabled(cmd)"
          :loading="isLoading(cmd.id)"
          @click="execute(cmd.id)"
        >
          {{ cmd.title }}
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          icon="mdi-close"
          aria-label="إلغاء التحديد"
          @click="clearSelection"
        />
        <v-divider vertical class="mx-1 my-2" />
      </template>

      <!-- Primary page commands -->
      <v-btn
        v-for="cmd in bar.primary"
        :key="cmd.id"
        class="ms-1"
        color="primary"
        variant="flat"
        size="small"
        :prepend-icon="cmd.icon"
        :disabled="!isEnabled(cmd)"
        :loading="isLoading(cmd.id)"
        @click="execute(cmd.id)"
      >
        {{ cmd.title }}
      </v-btn>

      <!-- Overflow menu for secondary page commands -->
      <v-menu v-if="bar.secondary.length" location="bottom end">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            icon="mdi-dots-vertical"
            variant="text"
            size="small"
            aria-label="إجراءات إضافية"
          />
        </template>
        <v-list density="compact" min-width="220">
          <v-list-item
            v-for="cmd in bar.secondary"
            :key="cmd.id"
            :prepend-icon="cmd.icon"
            :disabled="!isEnabled(cmd)"
            @click="execute(cmd.id)"
          >
            <v-list-item-title>{{ cmd.title }}</v-list-item-title>
            <template v-if="cmd.shortcut" #append>
              <span class="dt-cmdbar__kbd">{{ cmd.shortcut }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div class="dt-cmdbar__spacer"></div>

    <!-- ── End: global tools ─────────────────────────────────────── -->
    <div class="dt-cmdbar__end">
      <HeaderQuickActions />

      <BranchWarehouseSelector />

      <v-btn
        class="dt-cmdbar__search"
        variant="tonal"
        size="small"
        prepend-icon="mdi-magnify"
        aria-label="لوحة الأوامر (Ctrl+Shift+P)"
        @click="execute('app.command-palette')"
      >
        <span class="dt-cmdbar__search-label">الأوامر</span>
        <span class="dt-cmdbar__kbd">Ctrl ⇧ P</span>
      </v-btn>

      <v-badge
        v-if="perm('view:notifications')"
        :content="alertStore.unreadCount"
        :model-value="alertStore.unreadCount > 0"
        color="error"
        offset-x="4"
        offset-y="4"
      >
        <v-btn
          icon="mdi-bell-outline"
          variant="text"
          size="small"
          :to="{ name: 'Notifications' }"
          aria-label="التنبيهات"
        />
      </v-badge>

      <v-btn
        :icon="isDark ? 'mdi-white-balance-sunny' : 'mdi-weather-night'"
        variant="text"
        size="small"
        :aria-label="isDark ? 'الوضع الفاتح' : 'الوضع الداكن'"
        @click="execute('app.toggle-theme')"
      />

      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            icon="mdi-account-circle-outline"
            variant="text"
            size="small"
            aria-label="قائمة المستخدم"
          />
        </template>
        <v-list density="compact" min-width="220">
          <v-list-item>
            <v-list-item-title>{{ authStore.user?.username }}</v-list-item-title>
            <v-list-item-subtitle>{{ authStore.user?.role?.name }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item prepend-icon="mdi-account-circle" to="/profile">
            <v-list-item-title>الملف الشخصي</v-list-item-title>
          </v-list-item>
          <v-list-item prepend-icon="mdi-logout" @click="execute('app.logout')">
            <v-list-item-title>تسجيل خروج</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAlertStore } from '@/stores/alert';
import { useNavigation } from '@/composables/useNavigation';
import { useShellLayout } from '@/composables/useShellLayout';
import { useAppTheme } from '@/composables/useAppTheme';
import { useCommands } from '@/commands/useCommands';
import HeaderQuickActions from '@/components/HeaderQuickActions.vue';
import BranchWarehouseSelector from '@/components/BranchWarehouseSelector.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const alertStore = useAlertStore();

const { getPageTitle } = useNavigation();
const pageTitle = computed(() => getPageTitle(route.path));

const { navCollapsed, toggleNav } = useShellLayout();
const { isDark } = useAppTheme();

// Everything actionable goes through the central command service. The bar never
// re-implements a command — it only renders + dispatches by id.
const { barCommands, execute, isEnabled, isLoading, selection, clearSelection } = useCommands();
const bar = barCommands;

const perm = (p) => authStore.hasPermission(p);
const goBack = () => router.back();
</script>

<style scoped lang="scss">
.dt-cmdbar {
  display: flex;
  align-items: center;
  height: 60px;
  padding-inline: 6px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.dt-cmdbar__start,
.dt-cmdbar__end {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.dt-cmdbar__end {
  gap: 4px;
}

.dt-cmdbar__spacer {
  flex: 1 1 auto;
}

.dt-cmdbar__title {
  font-size: 13.5px;
  font-weight: 600;
  margin-inline: 6px;
  max-width: 22vw;
}

.dt-cmdbar__search {
  text-transform: none;
}

.dt-cmdbar__kbd {
  margin-inline-start: 8px;
  font-size: 10.5px;
  opacity: 0.6;
  border: 1px solid rgba(var(--v-border-color), 0.3);
  border-radius: 4px;
  padding: 1px 5px;
}

@media (max-width: 960px) {
  .dt-cmdbar__search-label,
  .dt-cmdbar__kbd {
    display: none;
  }
}
</style>
