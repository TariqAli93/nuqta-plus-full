<template>
  <v-slide-y-transition>
    <div v-if="count > 0" class="dt-selection-bar" role="toolbar" :aria-label="`${count} ${noun}`">
      <v-chip size="small" color="primary" variant="flat" class="dt-selection-bar__count">
        {{ count }} {{ noun }}
      </v-chip>

      <div class="dt-selection-bar__actions">
        <slot />
      </div>

      <v-spacer />

      <v-btn
        size="small"
        variant="text"
        icon="mdi-close"
        aria-label="إلغاء التحديد"
        @click="$emit('clear')"
      />
    </div>
  </v-slide-y-transition>
</template>

<script setup>
/**
 * Bulk-action bar shown when rows are selected. Renders only while `count > 0`.
 * The bulk action buttons go in the default slot; the caller wires their
 * handlers and `disabled` (e.g. from permissions) — this component stays
 * RBAC-free.
 *
 * @prop {number} count  Number of selected rows.
 * @prop {string} noun   Unit label (e.g. "محدد").
 * @emits clear          Deselect-all requested.
 */
defineProps({
  count: { type: Number, default: 0 },
  noun: { type: String, default: 'محدد' },
});
defineEmits(['clear']);
</script>

<style scoped lang="scss">
.dt-selection-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);

  &__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
}
</style>
