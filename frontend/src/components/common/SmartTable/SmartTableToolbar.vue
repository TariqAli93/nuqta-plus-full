<template>
  <div class="st-toolbar">
    <div class="st-toolbar__start">
      <div v-if="showSearch" class="st-toolbar__search">
        <v-text-field
          ref="searchField"
          :model-value="search"
          :placeholder="searchPlaceholder"
          :loading="loading"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          single-line
          :aria-label="searchPlaceholder"
          @update:model-value="$emit('update:search', $event ?? '')"
          @keyup.enter="$emit('search-now')"
          @click:clear="$emit('clear-search')"
        />
      </div>
      <slot name="start" />
      <span v-if="resultText" class="st-toolbar__count text-caption text-medium-emphasis">
        {{ resultText }}
      </span>
    </div>

    <v-spacer />

    <div class="st-toolbar__end">
      <slot name="tools" />

      <v-menu v-if="showDensity" location="bottom end" offset="6">
        <template #activator="{ props: act }">
          <v-btn v-bind="act" size="small" variant="text" icon="mdi-format-line-spacing" title="كثافة العرض" />
        </template>
        <v-list density="compact" min-width="180">
          <v-list-item
            v-for="opt in densityOptions"
            :key="opt.value"
            :active="density === opt.value"
            :prepend-icon="opt.icon"
            @click="$emit('set-density', opt.value)"
          >
            <v-list-item-title>{{ opt.label }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn
        v-if="showRefresh"
        size="small"
        variant="text"
        icon="mdi-refresh"
        :loading="loading"
        title="تحديث"
        aria-label="تحديث"
        @click="$emit('refresh')"
      />

      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

/**
 * SmartTableToolbar — the compact Fluent toolbar: a debounce-free search box +
 * result count on the start; the feature menus (`tools` slot, filled by
 * <SmartTable>), a density switch, refresh, and page actions (`actions` slot)
 * on the end. Purely presentational — it emits intents; <SmartTable> owns state.
 *
 * Search emits raw input (`update:search`) + `search-now` on Enter +
 * `clear-search`; debouncing is the data layer's job (server: useServerSearch,
 * client: SmartTable itself).
 */
defineProps({
  search: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: 'بحث…' },
  showSearch: { type: Boolean, default: true },
  showRefresh: { type: Boolean, default: true },
  showDensity: { type: Boolean, default: true },
  density: { type: String, default: 'compact' },
  resultText: { type: String, default: '' },
});

defineEmits(['update:search', 'search-now', 'clear-search', 'set-density', 'refresh']);

const searchField = ref(null);
const densityOptions = computed(() => [
  { value: 'comfortable', label: 'مريح', icon: 'mdi-arrow-expand-vertical' },
  { value: 'default', label: 'عادي', icon: 'mdi-format-align-justify' },
  { value: 'compact', label: 'مضغوط', icon: 'mdi-arrow-collapse-vertical' },
]);

/** Focus the search input (Ctrl+F from <SmartTable>). */
const focusSearch = () => {
  const el = searchField.value?.$el?.querySelector('input');
  el?.focus();
};
defineExpose({ focusSearch });
</script>

<style scoped lang="scss">
.st-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  flex-wrap: wrap;
}
.st-toolbar__start,
.st-toolbar__end {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.st-toolbar__search {
  width: clamp(200px, 30vw, 360px);
}
.st-toolbar__count {
  white-space: nowrap;
  margin-inline-start: 4px;
}
</style>
