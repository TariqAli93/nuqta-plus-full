<template>
  <teleport to="body">
    <transition name="st-scrim">
      <div v-if="modelValue" class="st-sidepanel__scrim" @click="$emit('update:modelValue', false)" />
    </transition>
    <transition name="st-slide">
      <aside
        v-if="modelValue"
        class="st-sidepanel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header class="st-sidepanel__head">
          <div class="st-sidepanel__nav">
            <v-btn
              icon="mdi-chevron-up"
              size="x-small"
              variant="text"
              :disabled="!hasPrev"
              title="السابق"
              aria-label="السجل السابق"
              @click="$emit('prev')"
            />
            <v-btn
              icon="mdi-chevron-down"
              size="x-small"
              variant="text"
              :disabled="!hasNext"
              title="التالي"
              aria-label="السجل التالي"
              @click="$emit('next')"
            />
          </div>

          <div class="st-sidepanel__titlewrap">
            <div class="st-sidepanel__title">{{ title }}</div>
            <div v-if="subtitle" class="st-sidepanel__subtitle">{{ subtitle }}</div>
          </div>

          <slot name="status" />

          <v-spacer />

          <v-btn
            v-if="showOpenFull"
            icon="mdi-open-in-new"
            size="small"
            variant="text"
            title="فتح الصفحة الكاملة"
            aria-label="فتح الصفحة الكاملة"
            @click="$emit('open-full')"
          />
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            title="إغلاق (Esc)"
            aria-label="إغلاق"
            @click="$emit('update:modelValue', false)"
          />
        </header>

        <v-divider />

        <div class="st-sidepanel__body">
          <div v-if="loading" class="st-sidepanel__loading">
            <v-progress-circular indeterminate color="primary" size="40" width="3" />
          </div>
          <slot v-else />
        </div>

        <template v-if="$slots.actions">
          <v-divider />
          <footer class="st-sidepanel__foot">
            <slot name="actions" />
          </footer>
        </template>
      </aside>
    </transition>
  </teleport>
</template>

<script setup>
import { watch, onBeforeUnmount } from 'vue';

/**
 * SmartTableSidePanel (req #8) — a right-anchored quick-view drawer so users
 * inspect a record without leaving the list. Details load on demand (the page
 * fetches when a row opens); shows a spinner while `loading`. Supports
 * previous/next record navigation, an "open full page" jump, and Esc-to-close.
 * It does NOT open on checkbox/row-action clicks — that's enforced by
 * <SmartTable>, which only opens it on a genuine row activation.
 *
 * Content is fully caller-driven via the default slot (+ `status`, `actions`).
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  hasPrev: { type: Boolean, default: false },
  hasNext: { type: Boolean, default: false },
  showOpenFull: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue', 'prev', 'next', 'open-full']);

const onKey = (e) => {
  if (!props.modelValue) return;
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('update:modelValue', false);
  } else if (e.key === 'ArrowUp' && props.hasPrev) {
    emit('prev');
  } else if (e.key === 'ArrowDown' && props.hasNext) {
    emit('next');
  }
};

watch(
  () => props.modelValue,
  (open) => {
    if (typeof window === 'undefined') return;
    if (open) window.addEventListener('keydown', onKey, true);
    else window.removeEventListener('keydown', onKey, true);
  }
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
});
</script>

<style scoped lang="scss">
.st-sidepanel__scrim {
  position: fixed;
  inset: 0;
  z-index: 2400;
  background: rgba(var(--v-theme-on-surface), 0.32);
}
.st-sidepanel {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0; /* physical right edge — slides in from the right (req #8) */
  z-index: 2401;
  width: min(440px, 92vw);
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border-left: 1px solid rgba(var(--v-border-color), 0.16);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.18);
}
.st-sidepanel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.st-sidepanel__nav {
  display: flex;
  flex-direction: column;
}
.st-sidepanel__titlewrap {
  min-width: 0;
}
.st-sidepanel__title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.st-sidepanel__subtitle {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.st-sidepanel__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 16px;
}
.st-sidepanel__loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}
.st-sidepanel__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
}

.st-slide-enter-active,
.st-slide-leave-active {
  transition: transform 0.22s ease;
}
.st-slide-enter-from,
.st-slide-leave-to {
  /* Panel sits at the right edge; push it off-screen right (physical, so it
     behaves the same in RTL and LTR). */
  transform: translateX(100%);
}
.st-scrim-enter-active,
.st-scrim-leave-active {
  transition: opacity 0.2s ease;
}
.st-scrim-enter-from,
.st-scrim-leave-to {
  opacity: 0;
}
</style>
