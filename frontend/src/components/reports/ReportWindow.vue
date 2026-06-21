<template>
  <!-- ── Forbidden ──────────────────────────────────────────────────────────── -->
  <v-container
    v-if="!allowed"
    class="d-flex flex-column align-center justify-center text-center ga-3"
    style="min-height: 100dvh"
  >
    <v-icon icon="mdi-lock-alert" size="56" color="error" />
    <div class="text-h6">غير مصرّح</div>
    <div class="text-medium-emphasis">ليس لديك صلاحية الاطلاع على هذا التقرير.</div>
    <v-btn color="primary" variant="tonal" prepend-icon="mdi-close" @click="closeWindow"
      >إغلاق</v-btn
    >
  </v-container>

  <div v-else dir="rtl" class="report-window d-flex flex-column">
    <!-- ── 1) Header ───────────────────────────────────────────────────────── -->
    <v-toolbar height="68" class="d-print-none flex-grow-0 px-3 bg-surface">
      <v-avatar :color="accentColor" variant="tonal" rounded="lg" size="44" class="ms-1">
        <v-icon :icon="cfg.icon" size="26" />
      </v-avatar>
      <div class="d-flex flex-column mx-3">
        <span class="text-h6 font-weight-bold">{{ cfg.title }}</span>
        <span class="text-caption text-medium-emphasis">{{ cfg.question }}</span>
      </div>
      <v-spacer />
      <div class="d-flex flex-wrap ga-2 align-center">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="reload"
        >
          تحديث
        </v-btn>
        <v-divider vertical class="mx-1" />
        <v-btn variant="text" icon @click="printReport">
          <v-icon>mdi-printer</v-icon>
          <v-tooltip activator="parent" location="bottom" text="طباعة" />
        </v-btn>
        <v-btn variant="text" icon color="success" @click="exportExcel">
          <v-icon>mdi-file-excel</v-icon>
          <v-tooltip activator="parent" location="bottom" text="تصدير Excel" />
        </v-btn>
        <v-btn variant="text" icon color="error" @click="exportPdf">
          <v-icon>mdi-file-pdf-box</v-icon>
          <v-tooltip activator="parent" location="bottom" text="تصدير PDF" />
        </v-btn>
        <v-divider vertical class="mx-1" />
        <v-btn color="error" variant="tonal" prepend-icon="mdi-close" @click="closeWindow"
          >إغلاق</v-btn
        >
      </div>
    </v-toolbar>

    <!-- ── 2) Filters card ─────────────────────────────────────────────────── -->
    <v-card class="d-print-none ma-4 mb-0">
      <v-card-text class="d-flex flex-wrap align-center ga-3 py-3">
        <v-icon icon="mdi-filter-variant" color="medium-emphasis" />

        <v-btn-toggle v-if="cfg.filters.includes('date')" v-model="range">
          <v-btn value="today" size="small">اليوم</v-btn>
          <v-btn value="yesterday" size="small">أمس</v-btn>
          <v-btn value="week" size="small">هذا الأسبوع</v-btn>
          <v-btn value="month" size="small">هذا الشهر</v-btn>
          <v-btn value="all" size="small">الكل</v-btn>
          <v-btn value="custom" size="small">مخصص</v-btn>
        </v-btn-toggle>

        <template v-if="cfg.filters.includes('date') && range === 'custom'">
          <v-text-field
            v-model="from"
            type="date"
            label="من"
            density="compact"
            variant="outlined"
            hide-details
            max-width="170"
          />
          <v-text-field
            v-model="to"
            type="date"
            label="إلى"
            density="compact"
            variant="outlined"
            hide-details
            max-width="170"
          />
        </template>

        <v-select
          v-if="cfg.filters.includes('partyType')"
          v-model="partyType"
          :items="PARTY_TYPE_OPTIONS"
          label="نوع الطرف"
          density="compact"
          variant="outlined"
          hide-details
          max-width="170"
        />
        <v-select
          v-if="cfg.filters.includes('direction')"
          v-model="direction"
          :items="DEBT_DIRECTION_OPTIONS"
          label="اتجاه الدين"
          density="compact"
          variant="outlined"
          hide-details
          max-width="160"
        />
        <v-select
          v-if="cfg.filters.includes('debtStatus')"
          v-model="debtStatus"
          :items="DEBT_STATUS_OPTIONS"
          label="الحالة"
          density="compact"
          variant="outlined"
          hide-details
          max-width="160"
        />
        <v-select
          v-if="cfg.filters.includes('movementType')"
          v-model="movementType"
          :items="MOVEMENT_TYPE_OPTIONS"
          label="نوع الحركة"
          density="compact"
          variant="outlined"
          hide-details
          max-width="180"
        />
        <v-select
          v-if="cfg.filters.includes('branch') && branchOptions.length"
          v-model="branchId"
          :items="branchOptions"
          label="الفرع"
          clearable
          density="compact"
          variant="outlined"
          hide-details
          max-width="200"
        />
        <v-text-field
          v-if="cfg.filters.includes('search')"
          v-model="search"
          :placeholder="cfg.searchPlaceholder || 'بحث'"
          prepend-inner-icon="mdi-magnify"
          clearable
          density="compact"
          variant="outlined"
          hide-details
          max-width="280"
          @keyup.enter="applyFilters"
        />

        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-filter-check"
          :loading="loading"
          @click="applyFilters"
        >
          تطبيق الفلاتر
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-restore" @click="resetFilters">إعادة تعيين</v-btn>
      </v-card-text>
    </v-card>

    <!-- ── 3) Summary big-number cards ─────────────────────────────────────── -->
    <v-row v-if="cfg.summary.length" class="px-4 pt-4 mb-4">
      <v-col v-for="card in cfg.summary" :key="card.key" cols="12" sm="6" md="6" lg="6">
        <v-card>
          <v-card-text class="d-flex align-center ga-3">
            <v-avatar :color="summaryColor(card)" variant="tonal" rounded="lg" size="44">
              <v-icon :icon="summaryIcon(card)" />
            </v-avatar>
            <div class="d-flex flex-column" style="min-width: 0">
              <span class="text-caption text-medium-emphasis">{{ card.label }}</span>
              <span
                class="font-weight-bold text-truncate report-num"
                :class="card.format === 'netDebt' ? `text-${summaryColor(card)}` : ''"
              >
                {{ fmt(summary[card.key], card.format) }}
                <span v-if="card.format === 'netDebt'" class="text-caption font-weight-medium">
                  {{ Number(summary.netDebt || 0) >= 0 ? 'لنا' : 'علينا' }}
                </span>
              </span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── 4) Results section ──────────────────────────────────────────────── -->
    <v-card rounded="lg" class="d-flex flex-column flex-grow-1 mx-4 my-2">
      <v-card-title class="d-flex align-center ga-2 py-2">
        <v-icon icon="mdi-table" :color="accentColor" size="20" />
        <span class="text-subtitle-1 font-weight-bold">النتائج</span>
        <v-chip size="small" variant="tonal" :color="accentColor">{{ meta.total }}</v-chip>

        <!-- Expense category breakdown chips -->
        <template v-if="breakdown.length">
          <v-divider vertical class="mx-2" />
          <v-chip-group class="flex-grow-1" column>
            <v-chip
              v-for="b in breakdown"
              :key="b.category"
              size="small"
              variant="tonal"
              color="info"
            >
              {{ b.category }}: {{ fmt(b.amount, 'money') }}
            </v-chip>
          </v-chip-group>
        </template>
      </v-card-title>
      <v-divider />

      <!-- Error state -->
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="comfortable"
        class="ma-3"
        :text="error"
      >
        <template #append>
          <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="reload">
            إعادة المحاولة
          </v-btn>
        </template>
      </v-alert>

      <v-data-table-server
        :headers="headers"
        :items="rows"
        :items-length="meta.total"
        :loading="loading"
        :page="meta.page"
        :items-per-page="limit"
        :items-per-page-options="perPageOptions"
        items-per-page-text="لكل صفحة:"
        density="comfortable"
        class="flex-grow-1"
        @update:page="goPage"
        @update:items-per-page="onLimit"
      >
        <template v-for="col in cfg.columns" :key="col.key" #[`item.${col.key}`]="{ item }">
          <v-chip
            v-if="col.format === 'direction'"
            size="small"
            variant="tonal"
            :color="item[col.key] === 'payable' ? 'warning' : 'success'"
          >
            {{ DEBT_DIRECTION_LABELS[item[col.key]] || item[col.key] }}
          </v-chip>
          <v-chip
            v-else-if="col.format === 'debtStatus'"
            size="small"
            variant="tonal"
            :color="DEBT_STATUS_COLORS[item[col.key]] || 'default'"
          >
            {{ DEBT_STATUS_LABELS[item[col.key]] || item[col.key] }}
          </v-chip>
          <span v-else-if="col.format === 'partyType'">
            {{ PARTY_TYPE_LABELS[item[col.key]] || item[col.key] }}
          </span>
          <span v-else :class="col.align === 'end' ? 'report-num' : ''">{{
            fmt(item[col.key], col.format)
          }}</span>
        </template>

        <!-- Loading state (skeleton) -->
        <template #loading>
          <v-skeleton-loader type="table-row@8" />
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="d-flex flex-column align-center ga-2 py-10 text-medium-emphasis">
            <v-icon icon="mdi-database-off-outline" size="44" />
            <span>لا توجد بيانات للفترة المحددة.</span>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-restore" @click="resetFilters">
              إعادة تعيين الفلاتر
            </v-btn>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- ── 5) Footer ───────────────────────────────────────────────────────── -->
    <v-sheet
      class="d-print-none d-flex align-center ga-2 px-4 py-2 border-t text-caption text-medium-emphasis"
    >
      <v-icon icon="mdi-clock-outline" size="16" />
      <span>آخر تحديث: {{ lastUpdatedLabel }}</span>
      <v-spacer />
      <v-icon icon="mdi-format-list-numbered" size="16" />
      <span>عدد السجلات: {{ meta.total }}</span>
    </v-sheet>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/plugins/axios';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { formatCurrency } from '@/utils/formatters';
