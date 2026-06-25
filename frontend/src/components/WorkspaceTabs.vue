<template>
  <div class="dt-wtabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="(t, i) in visibleItems"
      :key="t.value"
      ref="tabEls"
      type="button"
      role="tab"
      class="dt-wtabs__tab"
      :class="{ 'is-active': t.value === modelValue }"
      :aria-selected="t.value === modelValue"
      :tabindex="t.value === modelValue ? 0 : -1"
      @click="select(t.value)"
      @keydown="onKeydown($event, i)"
    >
      <v-icon v-if="t.icon" size="17" class="dt-wtabs__icon">{{ t.icon }}</v-icon>
      <span class="dt-wtabs__label">{{ t.label }}</span>
      <span
        v-if="t.badge != null && t.badge !== ''"
        class="dt-wtabs__badge"
        :style="t.badgeColor ? { background: `rgb(var(--v-theme-${t.badgeColor}))` } : null"
      >
        {{ t.badge }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

/**
 * Desktop in-context tab strip (Microsoft/Office-style segmented tabs with an
 * active underline) — NOT Vuetify's pill tabs. Used INSIDE a record/workspace
 * for same-context sections (details / operations / notes / history), never for
 * navigating between unrelated modules.
 *
 * Controlled via v-model. Items: { value, label, icon?, badge?, badgeColor?,
 * hidden? }. Keyboard: ←/→ move (RTL-aware: ← = next), Home/End jump.
 */
const props = defineProps({
  items: { type: Array, required: true },
  modelValue: { type: [String, Number], default: null },
  ariaLabel: { type: String, default: 'أقسام' },
});
const emit = defineEmits(['update:modelValue']);

const tabEls = ref([]);
const visibleItems = computed(() => props.items.filter((t) => !t.hidden));

const select = (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
};

const focusTab = (index) => {
  const n = visibleItems.value.length;
  if (!n) return;
  const i = (index + n) % n;
  select(visibleItems.value[i].value);
  tabEls.value[i]?.focus();
};

const onKeydown = (e, index) => {
  switch (e.key) {
    case 'ArrowLeft': // RTL: visually-next tab
      e.preventDefault();
      focusTab(index + 1);
      break;
    case 'ArrowRight': // RTL: visually-previous tab
      e.preventDefault();
      focusTab(index - 1);
      break;
    case 'Home':
      e.preventDefault();
      focusTab(0);
      break;
    case 'End':
      e.preventDefault();
      focusTab(visibleItems.value.length - 1);
      break;
    default:
      break;
  }
};
</script>

<style scoped lang="scss">
.dt-wtabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  overflow-x: auto;
}

.dt-wtabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  border-bottom: 2px solid transparent;
  transition: color 0.12s ease, background-color 0.12s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
    color: rgb(var(--v-theme-on-surface));
  }
  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
  &.is-active {
    color: rgb(var(--v-theme-primary));
    border-bottom-color: rgb(var(--v-theme-primary));
  }
}

.dt-wtabs__badge {
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.18);
  color: #fff;
}
</style>
