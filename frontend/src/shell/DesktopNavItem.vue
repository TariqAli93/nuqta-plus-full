<template>
  <!-- Route leaf → <router-link> (real <a>, keyboard + a11y for free).
       Report/command leaf → <button>. Active styling is driven by the `active`
       prop computed centrally in the service, NOT by router-link-active, so the
       dashboard ('/') doesn't light up on every route. -->
  <router-link
    v-if="item.route"
    :to="item.route"
    class="dt-nav__row"
    :class="rowClass"
    @contextmenu="onContextMenu"
  >
    <v-icon class="dt-nav__icon" :size="collapsed ? 22 : 20">{{ item.icon }}</v-icon>
    <span v-if="!collapsed" class="dt-nav__label text-truncate">{{ item.label }}</span>
    <span v-if="!collapsed && badge != null" class="dt-nav__badge">{{ badge }}</span>
    <span
      v-else-if="collapsed && badge != null"
      class="dt-nav__badge-dot"
      aria-hidden="true"
    ></span>
    <button
      v-if="!collapsed && canPin"
      type="button"
      class="dt-nav__pin"
      tabindex="-1"
      :aria-label="pinned ? 'إلغاء التثبيت' : 'تثبيت'"
      :class="{ 'is-pinned': pinned }"
      @click.stop.prevent="$emit('toggle-pin')"
    >
      <v-icon size="15">{{ pinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon>
    </button>
    <v-tooltip v-if="collapsed" activator="parent" location="end" :text="tooltipText" />
  </router-link>

  <button v-else type="button" class="dt-nav__row" :class="rowClass" @click="$emit('activate')">
    <v-icon class="dt-nav__icon" :size="collapsed ? 22 : 20">{{ item.icon }}</v-icon>
    <span v-if="!collapsed" class="dt-nav__label text-truncate">{{ item.label }}</span>
    <v-tooltip v-if="collapsed" activator="parent" location="end" :text="tooltipText" />
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  item: { type: Object, required: true },
  collapsed: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  badge: { type: [String, Number], default: null },
  pinned: { type: Boolean, default: false },
  canPin: { type: Boolean, default: false },
  indented: { type: Boolean, default: false },
});

defineEmits(['activate', 'toggle-pin']);

const rowClass = computed(() => ({
  'dt-nav__row--active': props.active,
  'dt-nav__row--collapsed': props.collapsed,
  'dt-nav__row--indented': props.indented && !props.collapsed,
}));

const tooltipText = computed(() =>
  props.badge != null ? `${props.item.label} (${props.badge})` : props.item.label
);

// Right-click pins/unpins (desktop convention) — only for pinnable rows.
const onContextMenu = (e) => {
  if (!props.canPin) return;
  e.preventDefault();
};
</script>

<style scoped lang="scss">
.dt-nav__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 40px;
  padding-inline: 10px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 13px;
  text-align: start;
  text-decoration: none;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
    color: rgb(var(--v-theme-on-surface));
  }
  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  &--collapsed {
    justify-content: center;
    padding-inline: 0;
    gap: 0;
  }

  &--indented {
    padding-inline-start: 36px;
    min-height: 36px;
    font-size: 12.5px;
  }

  &--active {
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));

    &::before {
      content: '';
      position: absolute;
      inset-inline-start: 2px;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 2px;
      background: rgb(var(--v-theme-primary));
    }
  }
}

.dt-nav__icon {
  flex: 0 0 auto;
}

.dt-nav__label {
  flex: 1 1 auto;
  min-width: 0;
}

.dt-nav__badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary, 255, 255, 255));
}

.dt-nav__badge-dot {
  position: absolute;
  top: 6px;
  inset-inline-end: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

.dt-nav__pin {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    color 0.12s ease;

  &.is-pinned {
    opacity: 1;
    color: rgb(var(--v-theme-primary));
  }
}

.dt-nav__row:hover .dt-nav__pin,
.dt-nav__row:focus-within .dt-nav__pin {
  opacity: 1;
}
</style>