import {
  REPORT_CONFIGS,
  MOVEMENT_TYPE_OPTIONS,
  PARTY_TYPE_OPTIONS,
  DEBT_DIRECTION_OPTIONS,
  DEBT_STATUS_OPTIONS,
  PARTY_TYPE_LABELS,
  DEBT_DIRECTION_LABELS,
  DEBT_STATUS_LABELS,
  DEBT_STATUS_COLORS,
} from '@/views/reports/reportConfigs.js';

const props = defineProps({ type: { type: String, required: true } });

const route = useRoute();
const authStore = useAuthStore();
const inventoryStore = useInventoryStore();

const cfg = computed(() => REPORT_CONFIGS[props.type]);
const allowed = computed(() => authStore.hasPermission(cfg.value.permission));

// ── Filters state ───────────────────────────────────────────────────────────
const range = ref(route.query.range || cfg.value.defaultRange || 'today');
const from = ref(route.query.from || '');
const to = ref(route.query.to || '');
const search = ref(route.query.search || '');
const partyType = ref(route.query.partyType || cfg.value.defaultPartyType || 'all');
const direction = ref(route.query.direction || cfg.value.defaultDirection || 'all');
const debtStatus = ref(route.query.status || cfg.value.defaultDebtStatus || 'all');
const movementType = ref(route.query.type || 'all');
const branchId = ref(route.query.branchId ? Number(route.query.branchId) : null);
const limit = ref(Number(route.query.limit) || 50);

