<template>
  <nav
    ref="navRef"
    class="dt-nav"
    :class="{ 'dt-nav--collapsed': navCollapsed }"
    aria-label="التنقل الرئيسي"
    @keydown="onKeydown"
  >
    <div class="dt-nav__scroll">
      <!-- ── Pinned ─────────────────────────────────────────────── -->
      <section v-if="pinnedItems.length" class="dt-nav__section">
        <div v-if="!navCollapsed" class="dt-nav__heading">مثبّتة</div>
        <DesktopNavItem
          v-for="item in pinnedItems"
          :key="`pin-${item.id}`"
          :item="item"
          :collapsed="navCollapsed"
          :active="isItemActive(item, route.path)"
          :badge="badgeFor(item)"
          :pinned="true"
          :can-pin="canPin(item)"
          @activate="onActivate(item)"
          @toggle-pin="togglePin(item)"
        />
        <v-divider class="my-1" />
      </section>

      <!-- ── Recent (expanded only) ─────────────────────────────── -->
      <section v-if="!navCollapsed && recentItems.length" class="dt-nav__section">
        <div class="dt-nav__heading">الأخيرة</div>
        <DesktopNavItem
          v-for="item in recentItems"
          :key="`recent-${item.id}`"
          :item="item"
          :collapsed="false"
          :active="isItemActive(item, route.path)"
          :badge="badgeFor(item)"
          :pinned="isPinned(item.id)"
          :can-pin="canPin(item)"
          @activate="onActivate(item)"
          @toggle-pin="togglePin(item)"
        />
        <v-divider class="my-1" />
      </section>

      <!-- ── Main registry tree ─────────────────────────────────── -->
      <template v-for="entry in tree" :key="entry.id">
        <!-- Leaf -->
        <DesktopNavItem
          v-if="!isGroup(entry)"
          :item="entry"
          :collapsed="navCollapsed"
          :active="isItemActive(entry, route.path)"
          :badge="badgeFor(entry)"
          :pinned="isPinned(entry.id)"
          :can-pin="canPin(entry)"
          @activate="onActivate(entry)"
          @toggle-pin="togglePin(entry)"
        />

        <!-- Group — collapsed: hover/click flyout -->
        <v-menu
          v-else-if="navCollapsed"
          location="end"
          open-on-hover
          :close-on-content-click="true"
        >
          <template #activator="{ props }">
            <button
              v-bind="props"
              type="button"
              class="dt-nav__row dt-nav__row--collapsed"
              :class="{ 'dt-nav__row--active': isGroupActive(entry, route.path) }"
              :aria-label="entry.label"
            >
              <v-icon :size="21">{{ entry.icon }}</v-icon>
            </button>
          </template>
          <v-list density="compact" min-width="240" class="dt-nav__flyout">
            <v-list-subheader>{{ entry.label }}</v-list-subheader>
            <v-list-item
              v-for="child in entry.children"
              :key="child.id"
              :to="child.route || undefined"
              :prepend-icon="child.icon"
              :title="child.label"
              :active="isItemActive(child, route.path)"
              @click="!child.route && onActivate(child)"
            >
              <template v-if="badgeFor(child) != null" #append>
                <span class="dt-nav__badge">{{ badgeFor(child) }}</span>
              </template>
            </v-list-item>
          </v-list>
        </v-menu>

        <!-- Group — expanded: accordion -->
        <div v-else class="dt-nav__group">
          <button
            type="button"
            class="dt-nav__row dt-nav__group-header"
            :class="{ 'dt-nav__row--active': isGroupActive(entry, route.path) }"
            :aria-expanded="isGroupOpen(entry.id)"
            @click="toggleGroup(entry.id)"
          >
            <v-icon class="dt-nav__icon" :size="19">{{ entry.icon }}</v-icon>
            <span class="dt-nav__label text-truncate">{{ entry.label }}</span>
            <v-icon class="dt-nav__chevron" :class="{ 'is-open': isGroupOpen(entry.id) }" size="18">
              mdi-chevron-down
            </v-icon>
          </button>
          <v-expand-transition>
            <div v-show="isGroupOpen(entry.id)">
              <DesktopNavItem
                v-for="child in entry.children"
                :key="child.id"
                :item="child"
                :collapsed="false"
                :indented="true"
                :active="isItemActive(child, route.path)"
                :badge="badgeFor(child)"
                :pinned="isPinned(child.id)"
                :can-pin="canPin(child)"
                @activate="onActivate(child)"
                @toggle-pin="togglePin(child)"
              />
            </div>
          </v-expand-transition>
        </div>
      </template>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNavigation } from '@/composables/useNavigation';
