<template>
  <header class="dt-titlebar" @dblclick="onDoubleClick">
    <div class="dt-titlebar__end no-drag">
      <!-- Service status surfaced ONLY when not ready ("عند الحاجة") -->
      <div
        v-if="serviceStatus !== 'ready'"
        class="dt-titlebar__status"
        :title="statusLabel"
        role="status"
      >
        <span class="dt-titlebar__status-dot" :class="`is-${serviceStatus}`"></span>
        <span class="dt-titlebar__status-text">{{ statusLabel }}</span>
      </div>

      <!-- Window controls — only in the Electron frameless window -->
      <div v-if="isElectron" class="dt-titlebar__winctrls">
        <button class="dt-winbtn" aria-label="تصغير" @click="minimize">
          <v-icon size="15">mdi-window-minimize</v-icon>
        </button>
        <button
          class="dt-winbtn"
          :aria-label="isMaximized ? 'استعادة' : 'تكبير'"
          @click="toggleMaximize"
        >
          <v-icon size="15">{{
            isMaximized ? 'mdi-window-restore' : 'mdi-window-maximize'
          }}</v-icon>
        </button>
        <button class="dt-winbtn dt-winbtn--close" aria-label="إغلاق" @click="close">
          <v-icon size="15">mdi-window-close</v-icon>
        </button>
      </div>
    </div>

    <div class="dt-titlebar__spacer"></div>

    <!-- desktop top menu -->
    <DesktopMenuBar v-if="menuBarVisible" class="desktop-shell__menubar" />

    <!-- App identity + current workspace name (start / logical right in RTL) -->
    <div class="dt-titlebar__start">
      <img class="dt-titlebar__logo" src="@/assets/logo.png" alt="" aria-hidden="true" />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useShellLayout } from '@/composables/useShellLayout';
import { useWindowControls } from '@/composables/useWindowControls';
import { useBackendStateStore } from '@/stores/backendState';
import DesktopMenuBar from './DesktopMenuBar.vue';

const { menuBarVisible } = useShellLayout();

const { isElectron, isMaximized, minimize, toggleMaximize, close } = useWindowControls();

const backend = useBackendStateStore();
const serviceStatus = computed(() => backend.status);
const statusLabel = computed(
  () =>
    ({
      starting: 'جارٍ تشغيل الخدمة…',
      error: 'الخدمة متوقفة',
      ready: 'متصل',
    })[serviceStatus.value] || ''
);

// Double-clicking the draggable bar toggles maximize (desktop convention).
const onDoubleClick = (e) => {
  if (!isElectron) return;
  if (e.target.closest('.no-drag')) return;
  toggleMaximize();
};
</script>

<style scoped lang="scss">
.desktop-shell__menubar {
  flex: 0 0 auto;
  user-select: auto;
  -webkit-app-region: none;
}
.dt-titlebar {
  display: flex;
  align-items: center;
  height: 34px;
  padding-inline-end: 10px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
  user-select: none;
  -webkit-app-region: drag;
}

.dt-titlebar__start {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-right: 10px;
}

.dt-titlebar__logo {
  height: 18px;
  width: auto;
  object-fit: contain;
}

.dt-titlebar__app {
  font-weight: 700;
  font-size: 12.5px;
  white-space: nowrap;
}

.dt-titlebar__divider {
  opacity: 0.35;
  font-size: 12px;
}

.dt-titlebar__page {
  font-size: 12.5px;
  opacity: 0.85;
  max-width: 40vw;
}

.dt-titlebar__spacer {
  flex: 1 1 auto;
}

.dt-titlebar__end {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.dt-titlebar__status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-inline: 8px;
  font-size: 11.5px;
  opacity: 0.9;
}

.dt-titlebar__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));

  &.is-starting {
    background: rgb(var(--v-theme-warning));
    animation: dt-pulse 1.2s ease-in-out infinite;
  }
  &.is-error {
    background: rgb(var(--v-theme-error));
  }
}

@keyframes dt-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.dt-titlebar__winctrls {
  display: flex;
  align-items: center;
  height: 100%;
  flex-direction: row-reverse;
}

.dt-winbtn {
  width: 46px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
  &--close:hover {
    background: rgb(var(--v-theme-error));
    color: #fff;
  }
}
</style>
