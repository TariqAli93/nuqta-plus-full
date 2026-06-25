<template>
  <Teleport to="body">
    <Transition name="dt-palette">
      <div v-if="isOpen" class="dt-palette__scrim" @mousedown.self="close">
        <div
          class="dt-palette"
          role="dialog"
          aria-modal="true"
          aria-label="لوحة الأوامر"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="runActive"
          @keydown.esc.prevent="close"
        >
          <!-- Search field (desktop command-bar look, not a form input) -->
          <div class="dt-palette__search">
            <v-icon size="18" class="dt-palette__search-icon">mdi-console-line</v-icon>
            <input
              ref="inputEl"
              v-model="query"
              class="dt-palette__input"
              type="text"
              placeholder="اكتب اسم الأمر…"
              spellcheck="false"
              autocomplete="off"
              aria-label="بحث الأوامر"
            />
            <span class="dt-palette__hint">Ctrl+Shift+P</span>
          </div>

          <v-divider />

          <!-- Results -->
          <div ref="listEl" class="dt-palette__list" role="listbox">
            <template v-for="row in rows" :key="row.key">
              <div v-if="row.type === 'header'" class="dt-palette__group">{{ row.label }}</div>

              <button
                v-else
                :ref="(el) => setItemRef(el, row.index)"
                type="button"
                role="option"
                class="dt-palette__item"
                :class="{
                  'is-active': row.index === activeIndex,
                  'is-disabled': !row.enabled,
                }"
                :aria-selected="row.index === activeIndex"
                :aria-disabled="!row.enabled"
                @mousemove="activeIndex = row.index"
                @click="run(row.cmd)"
              >
                <v-icon class="dt-palette__item-icon" size="18">
                  {{ row.cmd.icon || 'mdi-chevron-right' }}
                </v-icon>

                <div class="dt-palette__item-text">
                  <div class="dt-palette__item-title">{{ row.cmd.title }}</div>
                  <div v-if="row.cmd.description || !row.enabled" class="dt-palette__item-sub">
                    <span v-if="!row.enabled" class="dt-palette__reason">
                      <v-icon size="12">mdi-lock-outline</v-icon> {{ row.reason }}
                    </span>
                    <span v-else>{{ row.cmd.description }}</span>
                  </div>
                </div>

                <v-progress-circular
                  v-if="isLoading(row.cmd.id)"
                  indeterminate
                  size="14"
                  width="2"
                  class="me-2"
                />
                <span v-if="row.cmd.group" class="dt-palette__item-group">{{ row.cmd.group }}</span>
                <span v-if="row.cmd.shortcut" class="dt-palette__kbd">{{ row.cmd.shortcut }}</span>
              </button>
            </template>

            <div v-if="flatCommands.length === 0" class="dt-palette__empty">
              لا توجد أوامر مطابقة
            </div>
          </div>

          <!-- Footer hints -->
          <div class="dt-palette__footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span>
            <span><kbd>Enter</kbd> تنفيذ</span>
            <span><kbd>Esc</kbd> إغلاق</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useCommands } from '@/commands/useCommands';
import { useCommandPalette } from '@/commands/useCommandPalette';
import { searchCommands } from '@/commands/commandSearch';

const { visibleCommands, execute, isEnabled, isLoading, disabledReason } = useCommands();
const { isOpen, recentIds, close, recordRecent } = useCommandPalette();

const query = ref('');
const activeIndex = ref(0);
const inputEl = ref(null);
const listEl = ref(null);
const runningId = ref(null);
const itemEls = {};
const setItemRef = (el, index) => {
  if (el) itemEls[index] = el;
};

// Ordered, sectioned rows. Empty query → recents then all; query → ranked
// results. Only `cmd` rows are selectable (carry an `index`).
const rows = computed(() => {
  const visible = visibleCommands.value;
  const out = [];
  let idx = 0;
  const pushSection = (label, cmds) => {
    if (!cmds.length) return;
    out.push({ type: 'header', label, key: `h-${label}` });
    for (const cmd of cmds) {
      out.push({
        type: 'cmd',
        cmd,
        index: idx++,
        enabled: isEnabled(cmd),
        reason: disabledReason(cmd),
        key: `c-${cmd.id}`,
      });
    }
  };

  if (query.value.trim()) {
    pushSection('النتائج', searchCommands(visible, query.value));
  } else {
    const byId = new Map(visible.map((c) => [c.id, c]));
    const recents = recentIds.value.map((id) => byId.get(id)).filter(Boolean);
    const recentSet = new Set(recents.map((c) => c.id));
    const rest = visible
      .filter((c) => !recentSet.has(c.id))
      .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'ar') || a.title.localeCompare(b.title, 'ar'));
    pushSection('آخر الأوامر', recents);
    pushSection('كل الأوامر', rest);
  }
  return out;
});

