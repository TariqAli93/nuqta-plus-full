<template>
  <DesktopSelectionBar :count="count" :noun="noun" @clear="$emit('clear')">
    <!-- "Select all results" escalation for server-side tables (req #3) -->
    <template v-if="allResultsSelected">
      <v-chip size="small" color="primary" variant="tonal" class="me-1">
        كل النتائج ({{ totalItems }})
      </v-chip>
      <v-btn size="small" variant="text" @click="$emit('clear-all-results')">
        تحديد هذه الصفحة فقط
      </v-btn>
    </template>
    <template v-else-if="canSelectAllResults">
      <v-btn size="small" variant="text" prepend-icon="mdi-select-all" @click="$emit('select-all-results')">
        تحديد كل النتائج ({{ totalItems }})
      </v-btn>
    </template>

    <v-divider vertical class="mx-1" />

    <!-- Primary bulk actions as buttons; the rest collapse into a “…” menu. -->
    <v-btn
      v-for="action in primaryActions"
      :key="action.key"
      size="small"
      :variant="action.danger ? 'text' : 'tonal'"
      :color="action.color || (action.danger ? 'error' : undefined)"
      :prepend-icon="action.icon"
      :disabled="action.disabled"
      @click="$emit('action', action.key)"
    >
      {{ action.title }}
    </v-btn>

    <v-menu v-if="overflowActions.length" location="bottom end">
      <template #activator="{ props: m }">
        <v-btn v-bind="m" size="small" variant="text" icon="mdi-dots-horizontal" title="إجراءات أخرى" />
      </template>
      <v-list density="compact">
        <v-list-item
          v-for="action in overflowActions"
          :key="action.key"
          :prepend-icon="action.icon"
          :disabled="action.disabled"
          :class="{ 'text-error': action.danger }"
          @click="$emit('action', action.key)"
        >
          <v-list-item-title>{{ action.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </DesktopSelectionBar>
</template>

<script setup>
import { computed } from 'vue';
import DesktopSelectionBar from '@/ui/DesktopSelectionBar.vue';

/**
 * SmartTableBulkActions (req #3) — the action bar shown while rows are selected.
 * Wraps the existing DesktopSelectionBar (count chip + clear) and lays out the
 * bulk actions: the first `maxPrimary` as buttons, the remainder in an overflow
 * menu. Permission/branch gating happens upstream — actions passed here are
 * already the allowed ones; each may still carry a per-selection `disabled`.
 *
 * Supports the server-side "select all N results" escalation: when the whole
 * page is selected and more results exist, offers to select them all.
 */
const props = defineProps({
  count: { type: Number, default: 0 },
  noun: { type: String, default: 'محدد' },
  actions: { type: Array, default: () => [] }, // [{ key, title, icon, color, danger, disabled }]
  maxPrimary: { type: Number, default: 3 },
  // server "select all results" support
  canSelectAllResults: { type: Boolean, default: false },
  allResultsSelected: { type: Boolean, default: false },
  totalItems: { type: Number, default: 0 },
});

defineEmits(['action', 'clear', 'select-all-results', 'clear-all-results']);

const primaryActions = computed(() => props.actions.slice(0, props.maxPrimary));
const overflowActions = computed(() => props.actions.slice(props.maxPrimary));
</script>
