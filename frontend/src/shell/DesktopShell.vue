<template>
  <div class="desktop-shell">
    <DesktopTitleBar class="desktop-shell__titlebar" />

    <div class="desktop-shell__body">
      <DesktopNavigation class="desktop-shell__nav" />

      <div class="desktop-shell__main">
        <DesktopCommandBar class="desktop-shell__commandbar py-3" />
        <DesktopWorkspace class="desktop-shell__workspace" />
      </div>
    </div>

    <DesktopStatusBar class="desktop-shell__statusbar" />

    <!-- Non-visual / overlay layers -->
    <DesktopNotifications />
    <DesktopOverlays />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

import { useAppTheme } from '@/composables/useAppTheme';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useCommandShortcuts } from '@/commands/useCommandShortcuts';
import { useWindowTitle } from '@/composables/useWindowTitle';

import DesktopTitleBar from './DesktopTitleBar.vue';

import DesktopNavigation from './DesktopNavigation.vue';
import DesktopCommandBar from './DesktopCommandBar.vue';
import DesktopWorkspace from './DesktopWorkspace.vue';
import DesktopStatusBar from './DesktopStatusBar.vue';
import DesktopNotifications from './DesktopNotifications.vue';
import DesktopOverlays from './DesktopOverlays.vue';

const { initTheme } = useAppTheme();

// Restore the saved theme as early as possible (mirrors old MainLayout init).
initTheme();

// Global keyboard shortcuts (Ctrl+K command palette, Escape, etc.) — unchanged.
useKeyboardShortcuts();

// Command-system keyboard shortcuts (executes registered commands by id).
useCommandShortcuts();

// Keep the window/document title in sync with the active page (#20).
useWindowTitle();

onMounted(() => {
  // Theme is already applied in setup; nothing else to bootstrap here. Realtime
  // alert lifecycle is owned by <DesktopNotifications>.
});
</script>

<style scoped lang="scss">
.desktop-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.desktop-shell__titlebar,
.desktop-shell__menubar,
.desktop-shell__commandbar,
.desktop-shell__statusbar {
  flex: 0 0 auto;
}

.desktop-shell__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}

.desktop-shell__main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
</style>
