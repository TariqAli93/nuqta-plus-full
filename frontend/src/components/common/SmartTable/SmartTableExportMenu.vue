<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="6" min-width="260">
    <template #activator="{ props: act }">
      <v-btn v-bind="act" size="small" variant="text" prepend-icon="mdi-download-outline" class="st-tool-btn">
        تصدير
      </v-btn>
    </template>

    <v-card min-width="260" max-width="300">
      <div class="st-export__head text-subtitle-2">تصدير البيانات</div>
      <v-divider />

      <div class="st-export__section">
        <div class="st-export__label">النطاق</div>
        <v-radio-group v-model="scope" hide-details density="compact" class="mt-0">
          <v-radio label="جميع النتائج" value="all" />
          <v-radio label="الصفحة الحالية" value="page" />
          <v-radio :label="`الصفوف المحددة (${selectedCount})`" value="selected" :disabled="selectedCount === 0" />
        </v-radio-group>
      </div>

      <v-divider />
      <div class="st-export__section">
        <v-switch
          v-model="visibleOnly"
          label="الأعمدة الظاهرة فقط"
          hide-details
          density="compact"
          color="primary"
          class="mt-0"
        />
      </div>

      <v-divider />
      <v-list density="compact" class="py-1">
        <v-list-item prepend-icon="mdi-file-excel-outline" title="Excel (.xlsx)" @click="emitExport('excel')" />
        <v-list-item prepend-icon="mdi-file-delimited-outline" title="CSV (.csv)" @click="emitExport('csv')" />
        <v-list-item prepend-icon="mdi-file-pdf-box" title="PDF (.pdf)" @click="emitExport('pdf')" />
        <v-list-item prepend-icon="mdi-content-copy" title="نسخ إلى الحافظة" @click="emitExport('clipboard')" />
      </v-list>

      <template v-if="busy">
        <v-divider />
        <div class="st-export__busy">
          <v-progress-circular indeterminate size="18" width="2" color="primary" />
          <span class="text-caption">جارٍ تجهيز التصدير…</span>
        </div>
      </template>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref } from 'vue';

/**
 * SmartTableExportMenu (req #9) — choose format (Excel / CSV / PDF / clipboard),
 * scope (all results / current page / selected rows) and whether to limit to
 * the visible columns. Emits the request; <SmartTable> gathers the rows (incl.
 * fetching ALL results from the server when needed) and performs the export so
 * the menu stays presentational. Shows a busy state for large exports.
 */
defineProps({
  selectedCount: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['export']);

const open = ref(false);
const scope = ref('all');
const visibleOnly = ref(true);

const emitExport = (format) => {
  emit('export', { format, scope: scope.value, visibleOnly: visibleOnly.value });
};
</script>

<style scoped lang="scss">
.st-export__head {
  padding: 10px 14px 6px;
}
.st-export__section {
  padding: 8px 14px;
}
.st-export__label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 2px;
}
.st-export__busy {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
}
</style>
