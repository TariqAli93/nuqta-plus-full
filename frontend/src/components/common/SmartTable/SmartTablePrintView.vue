<template>
  <teleport to="body">
    <div
      v-if="modelValue"
      class="st-print-root z-100"
      :class="`st-print-root--${localOrientation}`"
      dir="rtl"
    >
      <!-- منطقة التمرير الخاصة بالمعاينة -->
      <div class="st-print-scroll">
        <!-- الورقة الفعلية -->
        <div
          class="st-print-sheet"
          :class="{
            'st-print-sheet--dense': columns.length >= 9,
            'st-print-sheet--very-dense': columns.length >= 13,
          }"
        >
          <header class="st-print-sheet__head">
            <div class="st-print-sheet__org">
              <div v-if="orgName" class="st-print-sheet__org-name">
                {{ orgName }}
              </div>

              <h1 class="st-print-sheet__title">
                {{ title }}
              </h1>
            </div>

            <dl class="st-print-sheet__meta">
              <div>
                <dt>التاريخ:</dt>
                <dd>{{ printedAt }}</dd>
              </div>

              <div v-if="userName">
                <dt>المستخدم:</dt>
                <dd>{{ userName }}</dd>
              </div>

              <div v-if="scopeLabel">
                <dt>النطاق:</dt>
                <dd>{{ scopeLabel }}</dd>
              </div>
            </dl>
          </header>

          <div v-if="filtersText" class="st-print-sheet__filters">
            <strong>الفلاتر:</strong>
            {{ filtersText }}
          </div>

          <div class="st-print-sheet__table-wrapper">
            <table class="st-print-sheet__table">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col.key" :class="alignClass(col)">
                    <span>
                      {{ col.title }}
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="(row, rowIndex) in rows" :key="rowKey(row, rowIndex)">
                  <td v-for="col in columns" :key="col.key" :class="alignClass(col)">
                    <span
                      :dir="col.numeric || col.ltr ? 'ltr' : undefined"
                      :class="{ 'st-ltr-value': col.numeric || col.ltr }"
                    >
                      {{ getCellDisplayValue(row, col) }}
                    </span>
                  </td>
                </tr>

                <tr v-if="rows.length === 0">
                  <td :colspan="Math.max(columns.length, 1)" class="st-print-sheet__empty">
                    لا توجد بيانات للطباعة
                  </td>
                </tr>
              </tbody>

              <tfoot v-if="totals">
                <tr>
                  <td v-for="(col, columnIndex) in columns" :key="col.key" :class="alignClass(col)">
                    <span
                      v-if="totals[col.key] != null"
                      :dir="col.numeric || col.ltr ? 'ltr' : undefined"
                      :class="{ 'st-ltr-value': col.numeric || col.ltr }"
                    >
                      {{ displayValue(totals[col.key]) }}
                    </span>

                    <span v-else-if="columnIndex === 0"> الإجمالي </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="st-print-sheet__count">عدد السجلات: {{ rows.length }}</div>
        </div>
      </div>

      <!-- شريط المعاينة: لا يظهر عند الطباعة -->
      <div class="st-print-bar no-print">
        <span class="text-subtitle-2">معاينة الطباعة</span>

        <v-spacer />

        <v-btn-toggle v-model="localOrientation" variant="elevated" mandatory color="secondary">
          <v-btn value="portrait" size="small" prepend-icon="mdi-crop-portrait"> طولي </v-btn>

          <v-btn value="landscape" size="small" prepend-icon="mdi-crop-landscape"> عرضي </v-btn>
        </v-btn-toggle>

        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-printer"
          class="ms-2"
          @click="doPrint"
        >
          طباعة
        </v-btn>

        <v-btn
          variant="text"
          size="small"
          icon="mdi-close"
          class="ms-1"
          aria-label="إغلاق معاينة الطباعة"
          @click="close"
        />
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatCell } from './formatters.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },

  title: {
    type: String,
    default: 'تقرير',
  },

  orgName: {
    type: String,
    default: '',
  },

  userName: {
    type: String,
    default: '',
  },

  columns: {
    type: Array,
    default: () => [],
  },

  rows: {
    type: Array,
    default: () => [],
  },

  totals: {
    type: Object,
    default: null,
  },

  filtersText: {
    type: String,
    default: '',
  },

  scopeLabel: {
    type: String,
    default: '',
  },

  orientation: {
    type: String,
    default: 'portrait',
    validator: (value) => ['portrait', 'landscape'].includes(value),
  },

  rowKeyField: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:modelValue']);

