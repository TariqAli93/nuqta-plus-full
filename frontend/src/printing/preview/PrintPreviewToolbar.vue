<!--
  PrintPreviewToolbar — the control strip above the live preview. Purely
  presentational: it renders the current settings and emits changes/actions; the
  parent (PrintPreviewWindow) owns the state and talks to Electron. Marked
  `.no-print` so it never appears on paper.
-->
<template>
  <div class="preview-toolbar no-print">
    <div class="toolbar-group">
      <v-select
        :model-value="paper"
        :items="paperOptions"
        item-title="label"
        item-value="value"
        label="حجم الورق"
        density="compact"
        variant="outlined"
        hide-details
        class="ctrl ctrl--md"
        @update:model-value="$emit('update:paper', $event)"
      />
      <v-select
        :model-value="theme"
        :items="themeOptions"
        item-title="label"
        item-value="value"
        label="الثيم"
        density="compact"
        variant="outlined"
        hide-details
        class="ctrl ctrl--md"
        @update:model-value="$emit('update:theme', $event)"
      />
      <v-select
        :model-value="printerName"
        :items="printerItems"
        item-title="label"
        item-value="value"
        label="الطابعة"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="ctrl ctrl--lg"
        :loading="loadingPrinters"
        no-data-text="لا توجد طابعات"
        @update:model-value="$emit('update:printerName', $event)"
      />
      <v-text-field
        :model-value="copies"
        type="number"
        min="1"
        label="النسخ"
        density="compact"
        variant="outlined"
        hide-details
        class="ctrl ctrl--sm"
        @update:model-value="$emit('update:copies', Math.max(1, Number($event) || 1))"
      />
      <v-checkbox
        :model-value="silent"
        label="طباعة صامتة"
        density="compact"
        hide-details
        class="ctrl-check"
        @update:model-value="$emit('update:silent', !!$event)"
      />
    </div>

    <div class="toolbar-group toolbar-actions">
      <v-btn color="primary" prepend-icon="mdi-printer" :loading="printing" @click="$emit('print')">
        طباعة
      </v-btn>
      <v-btn
        variant="tonal"
        prepend-icon="mdi-file-pdf-box"
        :loading="exporting"
        @click="$emit('export-pdf')"
      >
        حفظ PDF
      </v-btn>
      <v-btn variant="text" icon="mdi-close" title="إغلاق" @click="$emit('close')" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  paper: { type: String, default: 'roll-80' },
  theme: { type: String, default: 'classic' },
  printerName: { type: [String, null], default: null },
  copies: { type: Number, default: 1 },
  silent: { type: Boolean, default: false },
  paperOptions: { type: Array, default: () => [] },
  themeOptions: { type: Array, default: () => [] },
  printers: { type: Array, default: () => [] },
  loadingPrinters: { type: Boolean, default: false },
  printing: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false },
});

defineEmits([
  'update:paper',
  'update:theme',
  'update:printerName',
  'update:copies',
  'update:silent',
  'print',
  'export-pdf',
  'open-render-debug',
  'close',
]);

// Show the dev-only "فحص Render" button only when running against the Vite dev
// server (never in a packaged build).
const isDev = import.meta.env.DEV;

const printerItems = computed(() =>
  props.printers.map((p) => ({
    value: p.name,
    label: p.isDefault ? `${p.displayName} (افتراضية)` : p.displayName,
  }))
);
</script>

<style scoped>
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  position: sticky;
  top: 0;
  z-index: 10;
}
.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.toolbar-actions {
  margin-inline-start: auto;
}
.ctrl--sm {
  width: 90px;
}
.ctrl--md {
  width: 160px;
}
.ctrl--lg {
  width: 240px;
}
.ctrl-check {
  margin: 0;
}
</style>