// Start in the loading state so a freshly-opened report window paints its
// table skeleton immediately (the window opens before any data is fetched);
// `fetchData` flips it off in its finally block.
const loading = ref(true);
const error = ref(null);
const lastUpdated = ref(null);
const rows = ref([]);
const summary = reactive({});
const breakdown = ref([]);
const meta = reactive({ page: 1, limit: 50, total: 0 });

// Map each report/card accent (hex from reportConfigs) to a Vuetify semantic
// color so the UI stays on-theme (light/dark) instead of using raw colors.
const SEMANTIC_BY_HEX = {
  '#2563eb': 'primary',
  '#0078d4': 'primary',
  '#16a34a': 'success',
  '#dc2626': 'error',
  '#d97706': 'warning',
  '#0891b2': 'info',
  '#0ea5e9': 'info',
  '#0d9488': 'info',
  '#6366f1': 'info',
  '#9333ea': 'secondary',
  '#7c3aed': 'secondary',
};
const sem = (hex) => SEMANTIC_BY_HEX[String(hex || '').toLowerCase()] || 'primary';
const accentColor = computed(() => sem(cfg.value.accent));

// The "صافي الديون" card is colored by which side wins: positive = لنا (success),
// negative = علينا (error); other cards use their configured accent.
function summaryColor(card) {
  if (card.format === 'netDebt') return Number(summary.netDebt || 0) >= 0 ? 'success' : 'error';
  return sem(card.accent);
}
function summaryIcon(card) {
  if (card.format === 'netDebt')
    return Number(summary.netDebt || 0) >= 0 ? 'mdi-trending-up' : 'mdi-trending-down';
  return cfg.value.icon;
}
const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? lastUpdated.value.toLocaleTimeString('en-GB', { hour12: false }) : '—'
);