import { useShellLayout } from '@/composables/useShellLayout';
import { openReportWindow } from '@/composables/useReportWindow';
import { useNotificationStore } from '@/stores/notification';
import DesktopNavItem from './DesktopNavItem.vue';

const route = useRoute();
const { navCollapsed } = useShellLayout();
const notification = useNotificationStore();

const {
  tree,
  isGroup,
  isItemActive,
  isGroupActive,
  isGroupOpen,
  toggleGroup,
  ensureActiveGroupOpen,
  isPinned,
  canPin,
  togglePin,
  pinnedItems,
  trackRoute,
  recentItems,
  badgeFor,
} = useNavigation();

/** Leaf clicked: route items navigate via <router-link>; report/command items
 *  open a standalone report window here (no business logic — just the window). */
const onActivate = async (item) => {
  if (!item.report) return;
  try {
    await openReportWindow(item.report);
  } catch (err) {
    console.error('[reports] open failed:', err);
    notification.error('تعذر فتح التقرير، حاول مرة أخرى');
  }
};

// ── Keyboard navigation: roving focus over visible rows ───────────────────
const navRef = ref(null);
const focusableRows = () =>
  navRef.value ? Array.from(navRef.value.querySelectorAll('.dt-nav__row')) : [];

const onKeydown = (e) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const rows = focusableRows();
  if (!rows.length) return;
  e.preventDefault();
  const idx = rows.indexOf(document.activeElement);
  let next;
  if (e.key === 'ArrowDown') next = rows[idx < 0 ? 0 : (idx + 1) % rows.length];
  else if (e.key === 'ArrowUp')
    next = rows[idx < 0 ? rows.length - 1 : (idx - 1 + rows.length) % rows.length];
  else if (e.key === 'Home') next = rows[0];
  else next = rows[rows.length - 1];
  next?.focus();
};

// Track recents + keep the active route's group open. Single instance: the nav
// is mounted exactly once in the shell.
watch(
  () => route.path,
  (path) => {
    ensureActiveGroupOpen(path);
    trackRoute(path);
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.dt-nav {
  width: 240px;
  flex: 0 0 240px;
  background: rgb(var(--v-theme-surface));
  border-inline-end: 1px solid rgba(var(--v-border-color), 0.08);
  overflow: hidden;
  transition:
    width 0.16s ease,
    flex-basis 0.16s ease;

  &--collapsed {
    width: 56px;
    flex-basis: 56px;
  }
}

.dt-nav__scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
}

.dt-nav__section {
  margin-bottom: 2px;
}

.dt-nav__heading {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  padding: 6px 10px 2px;
}

// Group header shares the row look but adds a chevron.
.dt-nav__group-header {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-weight: 600;
}

.dt-nav__chevron {
  margin-inline-start: auto;
  transition: transform 0.18s ease;
  &.is-open {
    transform: rotate(180deg);
  }
}

// Row styling for the locally-declared rows (group header + collapsed group
// activator) — mirrors DesktopNavItem so the rail looks uniform.
.dt-nav__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  padding-inline: 10px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 13px;
  text-align: start;
  border-radius: 6px;
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
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
}
</style>
