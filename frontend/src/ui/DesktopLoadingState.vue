<template>
  <div class="dt-loading-state" role="status" aria-live="polite">
    <v-progress-circular indeterminate color="primary" :size="size" :width="width" />
    <div v-if="label" class="dt-loading-state__label">{{ label }}</div>
  </div>
</template>

<script setup>
/**
 * Centered loading indicator for a panel/region (non-table). For tables use
 * DesktopDataGrid's built-in skeleton instead.
 *
 * @prop {string} label  Optional caption under the spinner.
 * @prop {number} size   Spinner diameter (px).
 * @prop {number} width  Spinner stroke width.
 */
defineProps({
  label: { type: String, default: '' },
  size: { type: Number, default: 48 },
  width: { type: Number, default: 4 },
});
</script>

<style scoped lang="scss">
.dt-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 16px;
  color: rgba(var(--v-theme-on-surface), 0.7);

  &__label {
    font-size: 13px;
  }
}
</style>