// v-data-table-server config derived from the report's column definitions.
const headers = computed(() =>
  cfg.value.columns.map((c) => ({
    title: c.label,
    key: c.key,
    align: c.align === 'end' ? 'end' : 'start',
    sortable: false,
  }))
);
const perPageOptions = [25, 50, 100, 200].map((n) => ({ value: n, title: String(n) }));

// Branch options — only meaningful when multi-branch is on and the user can switch.
const branchOptions = computed(() => {
  if (!authStore.branchFeatureEnabled || !authStore.canSwitchBranch) return [];
  return (inventoryStore.branches || []).map((b) => ({ value: b.id, title: b.name }));
});

function todayStr(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
}
function computeRange() {
  const now = new Date();
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range.value === 'today') return { from: todayStr(d0), to: todayStr(d0) };
  if (range.value === 'yesterday') {
    const y = new Date(d0);
    y.setDate(y.getDate() - 1);
    return { from: todayStr(y), to: todayStr(y) };
  }
  if (range.value === 'week') {
    const w = new Date(d0);
    w.setDate(w.getDate() - ((w.getDay() + 1) % 7)); // Saturday start
    return { from: todayStr(w), to: todayStr(d0) };
  }
  if (range.value === 'month') {
    return { from: todayStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayStr(d0) };
  }
  if (range.value === 'custom') return { from: from.value || null, to: to.value || null };
  return { from: null, to: null }; // all
}

function buildParams() {
  const p = { page: meta.page, limit: limit.value };
  if (cfg.value.filters.includes('date')) {
    const r = computeRange();
    if (r.from) p.from = r.from;
    if (r.to) p.to = r.to;
  }
  if (cfg.value.filters.includes('search') && search.value) p.search = search.value;
  if (cfg.value.filters.includes('partyType')) p.partyType = partyType.value;
  if (cfg.value.filters.includes('direction')) p.direction = direction.value;
  if (cfg.value.filters.includes('debtStatus')) p.status = debtStatus.value;
  if (cfg.value.filters.includes('movementType')) p.type = movementType.value;
  if (cfg.value.filters.includes('branch') && branchId.value) p.branchId = branchId.value;
  return p;
}

async function fetchData() {
  if (!allowed.value) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await api.get(`/reports/quick/${props.type}`, { params: buildParams() });
    const data = res.data || res || {};
    rows.value = data.rows || [];
    Object.assign(summary, data.summary || {});
    breakdown.value = (cfg.value.breakdownKey && data.summary?.[cfg.value.breakdownKey]) || [];
    Object.assign(meta, data.meta || { page: 1, limit: limit.value, total: 0 });
    lastUpdated.value = new Date();
  } catch (e) {
    rows.value = [];
    // The axios interceptor rejects with the backend body (or a string).
    error.value = (e && (e.message || e.error)) || 'تعذّر تحميل التقرير. حاول مرة أخرى.';
  } finally {
    loading.value = false;
  }
}

function reload() {
  meta.page = 1;
  fetchData();
}
function applyFilters() {
  reload();
}
function resetFilters() {
  // Restore every filter to its default; the watchers below refetch once.
  range.value = cfg.value.defaultRange || 'today';
  from.value = '';
  to.value = '';
  search.value = '';
  partyType.value = cfg.value.defaultPartyType || 'all';
  direction.value = cfg.value.defaultDirection || 'all';
  debtStatus.value = cfg.value.defaultDebtStatus || 'all';
  movementType.value = 'all';
  branchId.value = null;
  reload();
}
function goPage(p) {
  meta.page = p;
  fetchData();
}
function onLimit(n) {
  // The watcher on `limit` resets to page 1 and refetches.
  limit.value = n;
}

// Re-fetch (reset to page 1) when any filter changes.
watch(
  [range, from, to, partyType, direction, debtStatus, movementType, branchId, limit],
  reload
);

let searchTimer = null;
watch(search, () => {
  if (!cfg.value.filters.includes('search')) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reload, 350);
});

