<template>
  <span class="dt-kbd" :aria-label="keys">
    <template v-for="(key, i) in parts" :key="i">
      <kbd class="dt-kbd__key">{{ display(key) }}</kbd>
      <span v-if="i < parts.length - 1" class="dt-kbd__plus" aria-hidden="true">+</span>
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue';

/**
 * Renders a keyboard shortcut as styled <kbd> chips — the consistent way to
 * show a shortcut hint (command bar, palette, menus) instead of ad-hoc spans.
 *
 * @prop {string} keys  e.g. "Ctrl+Shift+P" (rendered as Ctrl ⇧ P).
 */
const props = defineProps({
  keys: { type: String, required: true },
});

const SYMBOLS = { shift: '⇧', alt: 'Alt', ctrl: 'Ctrl', cmd: '⌘', meta: '⌘', enter: '↵', esc: 'Esc' };
const parts = computed(() =>
  props.keys
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
);
const display = (key) => SYMBOLS[key.toLowerCase()] || key;
</script>

<style scoped lang="scss">
.dt-kbd {
  display: inline-flex;
  align-items: center;
  gap: 3px;

  &__key {
    font-family: inherit;
    font-size: 10.5px;
    line-height: 1;
    padding: 2px 5px;
    border: 1px solid rgba(var(--v-border-color), 0.3);
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    color: rgba(var(--v-theme-on-surface), 0.75);
  }
  &__plus {
    font-size: 10px;
    opacity: 0.4;
  }
}
</style>
