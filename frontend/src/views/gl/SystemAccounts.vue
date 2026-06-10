<template>
  <div class="page-shell">
    <PageHeader
      title="ربط الحسابات"
      subtitle="ربط مفاتيح الترحيل التلقائي بحسابات الشجرة — يحدد أين تُرحَّل المبيعات والمشتريات والنقد تلقائياً"
      icon="mdi-link-variant"
    />

    <v-alert type="info" variant="tonal" density="compact" class="page-section mb-4">
      كل مفتاح يربط نوعاً من الحركات بحساب ورقي في الشجرة. تغيير الربط يؤثر على القيود
      <strong>الجديدة</strong> فقط، لا القيود المُرحّلة سابقاً.
    </v-alert>

    <v-card class="page-section">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th class="text-start">المفتاح</th>
            <th class="text-start">الوصف</th>
            <th class="text-start">الحساب المربوط</th>
            <th v-if="canManage" class="text-end" style="width: 120px">إجراء</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in systemAccounts" :key="row.key">
            <td class="font-mono text-caption">{{ row.key }}</td>
            <td>{{ row.description || labelFor(row.key) }}</td>
            <td>
              <span v-if="row.accountCode" class="font-mono text-caption">{{ row.accountCode }}</span>
              {{ row.accountName || '— غير مربوط —' }}
            </td>
            <td v-if="canManage" class="text-end">
              <v-btn size="x-small" variant="text" icon="mdi-pencil" title="تعديل الربط" @click="openEdit(row)" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>mdi-link-variant</v-icon>
          <span>ربط: {{ editing?.key }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-autocomplete
            v-model="selectedAccountId"
            :items="postableAccounts"
            :item-title="(a) => `${a.code} — ${a.name}`"
            item-value="id"
            label="الحساب الورقي *"
            variant="outlined"
            density="comfortable"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" :loading="saving" :disabled="!selectedAccountId" @click="save">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';

const glStore = useGlStore();
const authStore = useAuthStore();

const systemAccounts = computed(() => glStore.systemAccounts);
const postableAccounts = computed(() => glStore.postableAccounts);
const canManage = computed(() => authStore.hasPermission?.('gl:manage_system_accounts'));

const KEY_LABELS = {
  cash_default: 'الصندوق الافتراضي',
  bank_default: 'البنك الافتراضي',
  accounts_receivable: 'ديون العملاء (لنا)',
  accounts_payable: 'ديون الموردين (علينا)',
  sales_revenue: 'إيراد المبيعات',
  sales_returns: 'مرتجعات المبيعات',
  sales_discount: 'خصم المبيعات',
  cogs: 'تكلفة البضاعة المباعة',
  inventory: 'المخزون',
  expenses_default: 'المصروفات العامة',
  sales_tax_payable: 'ضريبة المبيعات المستحقة',
  installment_interest_income: 'إيراد فوائد الأقساط',
  other_income: 'إيرادات أخرى',
  other_expenses: 'مصروفات أخرى',
  capital: 'رأس المال',
  retained_earnings: 'الأرباح المحتجزة',
  opening_balance_equity: 'حقوق الأرصدة الافتتاحية',
  currency_exchange_diff: 'فروقات أسعار الصرف',
  cash_short_over: 'عجز/زيادة الصندوق',
};
const labelFor = (key) => KEY_LABELS[key] || key;

const dialog = ref(false);
const saving = ref(false);
const editing = ref(null);
const selectedAccountId = ref(null);

function openEdit(row) {
  editing.value = row;
  selectedAccountId.value = row.accountId || null;
  dialog.value = true;
}

async function save() {
  if (!selectedAccountId.value) return;
  saving.value = true;
  try {
    await glStore.setSystemAccount(editing.value.key, selectedAccountId.value);
    dialog.value = false;
    await glStore.fetchSystemAccounts();
  } catch (err) {
    console.error('Failed to set mapping', err);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([glStore.fetchSystemAccounts(), glStore.fetchAccounts()]);
});
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
