<template>
  <div class="page-shell">
    <PageHeader
      title="تقارير التجارة الأونلاين والشحن"
      subtitle="الطلبات، المبيعات، الشحنات، المرتجعات، شركات النقل، والأداء والتحصيل في مكان واحد"
      icon="mdi-chart-areaspline"
    >
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">تحديث</v-btn>
    </PageHeader>

    <!-- ── Shared filters ─────────────────────────────────────────────────── -->
    <v-card class="page-section mb-3">
      <v-card-text>
        <div class="d-flex flex-wrap gap-3">
          <v-text-field
            v-model="filters.dateFrom"
            type="date"
            label="من تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 170px"
            @update:model-value="load"
          />
          <v-text-field
            v-model="filters.dateTo"
            type="date"
            label="إلى تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 170px"
            @update:model-value="load"
          />
          <v-select
            v-if="branchItems.length"
            v-model="filters.branchId"
            :items="branchItems"
            item-title="name"
            item-value="id"
            label="الفرع"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
          <v-select
            v-if="onlineOn"
            v-model="filters.channelId"
            :items="channelItems"
            item-title="name"
            item-value="id"
            label="القناة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
          <v-select
            v-if="shipOn"
            v-model="filters.providerId"
            :items="providerItems"
            label="شركة النقل"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
          <v-select
            v-if="shipOn"
            v-model="filters.status"
            :items="statusItems"
            label="حالة الشحنة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
          <v-select
            v-if="onlineOn"
            v-model="filters.orderStatus"
            :items="orderStatusItems"
            label="حالة الطلب"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
          <v-select
            v-if="onlineOn && userItems.length"
            v-model="filters.userId"
            :items="userItems"
            item-title="title"
            item-value="value"
            label="المستخدم"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="load"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <!-- ── Combined KPI strip (currency-safe counts) ──────────────────────── -->
    <v-row dense class="mb-2">
      <v-col v-for="kpi in kpis" :key="kpi.label" cols="6" sm="4" md="2">
        <v-card class="pa-3 h-100" variant="tonal" :color="kpi.color">
          <div class="text-caption text-medium-emphasis">{{ kpi.label }}</div>
          <div class="text-h6 font-weight-bold">{{ kpi.value }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── Tabs ───────────────────────────────────────────────────────────── -->
    <v-card class="page-section">
      <v-tabs v-model="tab" bg-color="transparent" show-arrows>
        <v-tab v-for="t in tabs" :key="t.value" :value="t.value">
          <v-icon start size="18">{{ t.icon }}</v-icon>{{ t.title }}
        </v-tab>
      </v-tabs>
      <v-divider />

      <v-window v-model="tab" class="pa-3">
        <!-- 1. ملخص الطلبات الأونلاين -->
        <v-window-item v-if="onlineOn" value="orders">
          <v-row dense class="mb-2">
            <v-col v-for="k in orderKpis" :key="k.label" cols="6" sm="4" md="2">
              <v-card class="pa-3" variant="tonal" :color="k.color">
                <div class="text-caption text-medium-emphasis">{{ k.label }}</div>
                <div class="text-h6 font-weight-bold">{{ k.value }}</div>
              </v-card>
            </v-col>
          </v-row>
          <v-data-table
            :headers="orderHeaders"
            :items="oc?.ordersByChannel || []"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
          >
            <template #[`item.totalOrderValue`]="{ item }">{{ fmt(item.totalOrderValue) }}</template>
            <template #[`item.returnPercentage`]="{ item }">{{ item.returnPercentage }}%</template>
            <template #no-data>لا توجد طلبات ضمن النطاق المحدد.</template>
          </v-data-table>
        </v-window-item>

        <!-- 2. المبيعات الأونلاين -->
        <v-window-item v-if="onlineOn" value="sales">
          <div class="text-subtitle-2 mb-2">المبيعات حسب القناة</div>
          <v-data-table
            :headers="salesHeaders"
            :items="oc?.salesByChannel || []"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
            class="mb-4"
          >
            <template #[`item.grossSales`]="{ item }">{{ fmt(item.grossSales) }}</template>
            <template #no-data>لا توجد مبيعات أونلاين ضمن النطاق المحدد.</template>
          </v-data-table>
          <div class="text-subtitle-2 mb-2">صافي الإيراد حسب القناة</div>
          <v-data-table
            :headers="revenueHeaders"
            :items="oc?.revenueByChannel || []"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
          >
            <template #[`item.grossSales`]="{ item }">{{ fmt(item.grossSales) }}</template>
            <template #[`item.returns`]="{ item }">{{ fmt(item.returns) }}</template>
            <template #[`item.netRevenue`]="{ item }">{{ fmt(item.netRevenue) }}</template>
            <template #no-data>—</template>
          </v-data-table>
        </v-window-item>

        <!-- 3. الشحنات -->
        <v-window-item v-if="shipOn" value="shipments">
          <v-row dense class="mb-3">
            <v-col v-for="k in shipKpis" :key="k.label" cols="6" sm="4" md="2">
              <v-card class="pa-3" variant="tonal" :color="k.color">
                <div class="text-caption text-medium-emphasis">{{ k.label }}</div>
                <div class="text-h6 font-weight-bold">{{ k.value }}</div>
              </v-card>
            </v-col>
          </v-row>
          <div class="text-subtitle-2 mb-2">حسب الحالة</div>
          <div class="d-flex flex-wrap gap-2 mb-4">
            <v-chip
              v-for="s in del?.byStatus || []"
              :key="s.status"
              :color="statusMeta(s.status).color"
              variant="tonal"
            >
              <v-icon start size="16">{{ statusMeta(s.status).icon }}</v-icon>
              {{ statusMeta(s.status).label }}: {{ s.count }}
            </v-chip>
            <span v-if="!(del?.byStatus || []).length" class="text-medium-emphasis">لا توجد شحنات.</span>
          </div>
          <div class="text-subtitle-2 mb-2">تكاليف الشحن (حسب العملة)</div>
          <v-row dense>
            <v-col v-for="c in del?.costByCurrency || []" :key="c.currency" cols="12" sm="6" md="4">
              <v-card variant="outlined" class="pa-3">
                <div class="text-caption text-medium-emphasis">{{ c.currency }}</div>
                <div class="text-h6 font-weight-bold">{{ money(c.totalFee) }} {{ c.currency }}</div>
                <div class="text-caption">عدد الشحنات: {{ c.count }} · التحصيل: {{ money(c.totalCod) }}</div>
              </v-card>
            </v-col>
            <v-col v-if="!(del?.costByCurrency || []).length" cols="12">
              <span class="text-medium-emphasis">لا توجد بيانات تكلفة ضمن النطاق المحدد.</span>
            </v-col>
          </v-row>
        </v-window-item>

        <!-- 4. المرتجعات -->
        <v-window-item v-if="onlineOn || shipOn" value="returns">
          <v-row dense class="mb-3">
            <v-col v-if="onlineOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="orange-darken-3">
                <div class="text-caption text-medium-emphasis">طلبات مرتجعة</div>
                <div class="text-h6 font-weight-bold">{{ ordersSummary.returned }}</div>
              </v-card>
            </v-col>
            <v-col v-if="onlineOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="error">
                <div class="text-caption text-medium-emphasis">نسبة إرجاع الطلبات</div>
                <div class="text-h6 font-weight-bold">{{ ordersSummary.returnPercentage }}%</div>
              </v-card>
            </v-col>
            <v-col v-if="shipOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="orange-darken-3">
                <div class="text-caption text-medium-emphasis">شحنات راجعة</div>
                <div class="text-h6 font-weight-bold">{{ delSummary.returned }}</div>
              </v-card>
            </v-col>
            <v-col v-if="shipOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="error">
                <div class="text-caption text-medium-emphasis">نسبة إرجاع الشحن</div>
                <div class="text-h6 font-weight-bold">{{ delSummary.returnRate }}%</div>
              </v-card>
            </v-col>
          </v-row>
          <div v-if="onlineOn" class="text-subtitle-2 mb-2">المرتجعات حسب القناة</div>
          <v-data-table
            v-if="onlineOn"
            :headers="returnHeaders"
            :items="oc?.ordersByChannel || []"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
          >
            <template #[`item.returnPercentage`]="{ item }">{{ item.returnPercentage }}%</template>
            <template #no-data>—</template>
          </v-data-table>
        </v-window-item>

        <!-- 5. شركات النقل -->
        <v-window-item v-if="shipOn" value="carriers">
          <div class="text-subtitle-2 mb-2">الأداء حسب شركة النقل</div>
          <v-data-table
            :headers="providerHeaders"
            :items="del?.byProvider || []"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
            class="mb-4"
          >
            <template #[`item.successRate`]="{ item }">{{ item.successRate }}%</template>
            <template #[`item.returnRate`]="{ item }">{{ item.returnRate }}%</template>
            <template #no-data>لا توجد بيانات.</template>
          </v-data-table>
          <div class="text-subtitle-2 mb-2">الشحنات المتأخرة</div>
          <v-data-table
            :headers="lateHeaders"
            :items="del?.lateShipments || []"
            :items-per-page="10"
            density="comfortable"
          >
            <template #[`item.status`]="{ item }">
              <v-chip :color="statusMeta(item.status).color" size="small" variant="tonal">
                {{ statusMeta(item.status).label }}
              </v-chip>
            </template>
            <template #[`item.createdAt`]="{ item }">{{ fmtDate(item.createdAt) }}</template>
            <template #no-data>لا توجد شحنات متأخرة 🎉</template>
          </v-data-table>
        </v-window-item>

        <!-- 6. الأداء والتحصيل -->
        <v-window-item v-if="onlineOn || shipOn" value="performance">
          <v-row dense class="mb-3">
            <v-col v-if="shipOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="teal">
                <div class="text-caption text-medium-emphasis">نسبة نجاح التوصيل</div>
                <div class="text-h6 font-weight-bold">{{ delSummary.successRate }}%</div>
              </v-card>
            </v-col>
            <v-col v-if="shipOn" cols="6" sm="4" md="3">
              <v-card class="pa-3" variant="tonal" color="error">
                <div class="text-caption text-medium-emphasis">نسبة إرجاع الشحن</div>
                <div class="text-h6 font-weight-bold">{{ delSummary.returnRate }}%</div>
              </v-card>
            </v-col>
          </v-row>

          <div v-if="shipOn" class="text-subtitle-2 mb-2">صافي التحصيل (حسب العملة)</div>
          <v-row v-if="shipOn" dense class="mb-4">
            <v-col v-for="c in del?.costByCurrency || []" :key="c.currency" cols="12" sm="6" md="4">
              <v-card variant="outlined" class="pa-3">
                <div class="text-caption text-medium-emphasis">{{ c.currency }}</div>
                <div class="text-h6 font-weight-bold">{{ money(netCollection(c)) }} {{ c.currency }}</div>
                <div class="text-caption">التحصيل: {{ money(c.totalCod) }} · رسوم الشحن: {{ money(c.totalFee) }}</div>
              </v-card>
            </v-col>
            <v-col v-if="!(del?.costByCurrency || []).length" cols="12">
              <span class="text-medium-emphasis">لا توجد بيانات تحصيل ضمن النطاق المحدد.</span>
            </v-col>
          </v-row>

          <template v-if="onlineOn">
            <div class="text-subtitle-2 mb-2">الأرباح حسب القناة</div>
            <v-alert v-if="ocStore.profitDenied" type="info" variant="tonal" density="comfortable">
              تقرير الأرباح غير متاح لصلاحيتك.
            </v-alert>
            <v-data-table
              v-else
              :headers="profitHeaders"
              :items="ocStore.profit"
              density="comfortable"
              hide-default-footer
              :items-per-page="-1"
            >
              <template #[`item.netRevenue`]="{ item }">{{ fmt(item.netRevenue) }}</template>
              <template #[`item.cogs`]="{ item }">{{ fmt(item.cogs) }}</template>
              <template #[`item.grossProfit`]="{ item }">
                <span :class="item.grossProfit >= 0 ? 'text-success' : 'text-error'">{{ fmt(item.grossProfit) }}</span>
              </template>
              <template #[`item.margin`]="{ item }">{{ item.margin }}%</template>
              <template #no-data>—</template>
            </v-data-table>
          </template>
        </v-window-item>
      </v-window>
    </v-card>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useOnlineCommerceReportStore } from '@/stores/onlineCommerceReport';
