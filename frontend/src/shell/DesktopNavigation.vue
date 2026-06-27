<template>
  <nav
    ref="navRef"
    class="dt-nav"
    :class="{ 'dt-nav--collapsed': navCollapsed }"
    aria-label="التنقل الرئيسي"
    @keydown="onKeydown"
  >
    <!-- ── Header: logo + brand + collapse toggle ─────────────────────── -->
    <div class="dt-nav__header">
      <button
        v-if="navCollapsed"
        type="button"
        class="dt-nav__logo-btn"
        aria-label="توسيع القائمة"
        @click="toggleNav"
      >
        <img class="dt-nav__logo" src="@/assets/logo.png" alt="" />
        <v-tooltip activator="parent" location="end" text="توسيع القائمة" />
      </button>
      <template v-else>
        <img class="dt-nav__logo" src="@/assets/logo.png" alt="" aria-hidden="true" />
        <span class="dt-nav__brand text-truncate">{{ APP_TITLE }}</span>
        <button type="button" class="dt-nav__collapse" aria-label="طيّ القائمة" @click="toggleNav">
          <v-icon size="20">mdi-chevron-double-left</v-icon>
        </button>
      </template>
    </div>

    <!-- ── Scrollable navigation ──────────────────────────────────────── -->
    <div class="dt-nav__scroll">
      <!-- Pinned (expanded only) -->
      <section v-if="!navCollapsed && pinnedDisplay.length" class="dt-nav__section">
        <div class="dt-nav__heading">مثبّتة</div>
        <DesktopNavItem
          v-for="item in pinnedDisplay"
          :key="`pin-${item.id}`"
          :item="item"
          :collapsed="false"
          :active="isItemActive(item, route.path)"
          :badge="badgeFor(item)"
          :pinned="true"
          :can-pin="canPin(item)"
          @activate="onActivate(item)"
          @toggle-pin="togglePin(item)"
        />
        <v-divider class="dt-nav__divider" />
      </section>

      <!-- Main registry tree -->
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
              class="dt-nav__row dt-nav__row--collapsed mt-3"
              :class="{ 'dt-nav__row--active': isGroupActive(entry, route.path) }"
              :aria-label="entry.label"
            >
              <v-icon :size="22">{{ entry.icon }}</v-icon>
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
            :aria-expanded="isGroupOpen(entry)"
            @click="toggleGroup(entry)"
          >
            <v-icon class="dt-nav__icon" :size="20">{{ entry.icon }}</v-icon>
            <span class="dt-nav__label text-truncate">{{ entry.label }}</span>
            <v-icon class="dt-nav__chevron" :class="{ 'is-open': isGroupOpen(entry) }" size="18">
              mdi-chevron-down
            </v-icon>
          </button>
          <v-expand-transition>
            <div v-show="isGroupOpen(entry)">
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

    <!-- ── Footer: current user + settings / about / logout ───────────── -->
    <div class="dt-nav__footer">
      <router-link to="/profile" class="dt-nav__user" :aria-label="userName">
        <span class="dt-nav__avatar">{{ userInitials }}</span>
        <span v-if="!navCollapsed" class="dt-nav__user-meta">
          <span class="dt-nav__user-name text-truncate">{{ userName }}</span>
          <span v-if="userRole" class="dt-nav__user-role text-truncate">{{ userRole }}</span>
        </span>
        <v-tooltip v-if="navCollapsed" activator="parent" location="end" :text="userTooltip" />
      </router-link>

      <div class="dt-nav__factions">
        <router-link
          v-for="item in footerItems"
          :key="item.id"
          :to="item.route"
          class="dt-nav__faction"
          :class="{ 'dt-nav__faction--active': isItemActive(item, route.path) }"
          :aria-label="item.label"
        >
          <v-icon class="dt-nav__icon" size="20">{{ item.icon }}</v-icon>
          <span v-if="!navCollapsed" class="dt-nav__faction-label">{{ item.label }}</span>
          <v-tooltip v-if="navCollapsed" activator="parent" location="end" :text="item.label" />
        </router-link>
        <button
          type="button"
          class="dt-nav__faction dt-nav__faction--logout"
          aria-label="تسجيل الخروج"
          @click="logout"
        >
          <v-icon class="dt-nav__icon" size="20">mdi-logout</v-icon>
          <span v-if="!navCollapsed" class="dt-nav__faction-label">تسجيل الخروج</span>
          <v-tooltip v-if="navCollapsed" activator="parent" location="end" text="تسجيل الخروج" />
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNavigation } from '@/composables/useNavigation';
import { useShellLayout } from '@/composables/useShellLayout';
import { openReportWindow } from '@/composables/useReportWindow';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import { useCommands } from '@/commands/useCommands';
import { APP_TITLE } from '@/shell/navigation/registry';
import DesktopNavItem from './DesktopNavItem.vue';

