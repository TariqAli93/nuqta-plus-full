<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="6"
    min-width="300"
  >
    <template #activator="{ props: act }">
      <v-btn
        v-bind="act"
        size="small"
        variant="text"
        prepend-icon="mdi-view-column-outline"
        class="st-tool-btn"
      >
        الأعمدة
        <v-badge
          v-if="hiddenCount > 0"
          :content="hiddenCount"
          color="primary"
          inline
          class="ms-1"
        />
      </v-btn>
    </template>

    <v-card min-width="300" max-width="360" class="st-colmgr">
      <div class="st-colmgr__head">
        <span class="text-subtitle-2">إدارة الأعمدة</span>
        <span class="text-caption text-medium-emphasis">اسحب لإعادة الترتيب</span>
      </div>
      <v-divider />

      <v-list density="compact" class="st-colmgr__list py-1">
        <v-list-item
          v-for="col in columns"
          :key="col.key"
          :class="{ 'st-colmgr__row--drag': dragKey === col.key }"
          draggable="true"
          @dragstart="onDragStart(col.key, $event)"
          @dragover.prevent="onDragOver(col.key)"
          @drop.prevent="onDrop(col.key)"
          @dragend="onDragEnd"
        >
          <template #prepend>
            <v-icon size="18" class="st-colmgr__handle" :class="{ 'is-disabled': false }">
              mdi-drag-vertical
            </v-icon>
            <v-checkbox-btn
              :model-value="col.visible"
              :disabled="col.locked"
              density="compact"
              hide-details
              @update:model-value="$emit('toggle', col.key)"
            />
          </template>

          <v-list-item-title class="st-colmgr__title">
            {{ col.title || col.key }}
            <v-icon v-if="col.locked" size="13" class="ms-1 text-medium-emphasis">
              mdi-lock-outline
            </v-icon>
          </v-list-item-title>

          <template #append>
            <v-btn
              v-if="col.pinnable !== false"
              :icon="col.pinned ? 'mdi-pin' : 'mdi-pin-outline'"
              size="x-small"
              variant="text"
              :color="col.pinned ? 'primary' : undefined"
              :title="pinTitle(col)"
              @click="cyclePin(col)"
            />
          </template>
        </v-list-item>
      </v-list>

      <v-divider />
      <div class="st-colmgr__foot">
        <v-btn size="small" variant="text" @click="$emit('show-all')">إظهار الكل</v-btn>
        <v-spacer />
        <v-btn size="small" variant="text" prepend-icon="mdi-restore" @click="$emit('reset')">
          إعادة تعيين
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref, computed } from 'vue';

/**
 * SmartTableColumnManager (req #1) — show/hide, drag-reorder, and pin columns.
 * Stateless: the parent owns the column state (via useSmartTable) and this
 * component only emits intents. Locked columns can't be hidden; pinnable
 * columns can be pinned to the start or end (sticky).
 *
 * @prop {Array} columns  orderedColumns from useSmartTable
 *        ({ key, title, visible, locked, pinned, pinnable }).
 */
const props = defineProps({
  columns: { type: Array, default: () => [] },
});

const emit = defineEmits(['toggle', 'reorder', 'set-pinned', 'reset', 'show-all']);

const open = ref(false);
const dragKey = ref(null);
const overKey = ref(null);

const hiddenCount = computed(() => props.columns.filter((c) => !c.visible).length);

const onDragStart = (key, e) => {
  dragKey.value = key;
  try {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  } catch {
    /* some browsers disallow setData here */
  }
};
const onDragOver = (key) => {
  overKey.value = key;
};
const onDrop = (key) => {
  if (dragKey.value && dragKey.value !== key) {
    const keys = props.columns.map((c) => c.key);
    const from = keys.indexOf(dragKey.value);
    keys.splice(from, 1);
    const to = keys.indexOf(key);
    keys.splice(to, 0, dragKey.value);
    emit('reorder', keys);
  }
  onDragEnd();
};
const onDragEnd = () => {
  dragKey.value = null;
  overKey.value = null;
};

const pinTitle = (col) => {
  if (col.pinned === 'start') return 'مثبت في البداية — اضغط للتثبيت في النهاية';
  if (col.pinned === 'end') return 'مثبت في النهاية — اضغط لإلغاء التثبيت';
  return 'تثبيت العمود';
};

// none -> start -> end -> none
const cyclePin = (col) => {
  const next = col.pinned === 'start' ? 'end' : col.pinned === 'end' ? null : 'start';
  emit('set-pinned', { key: col.key, side: next });
};
</script>

<style scoped lang="scss">
.st-colmgr__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 6px;
}
.st-colmgr__list {
  max-height: 360px;
  overflow-y: auto;
}
.st-colmgr__row--drag {
  opacity: 0.5;
}
.st-colmgr__handle {
  cursor: grab;
  margin-inline-end: 2px;
  opacity: 0.5;
}
.st-colmgr__title {
  font-size: 13px;
}
.st-colmgr__foot {
  display: flex;
  align-items: center;
  padding: 4px 8px;
}
</style>
