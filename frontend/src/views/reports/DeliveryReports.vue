<template>
  <div class="page-shell">
    <PageHeader title="تقارير الشحن" subtitle="التقارير ← تقارير الشحن" icon="mdi-truck-check-outline" />

    <!-- Filters -->
    <v-card class="page-section mb-4">
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="store.filters.dateFrom"
              label="من تاريخ"
              type="date"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="store.filters.dateTo"
              label="إلى تاريخ"
              type="date"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="store.filters.providerId"
              :items="providerItems"
              label="شركة التوصيل"
              variant="outlined"
              density="comfortable"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="store.filters.status"
              :items="statusItems"
              label="الحالة"
              variant="outlined"
              density="comfortable"
              clearable
              hide-details
            />
          </v-col>
        </v-row>
        <div class="d-flex justify-end mt-3">
          <v-btn color="primary" prepend-icon="mdi-refresh" :loading="store.loading" @click="load">
            تحديث
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-4" />

    <template v-if="overview">
      <!-- KPI cards -->
      <v-row dense class="mb-2">
        <v-col v-for="kpi in kpis" :key="kpi.label" cols="6" sm="4" md="2">
          <v-card class="pa-3 h-100" variant="tonal" :color="kpi.color">
            <div class="text-caption text-medium-emphasis">{{ kpi.label }}</div>
            <div class="text-h6 font-weight-bold">{{ kpi.value }}</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Shipping cost per currency -->
      <v-card class="page-section mb-4">
        <v-card-title class="text-subtitle-1">إجمالي تكاليف الشحن (حسب العملة)</v-card-title>
        <v-card-text>
          <v-alert v-if="!overview.costByCurrency.length" type="info" variant="tonal" density="comfortable">
            لا توجد بيانات تكلفة ضمن النطاق المحدد.
          </v-alert>
          <v-row v-else dense>
            <v-col v-for="c in overview.costByCurrency" :key="c.currency" cols="12" sm="6" md="4">
              <v-card variant="outlined" class="pa-3">
                <div class="text-caption text-medium-emphasis">{{ c.currency }}</div>
                <div class="text-h6 font-weight-bold">{{ money(c.totalFee) }} {{ c.currency }}</div>
                <div class="text-caption">عدد الشحنات: {{ c.count }} · إجمالي التحصيل: {{ money(c.totalCod) }}</div>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- By provider -->
      <v-card class="page-section mb-4">
        <v-card-title class="text-subtitle-1">حسب شركة التوصيل</v-card-title>
        <v-data-table
          :headers="providerHeaders"
          :items="overview.byProvider"
          :items-per-page="-1"
          density="comfortable"
          hide-default-footer
        >
          <template #[`item.successRate`]="{ item }">{{ item.successRate }}%</template>
          <template #[`item.returnRate`]="{ item }">{{ item.returnRate }}%</template>
        </v-data-table>
      </v-card>

      <!-- By status -->
      <v-card class="page-section mb-4">
        <v-card-title class="text-subtitle-1">حسب الحالة</v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap gap-2">
            <v-chip v-for="s in overview.byStatus" :key="s.status" :color="statusMeta(s.status).color" variant="tonal">
              <v-icon start size="16">{{ statusMeta(s.status).icon }}</v-icon>
              {{ statusMeta(s.status).label }}: {{ s.count }}
            </v-chip>
            <span v-if="!overview.byStatus.length" class="text-medium-emphasis">لا توجد شحنات.</span>
          </div>
        </v-card-text>
      </v-card>

      <!-- Late shipments -->
      <v-card class="page-section">
        <v-card-title class="text-subtitle-1">
          الشحنات المتأخرة
          <span class="text-caption text-medium-emphasis">(أقدم من {{ lateDays }} أيام، غير منتهية)</span>
        </v-card-title>
        <v-data-table
          :headers="lateHeaders"
          :items="overview.lateShipments"
          :items-per-page="10"
          density="comfortable"
        >
          <template #[`item.status`]="{ item }">
            <v-chip :color="statusMeta(item.status).color" size="small" variant="tonal">
              {{ statusMeta(item.status).label }}
            </v-chip>
          </template>
          <template #[`item.createdAt`]="{ item }">{{ formatDate(item.createdAt) }}</template>
          <template #no-data>لا توجد شحنات متأخرة 🎉</template>
        </v-data-table>
      </v-card>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useDeliveryReportStore } from '@/stores/deliveryReport';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { statusMeta, DELIVERY_STATUS_META } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';

const store = useDeliveryReportStore();
const providerStore = useDeliveryProviderStore();
const lateDays = ref(3);

const overview = computed(() => store.overview);

const providerItems = computed(() =>
  providerStore.providers.map((p) => ({ title: p.name, value: p.id }))
);

const statusItems = Object.entries(DELIVERY_STATUS_META).map(([value, m]) => ({
  title: m.label,
  value,
}));

const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

const kpis = computed(() => {
  const s = overview.value?.summary || {};
  return [
    { label: 'إجمالي الشحنات', value: s.total ?? 0, color: 'primary' },
    { label: 'تم التوصيل', value: s.delivered ?? 0, color: 'success' },
    { label: 'مرتجعة', value: s.returned ?? 0, color: 'orange-darken-3' },
    { label: 'ملغاة', value: s.cancelled ?? 0, color: 'error' },
    { label: 'متأخرة', value: s.lateCount ?? 0, color: 'amber-darken-3' },
    { label: 'نسبة النجاح', value: `${s.successRate ?? 0}%`, color: 'teal' },
  ];
});

const providerHeaders = [
  { title: 'الشركة', key: 'providerName' },
  { title: 'العدد', key: 'count' },
  { title: 'تم التوصيل', key: 'delivered' },
  { title: 'مرتجعة', key: 'returned' },
  { title: 'ملغاة', key: 'cancelled' },
  { title: 'نسبة النجاح', key: 'successRate' },
  { title: 'نسبة الإرجاع', key: 'returnRate' },
];

const lateHeaders = [
  { title: 'رقم الشحنة', key: 'shipmentNumber' },
  { title: 'الشركة', key: 'providerName' },
  { title: 'الحالة', key: 'status' },
  { title: 'المستلم', key: 'recipientName' },
  { title: 'المحافظة', key: 'province' },
  { title: 'تاريخ الإنشاء', key: 'createdAt' },
];

const load = () => store.fetchOverview();

onMounted(() => {
  providerStore.fetchProviders({ optional: true });
  load();
});
</script>