import { useDeliveryReportStore } from '@/stores/deliveryReport';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useInventoryStore } from '@/stores';
import { useUsersStore } from '@/stores/users';
import { useAuthStore } from '@/stores/auth';
import { statusMeta, DELIVERY_STATUS_META } from '@/constants/delivery';
import { ORDER_STATUSES, statusMeta as orderStatusMeta } from '@/constants/orders';
import PageHeader from '@/components/PageHeader.vue';

const ocStore = useOnlineCommerceReportStore();
const delStore = useDeliveryReportStore();
const channelStore = useSalesChannelStore();
const providerStore = useDeliveryProviderStore();
const inventoryStore = useInventoryStore();
const usersStore = useUsersStore();
const authStore = useAuthStore();

// Per-feature gating: a tab — and its API call — only exists when its feature
// is enabled AND the user holds the matching report permission. The route is
// reachable when EITHER side qualifies; requiring the permission too means we
// never fire an endpoint that would 403 for a partial-permission user.
const onlineOn = computed(
  () => authStore.hasFeature('onlineOrders') && authStore.hasPermission('online_commerce_reports:read')
);
const shipOn = computed(
  () => authStore.hasFeature('shipping') && authStore.hasPermission('delivery_reports:view')
);

const filters = reactive({
  dateFrom: null,
  dateTo: null,
  branchId: null,
  channelId: null,
  providerId: null,
  status: null, // shipment status
  orderStatus: null, // online-order status
  userId: null,
});

