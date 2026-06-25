<template>
  <footer class="dt-statusbar" aria-label="شريط الحالة">
    <!-- Start: service / database status -->
    <div class="dt-statusbar__group">
      <span class="dt-statusbar__dot" :class="`is-${serviceStatus}`"></span>
      <span>{{ statusLabel }}</span>
    </div>

    <div class="dt-statusbar__sep" aria-hidden="true"></div>

    <!-- Current user + role -->
    <div v-if="authStore.user" class="dt-statusbar__group">
      <v-icon size="13">mdi-account</v-icon>
      <span>{{ authStore.user?.username }}</span>
      <span v-if="roleName" class="dt-statusbar__muted">· {{ roleName }}</span>
    </div>

    <!-- Active branch / warehouse (read-only mirror; switching lives in the
         command bar). Only shown when a context exists. -->
    <template v-if="contextLabel">
      <div class="dt-statusbar__sep" aria-hidden="true"></div>
      <div class="dt-statusbar__group">
        <v-icon size="13">mdi-store</v-icon>
        <span>{{ contextLabel }}</span>
      </div>
    </template>

    <div class="dt-statusbar__spacer"></div>

    <!-- Optional per-page summary slot would mount here in future migrations -->

    <!-- App version -->
    <div class="dt-statusbar__group dt-statusbar__muted">
      <v-icon size="13">mdi-information-outline</v-icon>
      <span>الإصدار {{ appVersion }}</span>
    </div>
  </footer>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { useBackendStateStore } from '@/stores/backendState';

const authStore = useAuthStore();
const inventoryStore = useInventoryStore();
const backend = useBackendStateStore();

const serviceStatus = computed(() => backend.status);
const statusLabel = computed(
  () =>
    ({
      starting: 'جارٍ التشغيل…',
      ready: 'الخدمة تعمل',
      error: 'الخدمة متوقفة',
    })[serviceStatus.value] || ''
);

const roleName = computed(() => authStore.user?.role?.name || '');

const contextLabel = computed(() => {
  const b = inventoryStore.selectedBranch?.name;
  const w = inventoryStore.selectedWarehouse?.name;
  if (b && w) return `${b} · ${w}`;
  return b || w || '';
});

// App version from Electron when available, otherwise the backend-reported one.
const appVersion = ref('—');
onMounted(async () => {
  try {
    if (window.electronAPI?.getVersion) {
      appVersion.value = await window.electronAPI.getVersion();
    } else if (backend.version) {
      appVersion.value = backend.version;
    }
  } catch {
    /* leave placeholder */
  }
});
</script>

<style scoped lang="scss">
.dt-statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding-inline: 10px;
  font-size: 11.5px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.85);
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
  user-select: none;
}

.dt-statusbar__group {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.dt-statusbar__muted {
  opacity: 0.6;
}

.dt-statusbar__spacer {
  flex: 1 1 auto;
}

.dt-statusbar__sep {
  width: 1px;
  height: 14px;
  background: rgba(var(--v-border-color), 0.18);
}

.dt-statusbar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));

  &.is-starting {
    background: rgb(var(--v-theme-warning));
  }
  &.is-error {
    background: rgb(var(--v-theme-error));
  }
}
</style>