const normalizeOrientation = (value) => (value === 'landscape' ? 'landscape' : 'portrait');

const localOrientation = ref(normalizeOrientation(props.orientation));

const formatPrintedAt = () =>
  new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(new Date());

const printedAt = ref(formatPrintedAt());

const alignClass = (col) => {
  if (col.numeric) {
    return 'st-num';
  }

  if (col.align === 'center') {
    return 'st-center';
  }

  if (col.align === 'end') {
    return 'st-end';
  }

  return 'st-start';
};

// Used for the totals row, whose values arrive already formatted as strings.
const displayValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return value;
};

const isBlank = (value) => value === null || value === undefined || value === '';

/**
 * Read a value off a row, supporting both a flat key ("debit") and a nested
 * path ("customer.name"). A literal matching key wins over path traversal so a
 * column whose key genuinely contains a dot still resolves.
 */
const readPath = (row, key) => {
  if (row == null || typeof key !== 'string' || key === '') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(row, key)) {
    return row[key];
  }

  if (key.indexOf('.') === -1) {
    return undefined;
  }

  return key
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), row);
};

/**
 * The RAW (unformatted) value for a cell — the same resolution order the live
 * SmartTable uses, with an `exportValue`/`printValue` fallback for columns that
 * only render via a slot (so print still has something to show). Never coerces
 * the value; returning the original lets the formatter decide presentation.
 */
const getCellRawValue = (row, column) => {
  if (!row || !column) {
    return undefined;
  }

  if (typeof column.printValue === 'function') {
    return column.printValue(row);
  }

  if (typeof column.value === 'function') {
    return column.value(row);
  }

  if (typeof column.exportValue === 'function') {
    return column.exportValue(row);
  }

  return readPath(row, column.key);
};

/**
 * Turn a raw value into its printable string using the column's formatter
 * (function or named format like currency/number/date). Empty values render as
 * "—" and are NEVER turned into 0 — only genuine numbers run through the
 * numeric formatter.
 */
const formatPrintableValue = (value, column, row) => {
  if (isBlank(value)) {
    return '—';
  }

  const format = column?.printFormat ?? column?.format;

  if (column && format) {
    const formatted = formatCell({ ...column, format }, value, row);
    if (!isBlank(formatted)) {
      return formatted;
    }
  }

  return value;
};

/**
 * Final display string for a print cell: raw value → formatted display value.
 * This is what the template binds to, so print mirrors the live table instead
 * of doing a raw `row[key]` read (which lost type and rendered money as 0).
 */
const getCellDisplayValue = (row, column) =>
  formatPrintableValue(getCellRawValue(row, column), column, row);

const rowKey = (row, index) => {
  if (
    props.rowKeyField &&
    row?.[props.rowKeyField] !== undefined &&
    row?.[props.rowKeyField] !== null
  ) {
    return row[props.rowKeyField];
  }

  return index;
};

const close = () => {
  emit('update:modelValue', false);
};

const closeWithEsc = (event) => {
  if (event.key === 'Escape') close();
  else return;
};

/*
 * @page لا يمكن ربطه مباشرة بكلاس داخل العنصر،
 * لذلك يتم إنشاء style ديناميكي حسب اتجاه الورقة.
 */
let pageStyleEl = null;