const tab = ref('orders');

const oc = computed(() => ocStore.overview);
const del = computed(() => delStore.overview);
const loading = computed(() => ocStore.loading || delStore.loading);

const ordersSummary = computed(
  () => oc.value?.ordersSummary || { delivered: 0, returned: 0, returnPercentage: 0 }
);
const delSummary = computed(
  () => del.value?.summary || { total: 0, delivered: 0, returned: 0, cancelled: 0, lateCount: 0, successRate: 0, returnRate: 0 }
);

// ── pickers ────────────────────────────────────────────────────────────────
const channelItems = computed(() => channelStore.channels);
const providerItems = computed(() => providerStore.providers.map((p) => ({ title: p.name, value: p.id })));
const branchItems = computed(() => inventoryStore.branches || []);
const statusItems = Object.entries(DELIVERY_STATUS_META).map(([value, m]) => ({ title: m.label, value }));
const orderStatusItems = ORDER_STATUSES.map((s) => ({ title: orderStatusMeta(s).label, value: s }));
const userItems = computed(() =>
  (usersStore.list || []).map((u) => ({ title: u.fullName || u.username, value: u.id }))
);

// ── tabs (feature-aware) ─────────────────────────────────────────────────────
const tabs = computed(() => {
  const list = [];
  if (onlineOn.value) {
    list.push({ value: 'orders', title: 'ملخص الطلبات الأونلاين', icon: 'mdi-cart-outline' });
    list.push({ value: 'sales', title: 'المبيعات الأونلاين', icon: 'mdi-receipt-text-outline' });
  }
  if (shipOn.value) list.push({ value: 'shipments', title: 'الشحنات', icon: 'mdi-truck-fast' });
  if (onlineOn.value || shipOn.value) list.push({ value: 'returns', title: 'المرتجعات', icon: 'mdi-backup-restore' });
  if (shipOn.value) list.push({ value: 'carriers', title: 'شركات النقل', icon: 'mdi-truck-outline' });
  if (onlineOn.value || shipOn.value)
    list.push({ value: 'performance', title: 'الأداء والتحصيل', icon: 'mdi-finance' });
  return list;
});

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};
const netCollection = (c) => (Number(c.totalCod) || 0) - (Number(c.totalFee) || 0);
const sum = (arr, key) => (arr || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);

