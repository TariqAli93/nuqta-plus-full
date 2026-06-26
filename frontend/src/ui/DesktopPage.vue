<template>
  <div class="dt-page">
    <PageHeader v-if="title || subtitle || $slots.toolbar" :title="title" :subtitle="subtitle" :icon="icon">
      <slot name="toolbar" />
    </PageHeader>

    <div class="dt-page__body">
      <DesktopLoadingState v-if="loading" :label="loadingLabel" />
      <DesktopErrorState v-else-if="error" :error="error" retryable @retry="$emit('retry')" />
      <slot v-else />
    </div>
  </div>
</template>

<script setup>
import PageHeader from '@/components/PageHeader.vue';
import DesktopLoadingState from './DesktopLoadingState.vue';
import DesktopErrorState from './DesktopErrorState.vue';

/**
 * Standard desktop page chrome: a compact header (title/subtitle/icon +
 * `#toolbar` actions) over a content body that transparently swaps to a
 * loading or error state. Composes the existing PageHeader (no duplication) and
 * centralizes the loading/error wiring repeated across pages.
 *
 * Slots: `toolbar` (header actions), default (content).
 *
 * @prop {string} title
 * @prop {string} subtitle
 * @prop {string} icon
 * @prop {boolean} loading
 * @prop {object} error          AppError (shows DesktopErrorState).
 * @prop {string} loadingLabel
 */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  loadingLabel: { type: String, default: '' },
});

defineEmits(['retry']);
</script>

<style scoped lang="scss">
.dt-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.dt-page__body {
  min-height: 0;
}
</style>
