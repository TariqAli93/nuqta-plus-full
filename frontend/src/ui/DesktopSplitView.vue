<template>
  <div ref="rootEl" class="dt-split">
    <div class="dt-split__list" :style="{ flexBasis: primaryWidth + 'px' }">
      <slot name="list" />
    </div>

    <div
      class="dt-split__gutter"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      aria-label="تغيير حجم اللوحة"
      @mousedown.prevent="startDrag"
      @keydown="onGutterKey"
    ></div>

    <div class="dt-split__detail">
      <slot name="detail">
        <DesktopEmptyState
          :title="emptyTitle"
          :description="emptyDescription"
          icon="mdi-gesture-tap"
          compact
        />
      </slot>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import DesktopEmptyState from '@/components/EmptyState.vue';

/**
 * Resizable master/detail split: a `list` pane (fixed/resizable width) beside a
 * fluid `detail` pane — the desktop alternative to navigating list → full-page
 * detail. RTL-aware (the list sits on the logical start) and width-persistable.
 *
 * No business logic: the caller renders the list + detail and decides what
 * "selected" means.
 *
 * @prop {number} defaultWidth  Initial list width (px).
 * @prop {number} minWidth
 * @prop {number} maxWidth
 * @prop {string} storageKey    Persist the chosen width under this key.
 */
const props = defineProps({
  defaultWidth: { type: Number, default: 320 },
  minWidth: { type: Number, default: 220 },
  maxWidth: { type: Number, default: 560 },
  storageKey: { type: String, default: '' },
  emptyTitle: { type: String, default: 'اختر عنصراً لعرض تفاصيله' },
  emptyDescription: { type: String, default: '' },
});

const rootEl = ref(null);
const readInitial = () => {
  if (props.storageKey) {
    try {
      const saved = Number(localStorage.getItem(props.storageKey));
      if (saved) return saved;
    } catch {
      /* ignore */
    }
  }
  return props.defaultWidth;
};
const primaryWidth = ref(clamp(readInitial()));

function clamp(w) {
  return Math.max(props.minWidth, Math.min(props.maxWidth, w));
}

function persist() {
  if (!props.storageKey) return;
  try {
    localStorage.setItem(props.storageKey, String(primaryWidth.value));
  } catch {
    /* ignore */
  }
}

let dragging = false;
const isRtl = () =>
  (rootEl.value && getComputedStyle(rootEl.value).direction === 'rtl') ||
  (typeof document !== 'undefined' && document.dir === 'rtl');

function onMove(e) {
  if (!dragging || !rootEl.value) return;
  const rect = rootEl.value.getBoundingClientRect();
  // The list pane is on the logical start edge: right in RTL, left in LTR.
  const width = isRtl() ? rect.right - e.clientX : e.clientX - rect.left;
  primaryWidth.value = clamp(width);
}
function stopDrag() {
  if (!dragging) return;
  dragging = false;
  document.body.style.userSelect = '';
  persist();
}
function startDrag() {
  dragging = true;
  document.body.style.userSelect = 'none';
}
function onGutterKey(e) {
  const step = e.shiftKey ? 32 : 8;
  if (e.key === 'ArrowLeft') {
    primaryWidth.value = clamp(primaryWidth.value + (isRtl() ? step : -step));
    persist();
  } else if (e.key === 'ArrowRight') {
    primaryWidth.value = clamp(primaryWidth.value + (isRtl() ? -step : step));
    persist();
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', stopDrag);
});
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', stopDrag);
});
</script>

<style scoped lang="scss">
.dt-split {
  display: flex;
  align-items: stretch;
  height: 100%;
  min-height: 0;
}
.dt-split__list {
  flex: 0 0 auto;
  min-width: 0;
  overflow: auto;
}
.dt-split__gutter {
  flex: 0 0 auto;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  border-inline: 1px solid rgba(var(--v-border-color), 0.08);
  transition: background-color 0.12s ease;

  &:hover,
  &:focus-visible {
    background: rgba(var(--v-theme-primary), 0.25);
    outline: none;
  }
}
.dt-split__detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}
</style>