const applyPageStyle = (orientation) => {
  if (typeof document === 'undefined') {
    return;
  }

  const safeOrientation = normalizeOrientation(orientation);

  if (!pageStyleEl) {
    pageStyleEl = document.createElement('style');
    pageStyleEl.setAttribute('data-smarttable-print', '');

    document.head.appendChild(pageStyleEl);
  }

  pageStyleEl.textContent = `
    @media print {
      @page {
        size: A4 ${safeOrientation};
        margin: 12mm;
      }
    }
  `;
};

watch(
  () => props.orientation,
  (value) => {
    localOrientation.value = normalizeOrientation(value);
  }
);

watch(
  localOrientation,
  (value) => {
    applyPageStyle(value);
  },
  {
    immediate: true,
  }
);

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) {
      return;
    }

    printedAt.value = formatPrintedAt();

    applyPageStyle(localOrientation.value);

    await nextTick();
  }
);

const doPrint = async () => {
  printedAt.value = formatPrintedAt();

  applyPageStyle(localOrientation.value);

  await nextTick();

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
};

onMounted(() => {
  window.addEventListener('keydown', closeWithEsc);
});

onBeforeUnmount(() => {
  if (pageStyleEl) {
    pageStyleEl.remove();
    pageStyleEl = null;
  }

  window.removeEventListener('keydown', closeWithEsc);
});
</script>

<style lang="scss">
/*
 * غير scoped عمداً لأن العنصر يُنقل إلى body
 * عن طريق teleport، ولأن قواعد الطباعة يجب أن
 * تصل إلى body و html.
 */

.st-print-root {
  --st-page-width: 210mm;
  --st-page-height: 297mm;
  --st-page-padding: 12mm;

  position: fixed;
  inset: 0;
  z-index: 3000;

  display: flex;
  flex-direction: column;

  width: 100%;
  height: 100dvh;
  min-width: 0;
  min-height: 0;

  background: rgba(var(--v-theme-on-surface), 0.45);

  &--portrait {
    --st-page-width: 210mm;
    --st-page-height: 297mm;
  }

  &--landscape {
    --st-page-width: 297mm;
    --st-page-height: 210mm;
  }
}

