<!--
  ReceiptPrint — the SINGLE source of truth for an invoice's appearance, shared by
  the preview, the print render, and the PDF render. Pure presentational: receives
  `data` (a Print DTO), `paper`, `theme`; fetches nothing; renders nothing it lacks.

  The root carries data-print-root / data-print-paper so the main process can poll
  for real, painted content before calling printToPDF (no white pages).
-->
<template>
  <div
    class="receipt-paper"
    data-print-root="true"
    data-print-paper="true"
    :class="[`receipt-paper--${paper}`, `receipt-paper--theme-${theme}`]"
    :style="themeStyle"
  >
    <img v-if="logoSrc" class="receipt-logo" :src="logoSrc" alt="" @error="onLogoError" />
    <!-- Header: brand (logo + company text) beside company meta -->
    <header class="receipt-header" :class="`receipt-header--${headerLayout}`">
      <div class="receipt-brand">
        <div class="receipt-company-text">
          <div v-if="company.name" class="receipt-company-name">{{ company.name }}</div>
          <div v-if="company.invoiceHeaderText" class="receipt-header-text">
            {{ company.invoiceHeaderText }}
          </div>
          <div v-if="company.invoiceSubHeaderText" class="receipt-subheader-text">
            {{ company.invoiceSubHeaderText }}
          </div>
        </div>
      </div>
      <div v-if="hasCompanyMeta" class="receipt-company-meta">
        <div v-if="companyAddress">{{ companyAddress }}</div>
        <div v-if="companyPhones">{{ companyPhones }}</div>
        <div v-if="company.taxNumber">الرقم الضريبي: {{ company.taxNumber }}</div>
      </div>
    </header>

    <!-- Invoice title + meta -->
    <div class="receipt-title">{{ invoiceTitle }}</div>
    <section class="receipt-meta">
      <div class="receipt-row">
        <span>رقم الفاتورة:</span><span>{{ invoice.number }}</span>
      </div>
      <div class="receipt-row">
        <span>التاريخ:</span><span>{{ formatDateTime(invoice.date) }}</span>
      </div>
      <div v-if="meta.userName" class="receipt-row">
        <span>المستخدم:</span><span>{{ meta.userName }}</span>
      </div>
      <div v-if="meta.branchName" class="receipt-row">
        <span>الفرع:</span><span>{{ meta.branchName }}</span>
      </div>
      <div v-if="meta.warehouseName" class="receipt-row">
        <span>المخزن:</span><span>{{ meta.warehouseName }}</span>
      </div>
    </section>

    <!-- Customer (optional) -->
    <template v-if="customer && customer.name">
      <hr class="receipt-divider receipt-divider--soft" />
      <section class="receipt-customer">
        <div class="receipt-row">
          <span>العميل:</span><span>{{ customer.name }}</span>
        </div>
        <div v-if="customer.phone" class="receipt-row">
          <span>الهاتف:</span><span>{{ customer.phone }}</span>
        </div>
        <div v-if="customer.address" class="receipt-row">
          <span>العنوان:</span><span>{{ customer.address }}</span>
        </div>
      </section>
    </template>

    <hr class="receipt-divider" />

    <!-- Items: modern table on sheets, line layout on thermal rolls -->
    <table v-if="isSheet" class="receipt-items">
      <thead>
        <tr>
          <th>المنتج</th>
          <th class="num">الكمية</th>
          <th class="num">السعر</th>
          <th class="num">المجموع</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, i) in items" :key="i">
          <td>
            <span>{{ item.name }}</span>
            <span v-if="item.sku" class="item-sub">رمز: {{ item.sku }}</span>
            <span v-if="item.unit" class="item-sub">الوحدة: {{ item.unit }}</span>
            <span v-if="item.notes" class="item-sub">{{ item.notes }}</span>
            <span v-if="num(item.discount) > 0" class="item-discount"
              >خصم: -{{ money(item.discount) }}</span
            >
          </td>
          <td class="num">{{ item.quantity }}</td>
          <td class="num">{{ money(item.price) }}</td>
          <td class="num">{{ money(item.total) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else class="receipt-tlist">
      <div v-for="(item, i) in items" :key="i" class="receipt-titem">
        <div class="receipt-titem-name">{{ item.name }}</div>
        <div class="receipt-titem-line">
          <span class="qxp">{{ item.quantity }} × {{ money(item.price) }}</span>
          <span>{{ money(item.total) }}</span>
        </div>
        <div v-if="item.notes" class="receipt-titem-sub">{{ item.notes }}</div>
        <div v-if="num(item.discount) > 0" class="receipt-titem-sub discount">
          خصم: -{{ money(item.discount) }}
        </div>
      </div>
    </div>

    <!-- Totals box -->
    <section class="receipt-totals">
      <div v-if="showSubtotal" class="receipt-total-row">
        <span>المجموع الفرعي:</span><span>{{ money(totals.subtotal) }}</span>
      </div>
      <div v-if="num(totals.discount) > 0" class="receipt-total-row">
        <span>الخصم:</span><span class="discount">-{{ money(totals.discount) }}</span>
      </div>
      <div v-if="num(totals.tax) > 0" class="receipt-total-row">
        <span>الضريبة:</span><span>{{ money(totals.tax) }}</span>
      </div>
      <div v-if="num(totals.interest) > 0" class="receipt-total-row">
        <span>الفائدة المضافة:</span><span class="interest">+{{ money(totals.interest) }}</span>
      </div>
      <div class="receipt-total-row receipt-total-row--grand">
        <span>الإجمالي:</span><span>{{ money(totals.total) }}</span>
      </div>
      <div class="receipt-total-row">
        <span>المدفوع:</span><span class="paid">{{ money(totals.paid) }}</span>
      </div>
      <div v-if="num(totals.remaining) > 0" class="receipt-total-row">
        <span>المتبقي:</span><span class="remaining">{{ money(totals.remaining) }}</span>
      </div>
      <div v-if="num(totals.change) > 0" class="receipt-total-row">
        <span>الباقي:</span><span>{{ money(totals.change) }}</span>
      </div>
      <div v-for="(p, i) in payments" :key="`pay-${i}`" class="receipt-total-row">
        <span>{{ paymentMethodLabel(p.method) }}:</span><span>{{ money(p.amount) }}</span>
      </div>
    </section>

    <!-- Installments schedule -->
    <template v-if="installments.length">
      <hr class="receipt-divider" />
      <div class="receipt-title">جدول الأقساط</div>
      <table class="receipt-installments">
        <thead>
          <tr>
            <th>#</th>
            <th>تاريخ الاستحقاق</th>
            <th>المبلغ</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(inst, i) in installments"
            :key="`inst-${i}`"
            :class="{ 'paid-row': inst.isPaid }"
          >
            <td>{{ inst.number }}</td>
            <td>{{ formatDate(inst.dueDate) }}</td>
            <td>{{ money(inst.amount) }}</td>
            <td>{{ inst.statusLabel }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Notes -->
    <template v-if="invoice.notes">
      <hr class="receipt-divider receipt-divider--soft" />
      <div class="receipt-note">ملاحظة: {{ invoice.notes }}</div>
    </template>

    <hr class="receipt-divider" />

    <!-- Footer -->
    <footer class="receipt-footer">
      <div class="receipt-footer-text">
        {{ company.invoiceFooterText || 'شكراً لتعاملكم معنا' }}
      </div>
      <div v-if="company.invoiceTermsText" class="receipt-terms-text">
        {{ company.invoiceTermsText }}
      </div>
      <div class="receipt-printed-at">طُبعت: {{ formatDateTime(meta.printedAt) }}</div>
      <div class="receipt-printed-at">نقطة بلس | نظام ادارة المبيعات و المخزون</div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import './receipt.print.css';
import { getThemeVars, coerceTheme, DEFAULT_THEME } from './receipt.themes.js';
import { getPaperPreset, DEFAULT_PAPER } from '../../paper/paperPresets.js';

const props = defineProps({
  data: { type: Object, required: true },
  paper: { type: String, default: DEFAULT_PAPER },
  theme: { type: String, default: DEFAULT_THEME },
});

const company = computed(() => props.data.company || {});
const invoice = computed(() => props.data.invoice || {});
const customer = computed(() => props.data.customer || null);
const items = computed(() => props.data.items || []);
const totals = computed(() => props.data.totals || {});
const payments = computed(() => props.data.payments || []);
const meta = computed(() => props.data.meta || {});
const installments = computed(() => meta.value.installments || []);

const currency = computed(() => totals.value.currency || meta.value.currency || 'IQD');
const themeStyle = computed(() => getThemeVars(coerceTheme(props.theme)));
const preset = computed(() => getPaperPreset(props.paper));
const isSheet = computed(() => preset.value.kind === 'sheet');

// Logo: main injects a data URL (logoDataUrl); fall back to an external URL.
const logoSrc = computed(() => company.value.logoDataUrl || company.value.logoUrl || '');

// Effective header layout: explicit setting, or auto by paper kind.
const headerLayout = computed(() => {
  const want = company.value.invoiceHeaderLayout || 'auto';
  if (want !== 'auto') return want;
  if (isSheet.value) return 'horizontal';
  return props.paper === 'roll-58' ? 'compact' : 'compact';
});

const invoiceTitle = computed(() =>
  invoice.value.type === 'installment' ? 'عقد بيع بالتقسيط' : 'فاتورة مبيعات'
);
const companyAddress = computed(() => company.value.address || '');
const companyPhones = computed(() => {
  const phones = [company.value.phone, company.value.phone2].filter(Boolean);
  return phones.length ? phones.join(' | ') : '';
});
const hasCompanyMeta = computed(
  () => !!(companyAddress.value || companyPhones.value || company.value.taxNumber)
);
const showSubtotal = computed(
  () =>
    num(totals.value.discount) > 0 || num(totals.value.tax) > 0 || num(totals.value.interest) > 0
);

function num(v) {
  return Number(v) || 0;
}
function money(amount) {
  const n = num(amount);
  if (currency.value === 'USD') {
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    });
  }
  return `${Math.round(n).toLocaleString('en-US')} د.ع`;
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDate(value)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function paymentMethodLabel(method) {
  const map = { cash: 'نقدي', card: 'بطاقة', bank_transfer: 'تحويل بنكي', installment: 'تقسيط' };
  return map[method] || method || 'دفعة';
}
function onLogoError(e) {
  e.target.style.display = 'none';
}
</script>
