<template>
  <dl class="dt-property-list" :class="{ 'dt-property-list--inline': inline }">
    <template v-for="(item, i) in items" :key="item.key || i">
      <dt class="dt-property-list__label">
        <v-icon v-if="item.icon" size="15" class="me-1">{{ item.icon }}</v-icon>
        {{ item.label }}
      </dt>
      <dd class="dt-property-list__value">
        <slot :name="item.key" :item="item">
          {{ item.value ?? '—' }}
        </slot>
      </dd>
    </template>
  </dl>
</template>

<script setup>
/**
 * Key/value property grid for detail / property panels — the repeated
 * "label: value" layout on record pages. Each value can be overridden by a
 * named slot keyed on `item.key`.
 *
 * @prop {Array} items   [{ key?, label, value?, icon? }]
 * @prop {boolean} inline  Label and value on one line (default: stacked grid).
 */
defineProps({
  items: { type: Array, required: true },
  inline: { type: Boolean, default: false },
});
</script>

<style scoped lang="scss">
.dt-property-list {
  display: grid;
  grid-template-columns: minmax(120px, max-content) 1fr;
  gap: 6px 16px;
  margin: 0;
  font-size: 13px;

  &--inline {
    grid-template-columns: 1fr;
    dt,
    dd {
      display: inline;
    }
  }

  &__label {
    color: rgba(var(--v-theme-on-surface), 0.6);
    display: flex;
    align-items: center;
  }
  &__value {
    margin: 0;
    color: rgb(var(--v-theme-on-surface));
    font-weight: 500;
  }
}
</style>