// Electron: when the user re-clicks the same dashboard card, the window is
// focused (not duplicated) and the new filters arrive here.
let unsubParams = null;
onMounted(async () => {
  document.title = cfg.value.title;
  try {
    await inventoryStore.initialize?.({ force: false });
  } catch {
    /* non-fatal */
  }
  await fetchData();
  if (window.electronAPI?.onReportParams) {
    unsubParams = window.electronAPI.onReportParams((p) => {
      if (p.range) range.value = p.range;
      if (p.from) {
        range.value = 'custom';
        from.value = p.from;
      }
      if (p.to) to.value = p.to;
      if (p.branchId) branchId.value = Number(p.branchId);
      // Movement-type deep-link (e.g. dashboard «المقبوضات» → type=receipt).
      if (p.type && cfg.value.filters.includes('movementType')) movementType.value = p.type;
      reload();
    });
  }
});
onBeforeUnmount(() => {
  if (unsubParams) unsubParams();
});

// ── Formatting ───────────────────────────────────────────────────────────────
const PAY = { cash: 'نقدي', credit: 'آجل', installment: 'أقساط', mixed: 'مختلط' };
const STAT = {
  completed: 'مكتملة',
  pending: 'معلّقة',
  cancelled: 'ملغاة',
  draft: 'مسودة',
  returned: 'مرتجعة',
  partially_returned: 'مرتجعة جزئياً',
};
function fmt(v, type) {
  // netDebt shows its magnitude — the لنا/علينا direction is rendered beside it.
  if (type === 'netDebt') return formatCurrency(Math.abs(Number(v || 0)), 'IQD');
  if (v === null || v === undefined || v === '')
    return type === 'money' || type === 'int' ? fmtZero(type) : '—';
  if (type === 'money') return formatCurrency(Number(v), 'IQD');
  if (type === 'int') return Number(v).toLocaleString('en-US');
  if (type === 'date') return new Date(v).toLocaleDateString('en-GB');
  if (type === 'datetime') return new Date(v).toLocaleString('en-GB', { hour12: false });
  if (type === 'paymentType') return PAY[v] || v;
  if (type === 'status') return STAT[v] || v;
  if (type === 'partyType') return PARTY_TYPE_LABELS[v] || v;
  if (type === 'direction') return DEBT_DIRECTION_LABELS[v] || v;
  if (type === 'debtStatus') return DEBT_STATUS_LABELS[v] || v;
  return v;
}
function fmtZero(type) {
  return type === 'money' ? formatCurrency(0, 'IQD') : '0';
}

// ── Toolbar actions ──────────────────────────────────────────────────────────
function closeWindow() {
  // Works for an Electron BrowserWindow and a browser popup; falls back to history.
  window.close();
  setTimeout(() => {
    if (!window.closed) window.history.back();
  }, 150);
}
function printReport() {
  window.print();
}
function exportPdf() {
  window.print();
} // print dialog → "Save as PDF"

function exportExcel() {
  const head = cfg.value.columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows.value
    .map(
      (r) =>
        '<tr>' +
        cfg.value.columns
          .map((c) => `<td>${escapeHtml(excelCell(r[c.key], c.format))}</td>`)
          .join('') +
        '</tr>'
    )
    .join('');
  const html =
    `<html dir="rtl"><head><meta charset="utf-8"></head><body>` +
    `<h3>${cfg.value.title}</h3><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.value.title}-${todayStr()}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function excelCell(v, type) {
  if (v === null || v === undefined) return '';
  if (type === 'netDebt') return Math.abs(Number(v || 0));
  if (type === 'money' || type === 'int') return Number(v);
  if (type === 'date') return new Date(v).toLocaleDateString('en-GB');
  if (type === 'datetime') return new Date(v).toLocaleString('en-GB', { hour12: false });
  if (type === 'paymentType') return PAY[v] || v;
  if (type === 'status') return STAT[v] || v;
  if (type === 'partyType') return PARTY_TYPE_LABELS[v] || v;
  if (type === 'direction') return DEBT_DIRECTION_LABELS[v] || v;
  if (type === 'debtStatus') return DEBT_STATUS_LABELS[v] || v;
  return v;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}
</script>

<style scoped>
/* Tabular figures so money/quantity columns align — not expressible via a
   Vuetify utility class. Everything else uses Vuetify components/utilities. */
.report-num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
</style>
