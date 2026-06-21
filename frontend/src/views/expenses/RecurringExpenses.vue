<template>
  <div class="page-shell">
    <PageHeader
      title="المصاريف الثابتة"
      subtitle="مصاريف متكررة تُسجَّل تلقائياً عند حلول موعد استحقاقها"
      icon="mdi-calendar-sync"
    >
      <v-btn
        v-if="canCreate"
        variant="tonal"
        prepend-icon="mdi-play-circle-outline"
        size="default"
        class="ml-2"
        :loading="running"
        title="توليد المصاريف المستحقة الآن"
        @click="runNow"
      >
        توليد المستحق الآن
      </v-btn>
      <v-btn
        v-if="canCreate"
        color="primary"
        prepend-icon="mdi-plus"
        size="default"
        aria-label="إضافة مصروف ثابت"
        @click="openCreate"
      >
        مصروف ثابت جديد
      </v-btn>
    </PageHeader>

    <OnboardingTip
      id="recurring-expenses-intro"
      text="المصروف الثابت يولّد قيد مصروف عادي في موعد استحقاقه، فيظهر في كل التقارير والأرباح تلقائياً. لو كان البرنامج مغلقاً وقت الاستحقاق تُنشأ المصاريف الفائتة عند التشغيل."
    />

    <v-card class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">mdi-format-list-bulleted</v-icon>
          قائمة المصاريف الثابتة
        </span>
      </div>
      <v-data-table
        :headers="headers"
        :items="items"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
        <template #[`item.amount`]="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.amount, item.currency) }}</span>
        </template>
        <template #[`item.category`]="{ item }">
          <v-chip size="small" variant="tonal">{{ categoryLabel(item.category) }}</v-chip>
        </template>
        <template #[`item.schedule`]="{ item }">
          {{ scheduleLabel(item) }}
        </template>
        <template #[`item.lastRunDate`]="{ item }">
          {{ item.lastRunDate || '—' }}
        </template>
        <template #[`item.nextDueDate`]="{ item }">
          <span :class="{ 'text-error': item.isActive && isOverdue(item.nextDueDate) }">
            {{ item.isActive ? item.nextDueDate || '—' : '—' }}
          </span>
        </template>
        <template #[`item.isActive`]="{ item }">
          <v-chip :color="item.isActive ? 'success' : 'grey'" size="small" variant="tonal">
            {{ item.isActive ? 'فعّال' : 'متوقف' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="canManage"
            :icon="item.isActive ? 'mdi-pause' : 'mdi-play'"
            size="small"
            variant="text"
            :title="item.isActive ? 'إيقاف مؤقت' : 'تفعيل'"
            @click="toggleActive(item)"
          />
          <v-btn
            v-if="canManage"
            icon="mdi-pencil"
            size="small"
            variant="text"
            title="تعديل"
            @click="openEdit(item)"
          />
          <v-btn
            v-if="canDelete"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            title="حذف"
            @click="confirmDelete(item)"
          />
        </template>
        <template #no-data>
          <EmptyState
            title="لا توجد مصاريف ثابتة"
            description="أضف مصروفاً ثابتاً (مثل الإيجار أو الرواتب) ليُسجَّل تلقائياً عند موعده."
            icon="mdi-calendar-sync"
            compact
          />
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit dialog -->
    <v-dialog v-model="dialog" max-width="560">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ editingId ? 'mdi-pencil' : 'mdi-calendar-plus' }}</v-icon>
          <span>{{ editingId ? 'تعديل مصروف ثابت' : 'مصروف ثابت جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.name"
                  label="اسم المصروف *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم المصروف مطلوب']"
                  required
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="formData.category"
                  :items="categoryOptions"
                  label="الفئة *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'الفئة مطلوبة']"
                  required
                />
              </v-col>
              <v-col cols="12" sm="8">
                <v-text-field
                  :model-value="formatNumber(formData.amount)"
                  label="المبلغ *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => parseNumber(v) > 0 || 'المبلغ مطلوب']"
                  required
                  @update:model-value="handleAmountInput"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-select
                  v-model="formData.currency"
                  :items="['USD', 'IQD']"
                  label="العملة"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-select
                  v-model="formData.frequency"
                  :items="frequencyOptions"
                  label="نوع التكرار *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'نوع التكرار مطلوب']"
                  required
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.startDate"
                  type="date"
                  label="تاريخ البداية"
                  variant="outlined"
                  density="comfortable"
                  hint="أول تاريخ يبدأ منه التكرار"
                  persistent-hint
                />
              </v-col>

              <!-- Weekly: day of week -->
              <v-col v-if="formData.frequency === 'weekly'" cols="12" sm="6">
                <v-select
                  v-model.number="formData.dayOfWeek"
                  :items="dayOfWeekOptions"
                  label="يوم الأسبوع *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => (v !== null && v !== undefined) || 'يوم الأسبوع مطلوب']"
                />
              </v-col>

              <!-- Monthly/Yearly: day of month -->
              <v-col
                v-if="formData.frequency === 'monthly' || formData.frequency === 'yearly'"
                cols="12"
                sm="6"
              >
                <v-text-field
                  v-model.number="formData.dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  label="يوم الشهر *"
                  variant="outlined"
                  density="comfortable"
                  hint="إن تجاوز عدد أيام الشهر يُستخدم آخر يوم"
                  persistent-hint
                  :rules="[(v) => (v >= 1 && v <= 31) || 'أدخل يوماً بين 1 و 31']"
                />
              </v-col>

              <!-- Yearly: month -->
              <v-col v-if="formData.frequency === 'yearly'" cols="12" sm="6">
                <v-select
                  v-model.number="formData.monthOfYear"
                  :items="monthOptions"
                  label="الشهر *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => (v >= 1 && v <= 12) || 'الشهر مطلوب']"
                />
              </v-col>

              <v-col v-if="isGlobalAdmin" cols="12">
                <v-select
                  v-model="formData.branchId"
                  :items="branchOptions"
                  item-title="name"
                  item-value="id"
                  label="الفرع"
                  variant="outlined"
                  density="comfortable"
                  clearable
                />
              </v-col>
              <v-col v-if="treasuryOn && treasuryTargets.length > 0" cols="12">
                <v-select
                  v-model="formData.treasuryTarget"
                  :items="treasuryTargets"
                  item-title="title"
                  item-value="key"
                  label="الدفع من (صندوق/حساب)"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-safe-square-outline"
                  hint="يُستخدم لكل مصروف يتولّد من هذا القالب"
                  persistent-hint
                  clearable
                />
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="formData.note"
                  label="ملاحظات"
                  variant="outlined"
                  density="comfortable"
                  rows="2"
                  auto-grow
                />
              </v-col>
              <v-col cols="12">
                <v-switch
                  v-model="formData.isActive"
                  color="success"
                  :label="formData.isActive ? 'فعّال' : 'متوقف'"
                  hide-details
                  inset
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useRecurringExpensesStore } from '@/stores/recurringExpenses';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { useTreasuryStore } from '@/stores/treasury';
import { useNotificationStore } from '@/stores/notification';
import PageHeader from '@/components/PageHeader.vue';
import OnboardingTip from '@/components/OnboardingTip.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import { formatCurrency } from '@/utils/formatters';

const route = useRoute();
const store = useRecurringExpensesStore();
const authStore = useAuthStore();
const inventoryStore = useInventoryStore();
const treasuryStore = useTreasuryStore();
const notify = useNotificationStore();

const loading = computed(() => store.loading);
const items = computed(() => store.items);
const isGlobalAdmin = computed(() => authStore.isGlobalAdmin);
const branchOptions = computed(() => inventoryStore.branches || []);
const canCreate = computed(() => authStore.hasPermission?.('recurring_expenses:create'));
const canManage = computed(() => authStore.hasPermission?.(['recurring_expenses:update']));
const canDelete = computed(() => authStore.hasPermission?.(['recurring_expenses:delete']));
const canReadTreasury = computed(() => authStore.hasPermission?.('treasury:read'));
const treasuryOn = computed(() => authStore.hasFeature('treasury'));
const treasuryTargets = computed(() => [
  ...(treasuryStore.cashboxes || []).map((c) => ({
    key: `cashbox:${c.id}`,
    title: `صندوق: ${c.name}`,
  })),
  ...(treasuryStore.bankAccounts || []).map((b) => ({
    key: `bank:${b.id}`,
    title: `حساب: ${b.name}`,
  })),
]);

const CATEGORY_LABELS = {
  rent: 'إيجار',
  salary: 'رواتب',
  utilities: 'مرافق',
  supplies: 'مستلزمات',
  maintenance: 'صيانة',
  transport: 'نقل',
  marketing: 'تسويق',
  tax: 'ضرائب',
  other: 'أخرى',
};
const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, title]) => ({ value, title }));
function categoryLabel(c) {
  return CATEGORY_LABELS[c] || c;
}

