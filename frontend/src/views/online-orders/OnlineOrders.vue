<template>
  <div class="page-shell">
    <PageHeader
      title="الطلبات الأونلاين"
      subtitle="استقبال الطلبات ومتابعتها قبل إنشاء الفاتورة"
      icon="mdi-package-variant-closed"
    >
      <v-btn
        v-if="can('online_orders:create')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openDialog()"
      >
        طلب جديد
      </v-btn>
    </PageHeader>

    <v-card class="page-section mb-3">
      <v-card-text>
        <div class="d-flex flex-wrap gap-3">
          <v-text-field
            v-model="orderStore.filters.search"
            label="بحث (رقم الطلب / الاسم / الهاتف)"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="min-width: 260px"
            class="flex-grow-1"
            @update:model-value="debouncedFetch"
          />
          <v-select
            v-model="orderStore.filters.status"
            :items="statusFilterItems"
            label="الحالة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 220px"
            @update:model-value="applyFilters"
          />
          <v-select
            v-model="orderStore.filters.channelId"
            :items="channelItems"
            item-title="name"
            item-value="id"
            label="القناة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 220px"
            @update:model-value="applyFilters"
          />
          <v-text-field
            v-model="orderStore.filters.dateFrom"
            type="date"
            label="من تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 180px"
            @update:model-value="applyFilters"
          />
          <v-text-field
            v-model="orderStore.filters.dateTo"
            type="date"
            label="إلى تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 180px"
            @update:model-value="applyFilters"
          />
          <v-btn
            v-if="hasActiveFilters"
            variant="text"
            color="secondary"
            prepend-icon="mdi-filter-remove-outline"
            @click="clearFilters"
          >
            مسح الفلاتر
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="orderStore.orders"
        :loading="orderStore.loading"
        :items-per-page="orderStore.pagination.limit"
        :page="orderStore.pagination.page"
        :items-length="orderStore.pagination.total"
        server-items-length
        density="comfortable"
        hide-default-footer
      >
        <template #[`item.channelName`]="{ item }">
          <v-chip v-if="item.channelName" size="small" variant="tonal" :color="item.channelColor || undefined">
            <v-icon start size="14">{{ item.channelIcon || 'mdi-bullhorn-variant' }}</v-icon>
            {{ item.channelName }}
          </v-chip>
          <span v-else class="text-disabled">—</span>
        </template>

        <template #[`item.customerName`]="{ item }">
          <div class="d-flex flex-column">
            <span>{{ item.customerName }}</span>
            <span v-if="item.customerPhone" class="text-caption text-medium-emphasis">{{
              item.customerPhone
            }}</span>
          </div>
        </template>

        <template #[`item.totalAmount`]="{ item }">
          {{ formatAmount(item.totalAmount) }}
        </template>

        <template #[`item.status`]="{ item }">
          <v-menu v-if="can('online_orders:update_status')">
            <template #activator="{ props }">
              <v-chip
                v-bind="props"
                :color="statusMeta(item.status).color"
                size="small"
                variant="flat"
                class="cursor-pointer"
              >
                <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
                {{ statusMeta(item.status).label }}
                <v-icon v-if="nextStatuses(item.status).length" end size="14">mdi-chevron-down</v-icon>
              </v-chip>
            </template>
            <v-list density="compact">
              <v-list-subheader v-if="nextStatuses(item.status).length">نقل الطلب إلى</v-list-subheader>
              <v-list-item
                v-for="s in nextStatuses(item.status)"
                :key="s"
                @click="changeStatus(item, s)"
              >
                <template #prepend>
                  <v-icon :color="statusMeta(s).color" size="18">{{ statusMeta(s).icon }}</v-icon>
                </template>
                <v-list-item-title>{{ statusMeta(s).label }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!nextStatuses(item.status).length" disabled>
                <v-list-item-title class="text-caption">لا توجد حالات تالية</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-chip
            v-else
            :color="statusMeta(item.status).color"
            size="small"
            variant="flat"
          >
            <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
            {{ statusMeta(item.status).label }}
          </v-chip>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-chip
            v-if="item.convertedInvoiceNumber"
            color="success"
            size="small"
            variant="tonal"
            class="me-1"
            title="تم التحويل إلى فاتورة"
          >
            <v-icon start size="14">mdi-receipt-text-check</v-icon>
            {{ item.convertedInvoiceNumber }}
          </v-chip>
          <v-btn
            v-else-if="canConvert(item.status) && can('online_orders:convert')"
            icon="mdi-file-document-plus-outline"
            size="small"
            variant="text"
            color="success"
            title="إنشاء فاتورة"
            @click="confirmConvert(item)"
          />
          <BoxyShipmentButton :order="item" class="me-1" />
          <v-btn
            icon="mdi-history"
            size="small"
            variant="text"
            title="سجل الحالات"
            @click="openHistory(item)"
          />
          <v-btn
            v-if="can('online_orders:update')"
            icon="mdi-pencil"
            size="small"
            variant="text"
            :disabled="!isEditableStatus(item.status) || !!item.convertedInvoiceNumber"
            title="تعديل"
            @click="openDialog(item)"
          />
          <v-btn
            v-if="canCancel(item.status) && can('online_orders:update_status')"
            icon="mdi-cancel"
            size="small"
            variant="text"
            color="warning"
            title="إلغاء الطلب"
            @click="confirmCancel(item)"
          />
          <v-btn
            v-if="can('online_orders:delete')"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            :disabled="!!item.convertedInvoiceNumber"
            title="حذف"
            @click="confirmDelete(item)"
          />
        </template>
      </v-data-table>

      <PaginationControls
        :pagination="orderStore.pagination"
        @update:page="changePage"
        @update:items-per-page="changeItemsPerPage"
      />
    </v-card>

    <!-- Create / Edit dialog -->
    <v-dialog v-model="dialog" max-width="820" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">{{ isEdit ? 'mdi-pencil' : 'mdi-plus-box' }}</v-icon>
          <span>{{ isEdit ? `تعديل الطلب ${selected?.orderNumber || ''}` : 'طلب جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4" style="max-height: 70vh">
          <v-form ref="form">
            <v-row dense>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.channelId"
                  :items="channelItems"
                  item-title="name"
                  item-value="id"
                  label="القناة *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'القناة مطلوبة']"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.customerName"
                  label="اسم العميل *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم العميل مطلوب']"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.customerPhone"
                  label="رقم الهاتف"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.province"
                  label="المحافظة"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="formData.customerAddress"
                  label="العنوان"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="formData.notes"
                  label="ملاحظات"
                  variant="outlined"
                  density="comfortable"
                  rows="2"
                  auto-grow
                />
              </v-col>
            </v-row>

            <div class="d-flex align-center justify-space-between mt-2 mb-1">
              <span class="text-subtitle-2">المنتجات</span>
              <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addItem">
                إضافة منتج
              </v-btn>
            </div>

            <v-table v-if="formData.items.length" density="compact" class="items-table">
              <thead>
                <tr>
                  <th class="text-right">المنتج</th>
                  <th style="width: 90px">الكمية</th>
                  <th style="width: 130px">السعر</th>
                  <th style="width: 130px">الإجمالي</th>
                  <th style="width: 48px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in formData.items" :key="idx">
                  <td>
                    <v-autocomplete
                      v-model="item.productId"
                      :items="productOptions"
                      item-title="name"
                      item-value="id"
                      :loading="productLoading"
                      no-filter
                      hide-details
                      density="compact"
                      variant="plain"
                      placeholder="ابحث عن منتج"
                      :menu-props="{ maxHeight: 320 }"
                      @update:search="onProductSearch"
                      @update:model-value="(val) => onProductSelected(item, val)"
                    >
                      <template #no-data>
                        <div class="px-3 py-2 text-caption text-medium-emphasis">
                          {{ productLoading ? 'جارٍ البحث…' : 'اكتب اسم المنتج للبحث' }}
                        </div>
                      </template>
                    </v-autocomplete>
                  </td>
                  <td>
                    <v-text-field
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      variant="plain"
                      density="compact"
                      hide-details
                    />
                  </td>
                  <td>
                    <v-text-field
                      v-model.number="item.unitPrice"
                      type="number"
                      min="0"
                      variant="plain"
                      density="compact"
                      hide-details
                    />
                  </td>
                  <td class="text-medium-emphasis">
                    {{ formatAmount(lineTotal(item)) }}
                  </td>
                  <td>
                    <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeItem(idx)" />
                  </td>
                </tr>
              </tbody>
            </v-table>

            <v-text-field
              v-if="!formData.items.length"
              v-model.number="formData.totalAmount"
              label="إجمالي الطلب (يدوي)"
              type="number"
              min="0"
              variant="outlined"
              density="comfortable"
              hint="يُحسب تلقائياً عند إضافة منتجات"
              persistent-hint
              class="mt-2"
            />
          </v-form>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-3">
          <span class="text-subtitle-1 font-weight-bold ms-2">
            الإجمالي: {{ formatAmount(computedTotal) }}
          </span>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="saving" @click="handleSubmit">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Status history timeline -->
    <v-dialog v-model="historyDialog" max-width="680" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-history</v-icon>
          <span>تفاصيل الطلب {{ historyOrder?.orderNumber || '' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4" style="max-height: 70vh">
          <div v-if="historyLoading" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <!-- Boxy shipment status panel (renders only when a shipment exists) -->
          <BoxyShipmentPanel
            v-if="!historyLoading && historyOrder"
            :key="historyOrder.id"
            :order="historyOrder"
          />

          <div v-if="!historyLoading" class="text-subtitle-2 mt-2 mb-2">سجل الحالات</div>
          <v-timeline v-if="!historyLoading && historyItems.length" side="end" align="start" density="compact">
            <v-timeline-item
              v-for="h in historyItems"
              :key="h.id"
              :dot-color="statusMeta(h.toStatus).color"
              :icon="statusMeta(h.toStatus).icon"
              size="small"
            >
              <div class="d-flex justify-space-between align-center gap-2">
                <div>
                  <span v-if="h.fromStatus" class="text-medium-emphasis">
                    {{ statusMeta(h.fromStatus).label }}
                    <v-icon size="14">mdi-arrow-left</v-icon>
                  </span>
                  <strong>{{ statusMeta(h.toStatus).label }}</strong>
                </div>
                <span class="text-caption text-medium-emphasis">{{ formatDateTime(h.createdAt) }}</span>
              </div>
              <div v-if="h.note" class="text-caption mt-1">{{ h.note }}</div>
              <div v-if="h.changedByName" class="text-caption text-medium-emphasis">
                بواسطة: {{ h.changedByName }}
              </div>
            </v-timeline-item>
          </v-timeline>
          <div v-else-if="!historyLoading" class="text-center text-medium-emphasis py-6">لا يوجد سجل</div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="historyDialog = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="convertDialog"
      title="إنشاء فاتورة"
      message="سيتم إنشاء فاتورة بيع من هذا الطلب وخصم الكمية من المخزون. لا يمكن التراجع."
      :details="selected ? `الطلب: ${selected.orderNumber} — الإجمالي: ${formatAmount(selected.totalAmount)}` : ''"
      type="info"
      confirm-text="إنشاء فاتورة"
      cancel-text="إلغاء"
      :loading="converting"
      @confirm="handleConvert"
      @cancel="convertDialog = false"
    />

    <ConfirmDialog
      v-model="cancelDialog"
      title="إلغاء الطلب"
      message="هل أنت متأكد من إلغاء هذا الطلب؟ لن يتم إنشاء أي فاتورة."
      :details="selected ? `الطلب: ${selected.orderNumber}` : ''"
      type="warning"
      confirm-text="إلغاء الطلب"
      cancel-text="تراجع"
      @confirm="handleCancel"
      @cancel="cancelDialog = false"
    />

    <ConfirmDialog
      v-model="deleteDialog"
      title="تأكيد الحذف"
      message="هل أنت متأكد من حذف هذا الطلب؟"
      :details="selected ? `الطلب: ${selected.orderNumber}` : ''"
      type="error"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="handleDelete"
      @cancel="deleteDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useOnlineOrderStore } from '@/stores/onlineOrder';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { useProductStore } from '@/stores/product';
import { usePermissions } from '@/composables/usePermissions';
import {
  ORDER_STATUSES,
  statusMeta,
  nextStatuses,
  isEditableStatus,
} from '@/constants/orders';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import PageHeader from '@/components/PageHeader.vue';
import BoxyShipmentButton from '@/components/delivery/BoxyShipmentButton.vue';
import BoxyShipmentPanel from '@/components/delivery/BoxyShipmentPanel.vue';

const orderStore = useOnlineOrderStore();
const channelStore = useSalesChannelStore();
const productStore = useProductStore();
const { can } = usePermissions();

const dialog = ref(false);
const deleteDialog = ref(false);
const cancelDialog = ref(false);
const convertDialog = ref(false);
const converting = ref(false);
const historyDialog = ref(false);
const historyLoading = ref(false);
const historyOrder = ref(null);
const form = ref(null);
const saving = ref(false);
const selected = ref(null);

const historyItems = computed(() => historyOrder.value?.history || []);

// A non-terminal order (one whose workflow still allows CANCELLED) can be cancelled.
const canCancel = (status) => nextStatuses(status).includes('CANCELLED');

// "Create Invoice" is only offered for CONFIRMED or PROCESSING orders.
const canConvert = (status) => ['CONFIRMED', 'PROCESSING'].includes(status);

const emptyForm = () => ({
  channelId: null,
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  province: '',
  notes: '',
  totalAmount: 0,
  items: [],
});
const formData = ref(emptyForm());

const headers = [
  { title: 'رقم الطلب', key: 'orderNumber' },
  { title: 'القناة', key: 'channelName', sortable: false },
  { title: 'العميل', key: 'customerName' },
  { title: 'المحافظة', key: 'province' },
  { title: 'الإجمالي', key: 'totalAmount' },
  { title: 'الحالة', key: 'status', sortable: false },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const channelItems = computed(() => channelStore.channels.filter((c) => c.isActive !== false));
const statusFilterItems = ORDER_STATUSES.map((s) => ({ title: statusMeta(s).label, value: s }));

const isEdit = computed(() => !!selected.value);

const lineTotal = (item) => (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
const computedTotal = computed(() => {
  if (formData.value.items.length) {
    return formData.value.items.reduce((sum, it) => sum + lineTotal(it), 0);
  }
  return Number(formData.value.totalAmount) || 0;
});

const formatAmount = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

const addItem = () => {
  formData.value.items.push({ productName: '', quantity: 1, unitPrice: 0, productId: null });
};
const removeItem = (idx) => formData.value.items.splice(idx, 1);

// ── Product autocomplete (server search over /products) ─────────────────────
// `selectedProducts` keeps already-picked products in the option pool so their
// labels survive subsequent searches; `searchResults` holds the live query.
const searchResults = ref([]);
const selectedProducts = ref({}); // id → { id, name, sellingPrice, sku }
const productLoading = ref(false);

const productOptions = computed(() => {
  const map = new Map();
  Object.values(selectedProducts.value).forEach((p) => map.set(p.id, p));
  searchResults.value.forEach((p) => map.set(p.id, p));
  return [...map.values()];
});

let productSearchTimer = null;
const onProductSearch = (term) => {
  clearTimeout(productSearchTimer);
  const q = (term || '').trim();
  if (q.length < 1) return;
  productSearchTimer = setTimeout(async () => {
    productLoading.value = true;
    try {
      const res = await productStore.fetch({ search: q, limit: 20 }, { silent: true });
      const list = Array.isArray(res?.data) ? res.data : [];
      searchResults.value = list.map((p) => ({
        id: p.id,
        name: p.name,
        sellingPrice: p.sellingPrice,
        sku: p.sku,
      }));
    } catch {
      // keep previous results
    } finally {
      productLoading.value = false;
    }
  }, 300);
};

const onProductSelected = (item, productId) => {
  const p = productOptions.value.find((x) => x.id === productId);
  if (!p) {
    // cleared selection
    item.productId = null;
    item.productName = '';
    return;
  }
  item.productId = p.id;
  item.productName = p.name;
  item.productSku = p.sku || null;
  item.unitPrice = Number(p.sellingPrice) || 0;
  selectedProducts.value = { ...selectedProducts.value, [p.id]: p };
};

// Seed the option pool from an order's existing items so their names render.
const seedProductOptions = (items) => {
  const seed = {};
  for (const it of items) {
    if (it.productId) {
      seed[it.productId] = {
        id: it.productId,
        name: it.productName,
        sellingPrice: it.unitPrice,
        sku: it.productSku,
      };
    }
  }
  selectedProducts.value = seed;
  searchResults.value = [];
};

const openDialog = (order = null) => {
  if (order) {
    selected.value = order;
    // Load full order (with items) for editing.
    orderStore.fetchOrder(order.id).then((full) => {
      formData.value = {
        channelId: full.channelId,
        customerName: full.customerName ?? '',
        customerPhone: full.customerPhone ?? '',
        customerAddress: full.customerAddress ?? '',
        province: full.province ?? '',
        notes: full.notes ?? '',
        totalAmount: Number(full.totalAmount) || 0,
        items: (full.items || []).map((it) => ({
          productId: it.productId,
          productName: it.productName,
          productSku: it.productSku,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
          notes: it.notes,
        })),
      };
      seedProductOptions(formData.value.items);
    });
  } else {
    selected.value = null;
    formData.value = emptyForm();
    seedProductOptions([]);
  }
  dialog.value = true;
};

const buildPayload = () => {
  const payload = {
    channelId: formData.value.channelId,
    customerName: formData.value.customerName?.trim(),
    customerPhone: formData.value.customerPhone?.trim() || null,
    customerAddress: formData.value.customerAddress?.trim() || null,
    province: formData.value.province?.trim() || null,
    notes: formData.value.notes?.trim() || null,
  };
  if (formData.value.items.length) {
    payload.items = formData.value.items
      .filter((it) => it.productName?.trim())
      .map((it) => ({
        productId: it.productId ?? null,
        productName: it.productName.trim(),
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
      }));
  } else {
    payload.totalAmount = Number(formData.value.totalAmount) || 0;
  }
  return payload;
};

const handleSubmit = async () => {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    if (isEdit.value) {
      await orderStore.updateOrder(selected.value.id, buildPayload());
    } else {
      await orderStore.createOrder(buildPayload());
    }
    dialog.value = false;
  } catch {
    // surfaced via notification store
  } finally {
    saving.value = false;
  }
};

const changeStatus = async (order, status) => {
  try {
    await orderStore.changeStatus(order.id, status);
  } catch {
    // surfaced via notification store
  }
};

const formatDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { hour12: false });
};

const openHistory = async (order) => {
  historyOrder.value = { orderNumber: order.orderNumber, history: [] };
  historyDialog.value = true;
  historyLoading.value = true;
  try {
    historyOrder.value = await orderStore.fetchOrder(order.id);
  } catch {
    // surfaced via notification store
  } finally {
    historyLoading.value = false;
  }
};

const confirmDelete = (order) => {
  selected.value = order;
  deleteDialog.value = true;
};
const handleDelete = async () => {
  try {
    await orderStore.deleteOrder(selected.value.id);
    deleteDialog.value = false;
  } catch {
    // surfaced via notification store
  }
};

// Converting creates a real sale invoice from the order (and deducts stock).
const confirmConvert = (order) => {
  selected.value = order;
  convertDialog.value = true;
};
const handleConvert = async () => {
  converting.value = true;
  try {
    await orderStore.convertOrder(selected.value.id);
    convertDialog.value = false;
    await orderStore.fetchOrders();
  } catch {
    // surfaced via notification store
  } finally {
    converting.value = false;
  }
};

// Cancelling sets the workflow status to CANCELLED — it never creates an invoice.
const confirmCancel = (order) => {
  selected.value = order;
  cancelDialog.value = true;
};
const handleCancel = async () => {
  try {
    await orderStore.changeStatus(selected.value.id, 'CANCELLED');
    cancelDialog.value = false;
  } catch {
    // surfaced via notification store
  }
};

let searchTimer = null;
const debouncedFetch = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applyFilters(), 350);
};
const applyFilters = () => {
  orderStore.pagination.page = 1;
  orderStore.fetchOrders({ page: 1 });
};

const hasActiveFilters = computed(() => {
  const f = orderStore.filters;
  return !!(f.search || f.status || f.channelId || f.dateFrom || f.dateTo);
});
const clearFilters = () => {
  orderStore.filters.search = '';
  orderStore.filters.status = null;
  orderStore.filters.channelId = null;
  orderStore.filters.dateFrom = null;
  orderStore.filters.dateTo = null;
  applyFilters();
};

const changePage = (page) => {
  const pageNum = Number(page);
  if (isNaN(pageNum) || pageNum < 1 || pageNum === orderStore.pagination.page) return;
  orderStore.pagination.page = pageNum;
  orderStore.fetchOrders({ page: pageNum });
};
const changeItemsPerPage = (limit) => {
  orderStore.pagination.limit = Number(limit);
  orderStore.pagination.page = 1;
  orderStore.fetchOrders({ page: 1 });
};

onMounted(() => {
  orderStore.fetchOrders();
  // Channels populate the filter + the new-order form's channel picker. This is
  // an OPTIONAL secondary load gated by `sales_channels:read` (different from the
  // page's `view:online_orders`). Skip the request without it — the global axios
  // interceptor would otherwise toast the 403 before any .catch() could run.
  if (can('sales_channels:read') && !channelStore.channels.length) {
    channelStore.fetchChannels({ page: 1, limit: 100 });
  }
});
</script>

<style scoped>
.items-table :deep(td) {
  vertical-align: middle;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
