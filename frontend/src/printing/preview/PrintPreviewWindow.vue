<!--
  PrintPreviewWindow — the interactive preview at /print/preview/:jobId.

  Toolbar (paper / theme / printer / copies / silent / print / PDF / close) over a
  LIVE preview that re-renders instantly on any change. Print and PDF act via
  window.electronAPI.print and run on the SEPARATE hidden render route
  (/print/render/:jobId) — so preview, print and PDF all use the SAME ReceiptPrint
  component, pixel for pixel, with no toolbar leaking into the output.
-->
<template>
  <div class="print-preview-root">
    <PrintPreviewToolbar
      v-if="job"
      v-model:paper="settings.paper"
      v-model:theme="settings.theme"
      v-model:printer-name="settings.printerName"
      v-model:copies="settings.copies"
      v-model:silent="settings.silent"
      :paper-options="paperOptions"
      :theme-options="themeOptions"
      :printers="printers"
      :loading-printers="loadingPrinters"
      :printing="printing"
      :exporting="exporting"
      @print="doPrint"
      @export-pdf="doExportPdf"
      @open-render-debug="openRenderDebug"
      @close="closeWindow"
    />

    <div class="preview-stage">
      <div v-if="error" class="preview-error">
        <v-icon size="48" color="error">mdi-alert-circle-outline</v-icon>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="job" class="print-page">
        <ReceiptPrint :data="job.data" :paper="settings.paper" :theme="settings.theme" />
      </div>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000" location="bottom">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ReceiptPrint from '../templates/receipt/ReceiptPrint.vue';
import PrintPreviewToolbar from './PrintPreviewToolbar.vue';
import { PAPER_OPTIONS, DEFAULT_PAPER } from '../paper/paperPresets.js';
import { THEME_OPTIONS, DEFAULT_THEME } from '../templates/receipt/receipt.themes.js';

const route = useRoute();
const jobId = computed(() => route.params.jobId);

const paperOptions = PAPER_OPTIONS;
const themeOptions = THEME_OPTIONS;

const job = ref(null);
const error = ref('');
const printers = ref([]);
const loadingPrinters = ref(false);
const printing = ref(false);
const exporting = ref(false);

const settings = reactive({
  paper: DEFAULT_PAPER,
  theme: DEFAULT_THEME,
  printerName: null,
  copies: 1,
  silent: false,
});

const snackbar = reactive({ show: false, color: 'error', text: '' });
function notify(text, color = 'error') {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

const printApi = () => window.electronAPI?.print;

async function loadJob() {
  if (!printApi()) {
    error.value = 'الطباعة متاحة فقط داخل تطبيق سطح المكتب';
    return;
  }
  const res = await printApi().getJob(jobId.value);
  if (!res?.success || !res.job) {
    error.value = res?.error || 'تعذر العثور على بيانات الفاتورة';
    return;
  }
  job.value = res.job;
  Object.assign(settings, {
    paper: res.job.settings.paper || DEFAULT_PAPER,
    theme: res.job.settings.theme || DEFAULT_THEME,
    printerName: res.job.settings.printerName || null,
    copies: res.job.settings.copies || 1,
    silent: !!res.job.settings.silent,
  });
}

async function loadPrinters() {
  loadingPrinters.value = true;
  try {
    printers.value = (await printApi().getPrinters()) || [];
    if (settings.printerName && !printers.value.some((p) => p.name === settings.printerName)) {
      notify('الطابعة المحددة غير متوفرة — سيتم استخدام الطابعة الافتراضية', 'warning');
    }
  } finally {
    loadingPrinters.value = false;
  }
}

function currentSettings() {
  return {
    paper: settings.paper,
    theme: settings.theme,
    printerName: settings.printerName || null,
    copies: Number(settings.copies) || 1,
    silent: !!settings.silent,
  };
}

async function doPrint() {
  if (printing.value) return;
  printing.value = true;
  try {
    const res = await printApi().printInvoice({ jobId: jobId.value, settings: currentSettings() });
    if (res?.success) notify('تم إرسال الفاتورة للطباعة', 'success');
    else if (!res?.canceled) notify(res?.error || 'فشل تنفيذ أمر الطباعة');
  } catch (e) {
    notify('فشل تنفيذ أمر الطباعة: ' + (e.message || ''));
  } finally {
    printing.value = false;
  }
}

async function doExportPdf() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const res = await printApi().exportInvoicePdf({
      jobId: jobId.value,
      settings: currentSettings(),
    });
    if (res?.success) notify('تم حفظ ملف PDF بنجاح', 'success');
    else if (!res?.canceled) notify(res?.error || 'فشل إنشاء ملف PDF');
  } catch (e) {
    notify('فشل إنشاء ملف PDF: ' + (e.message || ''));
  } finally {
    exporting.value = false;
  }
}

function closeWindow() {
  window.close();
}

// Dev only: open the toolbar-free /print/render/:jobId in a visible window so the
// exact print surface can be inspected without a build or a PDF.
async function openRenderDebug() {
  try {
    const res = await printApi().openRenderDebug({ jobId: jobId.value });
    if (!res?.success) notify(res?.error || 'فشل فتح نافذة فحص الطباعة');
  } catch (e) {
    notify('فشل فتح نافذة فحص الطباعة: ' + (e.message || ''));
  }
}

onMounted(async () => {
  document.documentElement.classList.add('print-host');
  document.body.classList.add('print-host');
  document.title = 'معاينة الطباعة';
  await loadJob();
  if (job.value) loadPrinters();
});
</script>

<style scoped>
.print-preview-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #3a3a3a;
}
.preview-stage {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px 16px;
}
.preview-stage .print-page {
  background: transparent;
}
.preview-stage :deep(.receipt-paper) {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}
.preview-error {
  color: #fff;
  text-align: center;
  margin-top: 18vh;
}
.preview-error p {
  margin-top: 12px;
  font-size: 16px;
}
</style>