const formatNumber = (value) => {
  if (!value && value !== 0) return '';
  const numStr = String(value).replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(numStr)) return value;
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

const FREQUENCY_LABELS = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', yearly: 'سنوي' };
const frequencyOptions = Object.entries(FREQUENCY_LABELS).map(([value, title]) => ({
  value,
  title,
}));
const DAY_OF_WEEK_LABELS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];
const dayOfWeekOptions = DAY_OF_WEEK_LABELS.map((title, value) => ({ value, title }));
const MONTH_LABELS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];
const monthOptions = MONTH_LABELS.map((title, i) => ({ value: i + 1, title }));

function scheduleLabel(item) {
  switch (item.frequency) {
    case 'daily':
      return 'كل يوم';
    case 'weekly':
      return `كل ${DAY_OF_WEEK_LABELS[item.dayOfWeek] || ''}`;
    case 'monthly':
      return `يوم ${item.dayOfMonth} من كل شهر`;
    case 'yearly':
      return `${item.dayOfMonth} ${MONTH_LABELS[(item.monthOfYear || 1) - 1] || ''} من كل سنة`;
    default:
      return FREQUENCY_LABELS[item.frequency] || item.frequency;
  }
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return dateStr <= new Date().toISOString().slice(0, 10);
}

const headers = [
  { title: 'الاسم', key: 'name' },
  { title: 'الفئة', key: 'category' },
  { title: 'المبلغ', key: 'amount' },
  { title: 'التكرار', key: 'schedule', sortable: false },
  { title: 'آخر استقطاع', key: 'lastRunDate' },
  { title: 'الاستحقاق القادم', key: 'nextDueDate' },
  { title: 'الحالة', key: 'isActive' },
  { title: 'الفرع', key: 'branchName' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const dialog = ref(false);
const saving = ref(false);
const running = ref(false);
const editingId = ref(null);
const form = ref(null);
const formData = reactive({
  name: '',
  category: '',
  amount: null,
  currency: 'USD',
  frequency: 'monthly',
  dayOfWeek: null,
  dayOfMonth: 1,
  monthOfYear: 1,
  startDate: new Date().toISOString().slice(0, 10),
  branchId: null,
  note: '',
  isActive: true,
  treasuryTarget: null,
});

function resetForm() {
  formData.name = '';
  formData.category = '';
  formData.amount = null;
  formData.currency = 'USD';
  formData.frequency = 'monthly';
  formData.dayOfWeek = null;
  formData.dayOfMonth = 1;
  formData.monthOfYear = 1;
  formData.startDate = new Date().toISOString().slice(0, 10);
  formData.branchId = null;
  formData.note = '';
  formData.isActive = true;
  formData.treasuryTarget = null;
  editingId.value = null;
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(row) {
  editingId.value = row.id;
  formData.name = row.name;
  formData.category = row.category;
  formData.amount = row.amount;
  formData.currency = row.currency;
  formData.frequency = row.frequency;
  formData.dayOfWeek = row.dayOfWeek;
  formData.dayOfMonth = row.dayOfMonth || 1;
  formData.monthOfYear = row.monthOfYear || 1;
  formData.startDate = row.startDate || new Date().toISOString().slice(0, 10);
  formData.branchId = row.branchId || null;
  formData.note = row.note || '';
  formData.isActive = !!row.isActive;
  formData.treasuryTarget = row.cashboxId
    ? `cashbox:${row.cashboxId}`
    : row.bankAccountId
      ? `bank:${row.bankAccountId}`
      : null;
  dialog.value = true;
}

function buildPayload() {
  const { treasuryTarget, ...rest } = formData;
  const payload = { ...rest };
  // Strip recurrence fields not relevant to the chosen frequency.
  if (payload.frequency !== 'weekly') payload.dayOfWeek = null;
  if (payload.frequency === 'daily') {
    payload.dayOfMonth = null;
    payload.monthOfYear = null;
  } else if (payload.frequency === 'monthly') {
    payload.monthOfYear = null;
  }
  payload.cashboxId = null;
  payload.bankAccountId = null;
  if (treasuryTarget) {
    const [kind, id] = String(treasuryTarget).split(':');
    if (kind === 'cashbox') payload.cashboxId = Number(id);
    if (kind === 'bank') payload.bankAccountId = Number(id);
  }
  return payload;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editingId.value) {
      await store.update(editingId.value, payload);
    } else {
      await store.create(payload);
    }
    dialog.value = false;
    await store.fetch();
  } catch (err) {
    console.error('Failed to save recurring expense', err);
    notify.error(err.message || 'فشل حفظ المصروف الثابت');
  } finally {
    saving.value = false;
  }
}

async function toggleActive(row) {
  try {
    await store.setActive(row.id, !row.isActive);
    await store.fetch();
  } catch {
    notify.error('فشل تغيير حالة المصروف الثابت');
  }
}

async function confirmDelete(row) {
  if (
    !window.confirm(
      `حذف المصروف الثابت «${row.name}»؟ (المصاريف المُولّدة سابقاً تبقى في التقارير)`
    )
  )
    return;
  try {
    await store.remove(row.id);
    await store.fetch();
  } catch {
    notify.error('فشل حذف المصروف الثابت');
  }
}

async function runNow() {
  running.value = true;
  try {
    await store.runNow();
    await store.fetch();
  } catch (err) {
    notify.error(err.message || 'فشل توليد المصاريف المستحقة');
  } finally {
    running.value = false;
  }
}

const parseNumber = (value) => {
  if (!value) return 0;
  // إزالة الفواصل وتحويل إلى رقم
  const numStr = String(value).replace(/,/g, '');
  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : num;
};

const handleAmountInput = (value) => {
  const numStr = parseNumber(value);
  formData.amount = numStr;
};

onMounted(async () => {
  if (isGlobalAdmin.value) {
    try {
      await inventoryStore.fetchBranches();
    } catch {
      /* ignore */
    }
  }
  if (treasuryOn.value && canReadTreasury.value) {
    try {
      await treasuryStore.fetchCashboxes();
      if (authStore.hasFeature('bankAccounts')) await treasuryStore.fetchBankAccounts();
    } catch {
      /* ignore */
    }
  }
  await store.fetch();

  // Deep-link: create a recurring template from an existing expense.
  if (route.query.fromExpense && canCreate.value) {
    resetForm();
    if (route.query.name) formData.name = String(route.query.name);
    if (route.query.category) formData.category = String(route.query.category);
    if (route.query.amount) formData.amount = Number(route.query.amount);
    if (route.query.currency) formData.currency = String(route.query.currency);
    if (route.query.branchId) formData.branchId = Number(route.query.branchId);
    if (route.query.note) formData.note = String(route.query.note);
    dialog.value = true;
  }
});
</script>
