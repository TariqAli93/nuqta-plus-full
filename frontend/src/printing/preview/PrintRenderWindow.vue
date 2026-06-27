<!--
  PrintRenderWindow — the PRINT/PDF surface, mounted at /print/render/:jobId?rt=token.

  Toolbar-free: just <ReceiptPrint/> inside a clean print host. The hidden print/PDF
  windows load THIS route, so the printer/PDF sees exactly the receipt.

  Flow (no random timeouts):
    getJob → render → wait for REAL content ([data-print-paper] has text + invoice
    marker) → fonts → images → notifyReady(token). Main also re-verifies the DOM
    before printing, so a blank page can never silently become a blank PDF.

  Polling uses setTimeout (not requestAnimationFrame) so it keeps ticking even
  while the window is hidden/occluded.
-->
<template>
  <main class="print-render-page print-page" data-print-page="true">
    <div v-if="loading" class="render-status">جارٍ تحميل بيانات الطباعة…</div>

    <div v-else-if="error" class="render-error">
      <p class="render-error__title">تعذر تحميل بيانات الطباعة</p>
      <p class="render-error__detail">{{ error }}</p>
    </div>

    <ReceiptPrint
      v-else-if="job"
      :data="job.data"
      :paper="job.settings.paper"
      :theme="job.settings.theme"
    />
  </main>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import ReceiptPrint from '../templates/receipt/ReceiptPrint.vue';

const route = useRoute();
const jobId = computed(() => route.params.jobId);
const renderToken = computed(() => route.query.rt || '');

const loading = ref(true);
const error = ref('');
const job = ref(null);

const printApi = () => window.electronAPI?.print;

onMounted(async () => {
  document.documentElement.classList.add('print-host');
  document.body.classList.add('print-host');
  document.title = 'طباعة الفاتورة';
  console.info('[PrintRender] mounted', { jobId: jobId.value, token: renderToken.value });

  try {
    if (!printApi()?.getJob) {
      throw new Error('Print API is not available in render window');
    }

    const result = await printApi().getJob(jobId.value);
    console.info('[PrintRender] job loaded', { hasData: !!result?.job?.data });
    if (!result?.success || !result.job) {
      throw new Error(result?.error || 'Print job not found');
    }

    job.value = result.job;
    loading.value = false;

    await nextTick();
    await waitForRealPrintContent();
    await waitForFonts();
    await waitForImages();

    console.info('[PrintRender] ready', { jobId: jobId.value });
    await printApi().notifyReady(renderToken.value || jobId.value);
  } catch (err) {
    console.error('[PrintRender] failed', err);
    error.value = err?.message || 'تعذر تحميل بيانات الطباعة';
    loading.value = false;
    // Still tell main we're "done" so it stops waiting and inspects/dumps the DOM
    // (which now shows this visible error) instead of hanging.
    try {
      await printApi()?.notifyReady(renderToken.value || jobId.value);
    } catch {
      /* main has its own timeout */
    }
  }
});

// Resolve once the receipt is genuinely on the page (text + an invoice marker).
function waitForRealPrintContent() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const paper = document.querySelector('[data-print-paper="true"]');
      const text = paper?.innerText?.trim() || '';
      const hasText = text.length > 20;
      const hasMarker = /فاتورة|عقد|Invoice|INV|رقم/i.test(paper?.textContent || '');
      if (hasText && hasMarker) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt > 10000) {
        reject(new Error('Print content did not render before timeout'));
        return;
      }
      setTimeout(check, 50); // setTimeout ticks even while hidden (unlike rAF)
    };
    check();
  });
}

function waitForFonts() {
  return document.fonts?.ready ? document.fonts.ready : Promise.resolve();
}

function waitForImages() {
  return Promise.all(
    Array.from(document.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
    )
  );
}
</script>

<style scoped>
.print-render-page {
  background: #ffffff;
}
.render-status,
.render-error {
  padding: 24px;
  text-align: center;
  font-family: 'Cairo', sans-serif;
  color: #6b7280;
}
.render-error {
  color: #b91c1c;
}
.render-error__title {
  font-size: 18px;
  font-weight: 800;
  margin: 0 0 6px;
}
.render-error__detail {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}
</style>
