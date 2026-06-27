<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="6"
    min-width="340"
    :max-width="panelWidth"
  >
    <template #activator="{ props: act }">
      <v-btn v-bind="act" size="small" variant="text" prepend-icon="mdi-filter-variant" class="st-tool-btn">
        الفلاتر
        <v-badge v-if="activeCount > 0" :content="activeCount" color="primary" inline class="ms-1" />
      </v-btn>
    </template>

    <v-card class="st-filters" :width="panelWidth">
      <div class="st-filters__head">
        <span class="text-subtitle-2">فلاتر متقدمة</span>
        <v-btn
          v-if="activeCount > 0"
          size="x-small"
          variant="text"
          color="primary"
          @click="clearAll"
        >
          مسح الكل
        </v-btn>
      </div>
      <v-divider />

      <div class="st-filters__body">
        <!-- Custom controls (page-supplied) take precedence over auto-render. -->
        <slot name="default" :values="draft" :set="setDraft">
          <v-row dense>
            <v-col
              v-for="f in filters"
              :key="f.key"
              :cols="12"
              :sm="f.cols || 6"
            >
              <!-- text -->
              <v-text-field
                v-if="f.type === 'text'"
                :model-value="draft[f.key]"
                :label="f.label"
                :placeholder="f.placeholder"
                :prepend-inner-icon="f.icon"
                density="comfortable"
                variant="outlined"
                hide-details
                clearable
                @update:model-value="setDraft(f.key, $event)"
              />

              <!-- select / source-backed select -->
              <v-select
                v-else-if="f.type === 'select'"
                :model-value="draft[f.key]"
                :items="optionsFor(f)"
                :item-title="f.itemTitle || 'title'"
                :item-value="f.itemValue || 'value'"
                :label="f.label"
                :prepend-inner-icon="f.icon"
                density="comfortable"
                variant="outlined"
                hide-details
                clearable
                @update:model-value="setDraft(f.key, $event)"
              />

              <!-- multiselect -->
              <v-select
                v-else-if="f.type === 'multiselect'"
                :model-value="draft[f.key] || []"
                :items="optionsFor(f)"
                :item-title="f.itemTitle || 'title'"
                :item-value="f.itemValue || 'value'"
                :label="f.label"
                :prepend-inner-icon="f.icon"
                density="comfortable"
                variant="outlined"
                hide-details
                multiple
                chips
                closable-chips
                clearable
                @update:model-value="setDraft(f.key, $event)"
              />

              <!-- boolean (tri-state) -->
              <v-select
                v-else-if="f.type === 'boolean'"
                :model-value="draft[f.key]"
                :items="booleanOptions(f)"
                :label="f.label"
                :prepend-inner-icon="f.icon"
                density="comfortable"
                variant="outlined"
                hide-details
                clearable
                @update:model-value="setDraft(f.key, $event)"
              />

              <!-- number range -->
              <div v-else-if="f.type === 'number-range'" class="st-filters__range">
                <div class="st-filters__range-label">{{ f.label }}</div>
                <div class="st-filters__range-inputs">
                  <v-text-field
                    :model-value="draft[f.fromKey]"
                    type="number"
                    label="من"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="setDraft(f.fromKey, numeric($event))"
                  />
                  <v-text-field
                    :model-value="draft[f.toKey]"
                    type="number"
                    label="إلى"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="setDraft(f.toKey, numeric($event))"
                  />
                </div>
              </div>

              <!-- date range -->
              <div v-else-if="f.type === 'date-range'" class="st-filters__range">
                <div class="st-filters__range-label">{{ f.label }}</div>
                <div class="st-filters__range-inputs">
                  <v-text-field
                    :model-value="draft[f.fromKey]"
                    type="date"
                    label="من"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="setDraft(f.fromKey, $event)"
                  />
                  <v-text-field
                    :model-value="draft[f.toKey]"
                    type="date"
                    label="إلى"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="setDraft(f.toKey, $event)"
                  />
                </div>
              </div>
            </v-col>
          </v-row>
        </slot>
      </div>

      <v-divider />
      <div class="st-filters__foot">
        <v-btn size="small" variant="text" @click="open = false">إغلاق</v-btn>
        <v-spacer />
        <!-- Custom (slot) controls apply themselves; only the auto-rendered
             controls need an explicit "تطبيق" to commit the draft. -->
        <v-btn v-if="!customMode" size="small" color="primary" variant="flat" prepend-icon="mdi-check" @click="apply">
          تطبيق
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref, computed, watch, useSlots } from 'vue';

/**
 * SmartTableFilters (req #4) — advanced filters in a popover (never crowding the
 * toolbar). Two modes:
 *   - AUTO: pass `filters` definitions and it renders the right control per
 *     type (text / select / multiselect / boolean / number-range / date-range),
 *     resolving select options from `optionSources` by `f.source`.
 *   - CUSTOM: use the default slot to supply your own controls (gets
 *     `{ values, set }`), for pages with bespoke filter UIs.
 *
 * Edits accumulate in a local DRAFT and commit on "تطبيق" (so a server table
 * doesn't refetch on every keystroke). The active-filter chips are rendered by
 * <SmartTable> in the toolbar, not here.
 */
const props = defineProps({
  filters: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  optionSources: { type: Object, default: () => ({}) },
  activeCount: { type: Number, default: 0 },
  panelWidth: { type: [Number, String], default: 420 },
});

const emit = defineEmits(['update:modelValue', 'apply', 'clear']);

const slots = useSlots();
// When the page supplies its own controls via the default slot, those controls
// own their values and apply on change — we must NOT emit a draft (which would
// be empty and wipe the page's filters).
const customMode = computed(() => !!slots.default);

const open = ref(false);
const draft = ref({ ...props.modelValue });

// Re-sync the draft whenever the popover opens or the committed values change
// out-of-band (e.g. a chip was removed, or a saved view was applied).
watch(open, (v) => {
  if (v) draft.value = { ...props.modelValue };
});
watch(
  () => props.modelValue,
  (v) => {
    if (!open.value) draft.value = { ...v };
  },
  { deep: true }
);

const setDraft = (key, value) => {
  draft.value = { ...draft.value, [key]: value === '' ? null : value };
};

const numeric = (v) => (v === '' || v == null ? null : Number(v));

const optionsFor = (f) => {
  if (f.source && props.optionSources[f.source]) return props.optionSources[f.source];
  return f.options || [];
};

const booleanOptions = (f) =>
  f.options || [
    { title: f.trueLabel || 'نعم', value: true },
    { title: f.falseLabel || 'لا', value: false },
  ];

const apply = () => {
  emit('update:modelValue', { ...draft.value });
  emit('apply', { ...draft.value });
  open.value = false;
};

const clearAll = () => {
  draft.value = {};
  emit('update:modelValue', {});
  emit('clear');
};
</script>

<style scoped lang="scss">
.st-filters__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 6px;
}
.st-filters__body {
  padding: 12px 14px;
  max-height: 60vh;
  overflow-y: auto;
}
.st-filters__range-label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 4px;
}
.st-filters__range-inputs {
  display: flex;
  gap: 8px;
}
.st-filters__foot {
  display: flex;
  align-items: center;
  padding: 8px 12px;
}
</style>