const route = useRoute();
const { navCollapsed, toggleNav } = useShellLayout();
const authStore = useAuthStore();
const notification = useNotificationStore();
const { execute } = useCommands();

const {
  tree,
  isGroup,
  isItemActive,
  isGroupActive,
  isGroupOpen,
  toggleGroup,
  openActiveGroup,
  isPinned,
  canPin,
  togglePin,
  pinnedItems,
  footerItems,
  badgeFor,
} = useNavigation();

// Pinned is the spec's preferred "المثبّتة" — keep it short (4–6 items).
const pinnedDisplay = computed(() => pinnedItems.value.slice(0, 6));

// ── Footer user block ─────────────────────────────────────────────────────
const userName = computed(() => authStore.user?.username || 'مستخدم');
const userRole = computed(() => authStore.user?.role?.name || authStore.user?.role || '');
const userTooltip = computed(() =>
  userRole.value ? `${userName.value} — ${userRole.value}` : userName.value
);
const userInitials = computed(() => {
  const name = userName.value.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return name.slice(0, 2);
});

const logout = () => execute('app.logout');

/** Leaf clicked: route items navigate via <router-link>; report items open a
 *  standalone report window here (no business logic — just the window). */
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

// Accordion: keep the active route's group open (and collapse others) as the
// route changes. Single instance: the nav is mounted exactly once in the shell.
watch(
  () => route.path,
  (path) => openActiveGroup(path),
  { immediate: true }
);
</script>

<style scoped lang="scss">
.dt-nav {
  display: flex;
  flex-direction: column;
  width: 252px;
  flex: 0 0 252px;
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

// ── Header ──────────────────────────────────────────────────────────────
.dt-nav__header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding-inline: 12px;
  border-block-end: 1px solid rgba(var(--v-border-color), 0.08);
}
.dt-nav--collapsed .dt-nav__header {
  justify-content: center;
  padding-inline: 0;
}
.dt-nav__logo {
  height: 24px;
  width: auto;
  object-fit: contain;
  flex: 0 0 auto;
}
.dt-nav__brand {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
}
.dt-nav__collapse,
.dt-nav__logo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.7);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
    color: rgb(var(--v-theme-on-surface));
  }
  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
}

// ── Scroll area ─────────────────────────────────────────────────────────
.dt-nav__scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  // Reserve the scrollbar gutter so the rail never jitters when it appears.
  scrollbar-gutter: stable;
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

.dt-nav__divider {
  margin: 6px 4px;
  opacity: 0.6;
}

// Group header shares the row look but adds a chevron.
.dt-nav__group-header {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-weight: 600;
}

.dt-nav__chevron {
  margin-inline-start: auto;
  transition: transform 0.16s ease;
  &.is-open {
    transform: rotate(180deg);
  }
}

// Row styling for the locally-declared rows (group header + collapsed group
// activator) — mirrors DesktopNavItem so the rail looks uniform.
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

// ── Footer ──────────────────────────────────────────────────────────────
.dt-nav__footer {
  flex: 0 0 auto;
  border-block-start: 1px solid rgba(var(--v-border-color), 0.08);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dt-nav--collapsed .dt-nav__footer {
  align-items: center;
}

.dt-nav__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.12s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
}
.dt-nav__avatar {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  font-size: 12.5px;
}
.dt-nav__user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dt-nav__user-name {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.dt-nav__user-role {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.dt-nav__factions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dt-nav--collapsed .dt-nav__factions {
  align-items: center;
}
.dt-nav__faction {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 36px;
  padding-inline: 10px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 12.5px;
  text-align: start;
  text-decoration: none;
  border-radius: 8px;
  cursor: pointer;
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
  &--active {
    color: rgb(var(--v-theme-primary));
  }
  &--logout:hover {
    color: rgb(var(--v-theme-error));
  }
}
.dt-nav--collapsed .dt-nav__faction {
  width: 40px;
  min-width: 40px;
  height: 40px;
  justify-content: center;
  padding-inline: 0;
  gap: 0;
}
.dt-nav__faction-label {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