const flatCommands = computed(() => rows.value.filter((r) => r.type === 'cmd').map((r) => r.cmd));

const move = (delta) => {
  const n = flatCommands.value.length;
  if (!n) return;
  activeIndex.value = (activeIndex.value + delta + n) % n;
};

const runActive = () => {
  const cmd = flatCommands.value[activeIndex.value];
  if (cmd) run(cmd);
};

const run = async (cmd) => {
  // Execute once: ignore re-entrancy while a command is running, and no-op on
  // disabled commands (the reason is shown inline).
  if (!cmd || runningId.value || !isEnabled(cmd)) return;
  runningId.value = cmd.id;
  recordRecent(cmd.id);
  try {
    await execute(cmd.id); // central error handling lives in useCommands
  } finally {
    runningId.value = null;
    close();
  }
};

// Reset on open: clear query, select first, focus input.
watch(isOpen, async (open) => {
  if (!open) {
    runningId.value = null;
    return;
  }
  query.value = '';
  activeIndex.value = 0;
  await nextTick();
  inputEl.value?.focus();
});

// Keep selection valid as results change; scroll the active row into view.
watch([query, rows], () => {
  if (activeIndex.value >= flatCommands.value.length) activeIndex.value = 0;
});
watch(activeIndex, async () => {
  await nextTick();
  itemEls[activeIndex.value]?.scrollIntoView({ block: 'nearest' });
});
</script>

<style scoped lang="scss">
// Subtle scrim (not a heavy web-modal backdrop); panel anchored near the top.
.dt-palette__scrim {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 9vh;
  background: rgba(0, 0, 0, 0.32);
}

.dt-palette {
  width: min(640px, 92vw);
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: 8px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.dt-palette__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.dt-palette__search-icon {
  opacity: 0.6;
}
.dt-palette__input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  padding: 4px 0;
}
.dt-palette__hint {
  font-size: 10.5px;
  opacity: 0.45;
  border: 1px solid rgba(var(--v-border-color), 0.3);
  border-radius: 4px;
  padding: 1px 6px;
}

.dt-palette__list {
  overflow-y: auto;
  padding: 4px;
}

.dt-palette__group {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  padding: 8px 10px 3px;
}

.dt-palette__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: start;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 6px 10px;
  min-height: 38px;
  cursor: pointer;

  &.is-active {
    background: rgba(var(--v-theme-primary), 0.14);
  }
  &.is-disabled {
    opacity: 0.55;
    cursor: default;
  }
}
.dt-palette__item-icon {
  flex: 0 0 auto;
  opacity: 0.85;
}
.dt-palette__item-text {
  flex: 1 1 auto;
  min-width: 0;
}
.dt-palette__item-title {
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-palette__item-sub {
  font-size: 11.5px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-palette__reason {
  color: rgb(var(--v-theme-warning));
  opacity: 0.95;
}
.dt-palette__item-group {
  flex: 0 0 auto;
  font-size: 10.5px;
  opacity: 0.55;
}
.dt-palette__kbd {
  flex: 0 0 auto;
  font-size: 10.5px;
  opacity: 0.7;
  border: 1px solid rgba(var(--v-border-color), 0.3);
  border-radius: 4px;
  padding: 1px 6px;
}

.dt-palette__empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
}

.dt-palette__footer {
  display: flex;
  gap: 16px;
  padding: 6px 12px;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  font-size: 11px;
  opacity: 0.7;

  kbd {
    font-family: inherit;
    border: 1px solid rgba(var(--v-border-color), 0.3);
    border-radius: 3px;
    padding: 0 4px;
    margin-inline-end: 2px;
  }
}

// Snappy desktop transition (not a slow web-modal fade).
.dt-palette-enter-active,
.dt-palette-leave-active {
  transition: opacity 0.1s ease;
}
.dt-palette-enter-from,
.dt-palette-leave-to {
  opacity: 0;
}
.dt-palette-enter-active .dt-palette,
.dt-palette-leave-active .dt-palette {
  transition: transform 0.12s ease;
}
.dt-palette-enter-from .dt-palette {
  transform: translateY(-8px);
}
</style>