.st-print-bar {
  flex: 0 0 auto;

  display: flex;
  align-items: center;
  gap: 6px;

  min-width: 0;
  padding: 8px 14px;

  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.st-print-scroll {
  flex: 1 1 auto;

  display: flex;
  align-items: flex-start;
  justify-content: center;

  width: 100%;
  min-width: 0;
  min-height: 0;

  padding: 24px;
  overflow: auto;

  box-sizing: border-box;
}

.st-print-sheet {
  flex: 0 0 auto;
  align-self: flex-start;

  position: relative;

  width: var(--st-page-width);
  min-width: var(--st-page-width);
  min-height: var(--st-page-height);
  height: auto;

  padding: var(--st-page-padding);

  background: #fff;
  color: #111;

  box-sizing: border-box;
  overflow: hidden;

  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);

  font-size: 12px;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    gap: 16px;

    padding-bottom: 8px;
    margin-bottom: 10px;

    border-bottom: 2px solid #222;
  }

  &__org {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__org-name {
    font-size: 13px;
    font-weight: 700;
    color: #333;

    overflow-wrap: anywhere;
  }

  &__title {
    margin: 2px 0 0;

    font-size: 19px;
    font-weight: 800;
    line-height: 1.4;

    overflow-wrap: anywhere;
  }

  &__meta {
    flex: 0 0 auto;

    margin: 0;

    font-size: 11px;
    color: #333;

    div {
      display: flex;
      justify-content: flex-end;
      gap: 4px;
    }

    dt {
      font-weight: 700;
      white-space: nowrap;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  }

  &__filters {
    margin-bottom: 10px;
    padding: 4px 8px;

    font-size: 11px;
    line-height: 1.5;
    color: #444;

    background: #f3f3f3;
    border: 1px solid #e0e0e0;
    border-radius: 4px;

    overflow-wrap: anywhere;

    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  &__table-wrapper {
    width: 100%;
    min-width: 0;
    max-width: 100%;

    overflow: hidden;
  }

  &__table {
    position: static;

    width: 100%;
    max-width: 100%;
    height: auto;

    table-layout: fixed;
    border-collapse: collapse;
    border-spacing: 0;

    th,
    td {
      min-width: 0;
      max-width: 0;

      padding: 5px 4px;

      border: 1px solid #cfcfcf;

      text-align: start;
      vertical-align: middle;

      white-space: normal;
      overflow: hidden;
      overflow-wrap: anywhere;
      word-break: break-word;

      line-height: 1.4;
    }

    th {
      font-size: 10px;
      font-weight: 700;
    }

    td {
      font-size: 10px;
    }

    th > span,
    td > span {
      display: block;

      width: 100%;
      min-width: 0;
      max-width: 100%;

      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    thead th {
      background: #ececec !important;

      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tbody tr:nth-child(even) td {
      background: #f8f8f8 !important;

      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tfoot td {
      background: #eef3ff !important;
      font-weight: 700;

      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .st-num {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }

    .st-center {
      text-align: center;
    }

    .st-end {
      text-align: end;
    }

    .st-start {
      text-align: start;
    }

    .st-ltr-value {
      direction: ltr;
      unicode-bidi: isolate;
      text-align: inherit;
    }
  }

  &__empty {
    max-width: none !important;

    padding: 24px !important;

    text-align: center !important;
    color: #666;
  }

  &__count {
    margin-top: 10px;

    font-size: 11px;
    color: #555;
    text-align: start;
  }

  /*
   * عندما يكون عدد الأعمدة كبيراً نقلل الأحجام
   * حتى يبقى الجدول داخل الصفحة.
   */
  &--dense {
    .st-print-sheet__table {
      th,
      td {
        padding: 4px 3px;
      }

      th {
        font-size: 9px;
      }

      td {
        font-size: 9px;
      }
    }
  }

  &--very-dense {
    --st-page-padding: 8mm;

    .st-print-sheet__table {
      th,
      td {
        padding: 3px 2px;
      }

      th {
        font-size: 8px;
      }

      td {
        font-size: 8px;
      }
    }
  }
}

@media print {
  html,
  body {
    width: auto !important;
    height: auto !important;

    margin: 0 !important;
    padding: 0 !important;

    overflow: visible !important;

    background: #fff !important;
  }

  body > *:not(.st-print-root) {
    display: none !important;
  }

  .st-print-root {
    position: static !important;
    inset: auto !important;

    display: block !important;

    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;

    overflow: visible !important;

    background: #fff !important;
    z-index: auto !important;
  }

  .no-print {
    display: none !important;
  }

  .st-print-scroll {
    display: block !important;

    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;

    margin: 0 !important;
    padding: 0 !important;

    overflow: visible !important;
  }

  .st-print-sheet {
    display: block !important;

    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: auto !important;

    margin: 0 !important;
    padding: 0 !important;

    overflow: visible !important;

    box-shadow: none !important;
  }

  .st-print-sheet__head,
  .st-print-sheet__filters,
  .st-print-sheet__count {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .st-print-sheet__table-wrapper {
    width: 100% !important;
    max-width: 100% !important;

    overflow: visible !important;
  }

  .st-print-sheet__table {
    width: 100% !important;
    max-width: 100% !important;

    table-layout: fixed !important;
  }

  /*
   * تكرار رأس الجدول في كل صفحة مطبوعة.
   */
  .st-print-sheet__table thead {
    display: table-header-group;
  }

  /*
   * الإجمالي يظهر في نهاية البيانات فقط،
   * وليس في أسفل كل صفحة.
   */
  .st-print-sheet__table tfoot {
    display: table-row-group;
  }

  .st-print-sheet__table tr,
  .st-print-sheet__table th,
  .st-print-sheet__table td {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
</style>