// ── combined KPI strip (counts only → currency-safe) ─────────────────────────
const kpis = computed(() => {
  const list = [];
  if (onlineOn.value) {
    list.push({ label: 'الطلبات الأونلاين', value: fmt(sum(oc.value?.ordersByChannel, 'ordersCount')), color: 'primary' });
  }
  if (shipOn.value) {
    list.push({ label: 'الشحنات', value: fmt(delSummary.value.total), color: 'indigo' });
    list.push({ label: 'تم التوصيل', value: fmt(delSummary.value.delivered), color: 'success' });
    list.push({ label: 'قيد التوصيل', value: fmt(inTransit.value), color: 'blue' });
    list.push({ label: 'راجعة', value: fmt(delSummary.value.returned), color: 'orange-darken-3' });
    list.push({ label: 'نسبة النجاح', value: `${delSummary.value.successRate ?? 0}%`, color: 'teal' });
  }
  return list;
});

const inTransit = computed(() => {
  const byStatus = del.value?.byStatus || [];
  const inFlight = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'SUBMITTED'];
  return byStatus.filter((s) => inFlight.includes(s.status)).reduce((a, s) => a + (Number(s.count) || 0), 0);
});

const orderKpis = computed(() => [
  { label: 'عدد الطلبات', value: fmt(sum(oc.value?.ordersByChannel, 'ordersCount')), color: 'primary' },
  { label: 'مسلّمة', value: fmt(ordersSummary.value.delivered), color: 'success' },
  { label: 'مرتجعة', value: fmt(ordersSummary.value.returned), color: 'orange-darken-3' },
  { label: 'ملغاة', value: fmt(sum(oc.value?.ordersByChannel, 'cancelled')), color: 'error' },
  { label: 'نسبة الإرجاع', value: `${ordersSummary.value.returnPercentage ?? 0}%`, color: 'amber-darken-3' },
]);

