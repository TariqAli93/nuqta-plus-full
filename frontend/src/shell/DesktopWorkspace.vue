<template>
  <div id="workspace" class="dt-workspace" aria-label="منطقة العمل">
    <router-view v-slot="{ Component, route }">
      <!-- Key by PATH (not fullPath) so a page remounts on route/param change
           but NOT on a query-only change (preserves in-page state such as open
           dialogs — same rationale as the previous MainLayout). The refreshTick
           lets the command-bar "تحديث" force a clean remount on demand. -->
      <component :is="Component" v-if="Component" :key="`${route.path}::${refreshTick}`" />
    </router-view>
  </div>
</template>

<script setup>
import { useShellLayout } from '@/composables/useShellLayout';

const { refreshTick } = useShellLayout();
</script>

<style scoped lang="scss">
.dt-workspace {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  // Desktop-appropriate content padding — denser than Vuetify's default fluid
  // container, but enough breathing room for the existing pages that assumed a
  // container wrapper. Pages can still go edge-to-edge with their own layout.
  padding: 12px 16px;
  background: rgb(var(--v-theme-background));
}
</style>