const shipKpis = computed(() => [
  { label: 'إجمالي الشحنات', value: fmt(delSummary.value.total), color: 'primary' },
  { label: 'تم التوصيل', value: fmt(delSummary.value.delivered), color: 'success' },
  { label: 'قيد التوصيل', value: fmt(inTransit.value), color: 'blue' },
  { label: 'راجعة', value: fmt(delSummary.value.returned), color: 'orange-darken-3' },
  { label: 'ملغاة', value: fmt(delSummary.value.cancelled), color: 'error' },
  { label: 'متأخرة', value: fmt(delSummary.value.lateCount), color: 'amber-darken-3' },
]);

// ── table headers (reused from the original per-domain pages) ─────────────────
const orderHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'عدد الطلبات', key: 'ordersCount' },
  { title: 'قيمة الطلبات', key: 'totalOrderValue' },
  { title: 'مسلّمة', key: 'delivered' },
  { title: 'مرتجعة', key: 'returned' },
  { title: 'ملغاة', key: 'cancelled' },
  { title: 'نسبة الإرجاع', key: 'returnPercentage' },
];
const salesHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'عدد الفواتير', key: 'salesCount' },
  { title: 'إجمالي المبيعات', key: 'grossSales' },
];
const revenueHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'المبيعات', key: 'grossSales' },
  { title: 'المرتجعات', key: 'returns' },
  { title: 'صافي الإيراد', key: 'netRevenue' },
];
const returnHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'عدد الطلبات', key: 'ordersCount' },
  { title: 'مرتجعة', key: 'returned' },
  { title: 'نسبة الإرجاع', key: 'returnPercentage' },
];
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
const profitHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'صافي الإيراد', key: 'netRevenue' },
  { title: 'الكلفة', key: 'cogs' },
  { title: 'الربح', key: 'grossProfit' },
  { title: 'الهامش', key: 'margin' },
];

// ── load ─────────────────────────────────────────────────────────────────────
// Push shared filters into each store, then fetch ONLY the stores whose feature
// is enabled — a disabled feature never fires its (403-gated) API call.
function syncFilters() {
  Object.assign(ocStore.filters, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    channelId: filters.channelId,
    branchId: filters.branchId,
    status: filters.orderStatus,
    userId: filters.userId,
  });
  Object.assign(delStore.filters, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    providerId: filters.providerId,
    status: filters.status,
  });
}

async function load() {
  syncFilters();
  const jobs = [];
  if (onlineOn.value) jobs.push(ocStore.fetchAll().catch(() => {}));
  if (shipOn.value) jobs.push(delStore.fetchOverview().catch(() => {}));
  await Promise.all(jobs);
}

onMounted(() => {
  // Default the active tab to the first available one for this user's features.
  tab.value = tabs.value[0]?.value || 'orders';
  load();
  if (onlineOn.value && !channelStore.channels.length) {
    channelStore.fetchChannels({ page: 1, limit: 100 });
  }
  if (shipOn.value) providerStore.fetchProviders({ optional: true });
  // Best-effort: populate the branch picker (no-op / silent if unavailable).
  if (!branchItems.value.length) inventoryStore.fetchBranches?.().catch(() => {});
  // User filter (online tabs) — only when the viewer may read users.
  if (onlineOn.value && authStore.hasPermission('users:read') && !usersStore.list.length) {
    usersStore.fetch().catch(() => {});
  }
});
</script>
