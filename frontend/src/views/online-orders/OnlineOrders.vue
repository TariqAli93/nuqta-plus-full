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
          <v-chip
            v-if="item.channelName"
            size="small"
            variant="tonal"
            :color="item.channelColor || undefined"
          >
            <v-icon start size="14">{{
              `mdi-${item.channelIcon}` || 'mdi-bullhorn-variant'
            }}</v-icon>
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
          <v-menu v-if="allowedNext(item.status).length">
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
                <v-icon end size="14">mdi-chevron-down</v-icon>
              </v-chip>
            </template>
            <v-list density="compact">
              <v-list-subheader>نقل الطلب إلى</v-list-subheader>
              <v-list-item
                v-for="s in allowedNext(item.status)"
                :key="s"
                @click="onStatusPick(item, s)"
              >
                <template #prepend>
                  <v-icon :color="statusMeta(s).color" size="18">{{ statusMeta(s).icon }}</v-icon>
                </template>
                <v-list-item-title>{{ statusMeta(s).label }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-chip v-else :color="statusMeta(item.status).color" size="small" variant="flat">
            <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
            {{ statusMeta(item.status).label }}
          </v-chip>
        </template>

        <template #[`item.paymentStatus`]="{ item }">
          <v-chip
            v-if="isSaleBacked(item.status) || item.status === 'RETURNED'"
            :color="paymentMeta(item.paymentStatus).color"
            size="small"
            variant="tonal"
          >
            <v-icon start size="14">{{ paymentMeta(item.paymentStatus).icon }}</v-icon>
            {{ paymentMeta(item.paymentStatus).label }}
          </v-chip>
          <span v-else class="text-disabled">—</span>
        </template>

        <template #[`item.invoiceNumber`]="{ item }">
          <span v-if="item.convertedInvoiceNumber">{{ item.convertedInvoiceNumber }}</span>
          <span v-else class="text-disabled">—</span>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="canOpenInvoice(item)"
            icon="mdi-receipt-text-arrow-right"
            size="small"
            variant="text"
            color="success"
            title="فتح الفاتورة"
            @click="openInvoice(item)"
          />
          <v-btn
            v-if="canReturn(item)"
            icon="mdi-keyboard-return"
            size="small"
            variant="text"
            color="orange-darken-3"
            title="إرجاع الطلب"
            @click="openReturn(item)"
          />
          <BoxyShipmentButton v-if="canSendToShipping(item)" :order="item" />
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
                <CustomerSelector
                  v-model="formData.customerId"
                  @customer-selected="onCustomerSelected"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.customerName"
                  label="اسم المستلم *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم المستلم مطلوب']"
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
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.branchId"
                  :items="branchItems"
                  item-title="name"
                  item-value="id"
                  label="الفرع"
                  variant="outlined"
                  density="comfortable"
                  clearable
                  hint="يُخصم منه المخزون عند التأكيد"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.warehouseId"
                  :items="warehouseItems"
                  item-title="name"
                  item-value="id"
                  label="المخزن"
                  variant="outlined"
                  density="comfortable"
                  clearable
                  hint="يحدد المخزون المتاح لكل منتج"
                  persistent-hint
                  @update:model-value="onWarehouseChange"
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
                      :item-props="productItemProps"
                      :loading="productLoading"
                      no-filter
                      hide-details
                      variant="plain"
                      clearable
                      placeholder="ابحث عن منتج"
                      :menu-props="{ maxHeight: 320 }"
                      @update:search="onProductSearch"
                      @focus="onProductFocus"
                      @update:model-value="(val) => onProductSelected(item, val)"
                    >
                      <template #no-data>
                        <div class="px-3 py-2 text-caption text-medium-emphasis">
                          {{ productLoading ? 'جارٍ البحث…' : 'اكتب اسم المنتج للبحث' }}
                        </div>
                      </template>
                      <template #append-item>
                        <div
                          v-if="productHasMore"
                          v-intersect="onProductIntersect"
                          class="px-3 py-2 text-center text-caption text-medium-emphasis"
                        >
                          {{ productLoading ? 'جارٍ التحميل…' : 'مرّر لتحميل المزيد' }}
                        </div>
                      </template>
                    </v-autocomplete>
                  </td>
                  <td>
                    <v-text-field
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      :max="item.availableStock != null ? item.availableStock : undefined"
                      :rules="quantityRules(item)"
                      :hint="
                        item.productId && item.availableStock != null
                          ? `المتاح: ${item.availableStock}`
                          : ''
                      "
                      persistent-hint
                      variant="plain"
                      density="compact"
                      hide-details="auto"
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
                    <v-btn
                      icon="mdi-close"
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="removeItem(idx)"
                    />
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
          <v-btn color="primary" variant="elevated" :loading="saving" @click="handleSubmit"
            >حفظ</v-btn
          >
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

          <!-- Linked invoice (الفاتورة المرتبطة) -->
          <div v-if="!historyLoading && historyOrder" class="mb-4">
            <div class="text-subtitle-2 mb-2">الفاتورة المرتبطة</div>
            <div v-if="historyOrder.convertedSaleId" class="d-flex align-center flex-wrap gap-2">
              <v-chip color="success" size="small" variant="tonal">
                <v-icon start size="14">mdi-receipt-text-check</v-icon>
                {{ historyOrder.convertedInvoiceNumber }}
              </v-chip>
              <v-chip
                :color="paymentMeta(historyOrder.paymentStatus).color"
                size="small"
                variant="tonal"
              >
                <v-icon start size="14">{{ paymentMeta(historyOrder.paymentStatus).icon }}</v-icon>
                {{ paymentMeta(historyOrder.paymentStatus).label }}
              </v-chip>
              <v-spacer />
              <v-btn
                v-if="can('online_orders:open_invoice')"
                color="success"
                variant="tonal"
                size="small"
                prepend-icon="mdi-receipt-text-arrow-right"
                @click="openInvoice(historyOrder)"
              >
                فتح الفاتورة
              </v-btn>
            </div>
            <v-alert v-else type="info" variant="tonal" density="compact">
              لا توجد فاتورة مرتبطة بهذا الطلب
            </v-alert>
          </div>

          <!-- Send to shipping company (إرسال إلى شركة الشحن) -->
          <div
            v-if="
              !historyLoading &&
              historyOrder &&
              canSendToShipping(historyOrder) &&
              !hasActiveShipment
            "
            class="mb-4"
          >
            <BoxyShipmentButton :order="historyOrder" @created="onShipmentCreated" />
          </div>

          <!-- Already shipped → block duplicate send, offer permissioned resend.
               Resend opens the same carrier picker (same or different company). -->
          <div v-if="!historyLoading && historyOrder && hasActiveShipment" class="mb-4">
            <v-alert type="info" variant="tonal" density="compact" class="mb-2">
              تم إرسال هذا الطلب إلى شركة الشحن مسبقاً
            </v-alert>
            <BoxyShipmentButton
              v-if="can('online_orders:resend_to_shipping')"
              :order="historyOrder"
              resend
              @created="onShipmentCreated"
            />
          </div>

          <!-- Boxy shipment status panel (renders only when a shipment exists) -->
          <BoxyShipmentPanel
            v-if="!historyLoading && historyOrder"
            :key="historyOrder.id"
            :order="historyOrder"
          />

          <div v-if="!historyLoading" class="text-subtitle-2 mt-2 mb-2">سجل الحالات</div>
          <v-timeline
            v-if="!historyLoading && historyItems.length"
            side="end"
            align="start"
            density="compact"
          >
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
                <span class="text-caption text-medium-emphasis">{{
                  formatDateTime(h.createdAt)
                }}</span>
              </div>
              <div v-if="h.note" class="text-caption mt-1">{{ h.note }}</div>
              <div v-if="h.changedByName" class="text-caption text-medium-emphasis">
                بواسطة: {{ h.changedByName }}
              </div>
            </v-timeline-item>
          </v-timeline>
          <div v-else-if="!historyLoading" class="text-center text-medium-emphasis py-6">
            لا يوجد سجل
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="historyDialog = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm order → creates the linked sale, deducts stock, records payment -->
    <v-dialog v-model="confirmDialog" max-width="480">
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="info">mdi-check-circle-outline</v-icon>
          <span>تأكيد الطلب</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-alert type="info" variant="tonal" density="comfortable" class="mb-3">
            سيتم إنشاء فاتورة بيع وخصم الكميات من المخزون. تأكد من توفر الكمية.
          </v-alert>
          <div v-if="selected" class="text-body-2 mb-3">
            الطلب: <strong>{{ selected.orderNumber }}</strong> — الإجمالي:
            <strong>{{ formatAmount(selected.totalAmount) }}</strong>
          </div>
          <v-row dense>
            <v-col cols="7">
              <v-text-field
                v-model.number="confirmPayment.paidAmount"
                type="number"
                min="0"
                label="المبلغ المدفوع (اختياري)"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="5">
              <v-select
                v-model="confirmPayment.paymentMethod"
                :items="[
                  { title: 'نقدي', value: 'cash' },
                  { title: 'بطاقة', value: 'card' },
                ]"
                label="طريقة الدفع"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="confirmDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="confirming" @click="handleConfirm">
            تأكيد وخصم المخزون
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Return (full / partial) -->
    <v-dialog v-model="returnDialog" max-width="560" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="orange-darken-3">mdi-keyboard-return</v-icon>
          <span>إرجاع الطلب {{ selected?.orderNumber || '' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4" style="max-height: 60vh">
          <v-alert type="warning" variant="tonal" density="comfortable" class="mb-3">
            حدّد الكميات المرتجعة. ستُعاد الكميات إلى المخزون وتُخصم من المبيعات والأرباح.
          </v-alert>
          <v-table v-if="returnLines.length" density="compact">
            <thead>
              <tr>
                <th class="text-right">المنتج</th>
                <th style="width: 90px">المُباع</th>
                <th style="width: 120px">المرتجع</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, idx) in returnLines" :key="idx">
                <td>{{ l.productName }}</td>
                <td>{{ l.ordered }}</td>
                <td>
                  <v-text-field
                    v-model.number="l.quantity"
                    type="number"
                    min="0"
                    :max="l.ordered"
                    variant="plain"
                    density="compact"
                    hide-details
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="text-center text-medium-emphasis py-4">
            لا توجد أصناف قابلة للإرجاع.
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <span class="text-caption ms-2">إجمالي المرتجع: {{ returnTotalQty }}</span>
          <v-spacer />
          <v-btn variant="text" @click="returnDialog = false">إلغاء</v-btn>
          <v-btn
            color="orange-darken-3"
            variant="elevated"
            :loading="returning"
            :disabled="returnTotalQty <= 0"
            @click="handleReturn"
          >
            تنفيذ الإرجاع
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="cancelDialog"
      title="إلغاء الطلب"
      :message="
        selected && isSaleBacked(selected.status)
          ? 'سيتم إلغاء الطلب وإلغاء فاتورته وإعادة الكميات إلى المخزون. هل أنت متأكد؟'
          : 'هل أنت متأكد من إلغاء هذا الطلب؟'
      "
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
import { ref, reactive, onMounted, computed } from 'vue';
import { useOnlineOrderStore } from '@/stores/onlineOrder';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { useProductStore } from '@/stores/product';
import { useInventoryStore } from '@/stores';
import { usePermissions } from '@/composables/usePermissions';
import {
  ORDER_STATUS,
  ORDER_STATUSES,
  statusMeta,
  nextStatuses,
  isEditableStatus,
  transitionPermission,
} from '@/constants/orders';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CustomerSelector from '@/components/CustomerSelector.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import PageHeader from '@/components/PageHeader.vue';
import BoxyShipmentButton from '@/components/delivery/BoxyShipmentButton.vue';
import BoxyShipmentPanel from '@/components/delivery/BoxyShipmentPanel.vue';
import { useRouter } from 'vue-router';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { useNotificationStore } from '@/stores/notification';

const orderStore = useOnlineOrderStore();
const channelStore = useSalesChannelStore();
const productStore = useProductStore();
const inventoryStore = useInventoryStore();
const shipmentStore = useDeliveryShipmentStore();
const notify = useNotificationStore();
const router = useRouter();
const { can } = usePermissions();

// Payment status (الدفع) display metadata — derived on the backend from the
// linked sale's totals.
const PAYMENT_STATUS_META = {
  UNPAID: { label: 'غير مدفوع', color: 'error', icon: 'mdi-cash-remove' },
  PARTIAL: { label: 'مدفوع جزئياً', color: 'warning', icon: 'mdi-cash-clock' },
  PAID: { label: 'مدفوع بالكامل', color: 'success', icon: 'mdi-cash-check' },
  REFUNDED: { label: 'مسترجع', color: 'orange-darken-3', icon: 'mdi-cash-refund' },
};
const paymentMeta = (s) =>
  PAYMENT_STATUS_META[s] || { label: '—', color: 'grey', icon: 'mdi-cash' };

// Statuses in which a linked sale exists → eligible for payment/return display.
const SALE_BACKED = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.READY_FOR_DELIVERY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];
const isSaleBacked = (status) => SALE_BACKED.includes(status);

// Per-transition permission gating for the status menu.
const allowedNext = (status) => nextStatuses(status).filter((s) => can(transitionPermission(s)));

const canReturn = (item) =>
  !!item.convertedInvoiceNumber && isSaleBacked(item.status) && can('online_orders:return');

// ── Linked invoice ──────────────────────────────────────────────────────────
// The sale lives in the sales table; the order exposes it as convertedSaleId.
// The button is gated by the dedicated permission, and the SaleDetails page
// itself still enforces view:sales (router + backend).
const canOpenInvoice = (item) => !!item?.convertedSaleId && can('online_orders:open_invoice');

const openInvoice = (item) => {
  if (!item?.convertedSaleId) {
    notify.error('لا توجد فاتورة مرتبطة بهذا الطلب');
    return;
  }
  router.push({ name: 'SaleDetails', params: { id: item.convertedSaleId } });
};

// ── Send to shipping company ─────────────────────────────────────────────────
// Order must carry a name, phone and address before it can be shipped.
const hasValidShippingData = (item) =>
  !!(item?.customerName?.trim() && item?.customerPhone?.trim() && item?.customerAddress?.trim());

// The shipping button shows for a confirmed/ready order that has a linked
// invoice, valid recipient data, and the send permission. The carrier is chosen
// in the dialog (which shows the active providers, or an "enable a carrier"
// message when none exist).
const SHIPPABLE_STATUSES = [ORDER_STATUS.CONFIRMED, ORDER_STATUS.READY_FOR_DELIVERY];
const canSendToShipping = (item) =>
  SHIPPABLE_STATUSES.includes(item?.status) &&
  !!item?.convertedSaleId &&
  hasValidShippingData(item) &&
  can('online_orders:send_to_shipping');

// ── Existing shipment (gates resend / duplicate prevention in the dialog) ─────
const DELIVERY_TERMINAL = ['DELIVERED', 'RETURNED', 'CANCELLED', 'FAILED'];
const orderShipment = ref(null); // newest shipment for the order open in details
const hasActiveShipment = computed(
  () => !!orderShipment.value && !DELIVERY_TERMINAL.includes(orderShipment.value.status)
);

const dialog = ref(false);
const deleteDialog = ref(false);
const cancelDialog = ref(false);

// Return (full / partial) of a confirmed order.
const returnDialog = ref(false);
const returning = ref(false);
const returnLines = ref([]); // [{ productId, productName, ordered, quantity }]
const historyDialog = ref(false);
const historyLoading = ref(false);
const historyOrder = ref(null);
const form = ref(null);
const saving = ref(false);
const selected = ref(null);

// Confirm-with-payment (creates the linked sale + deducts stock).
const confirmDialog = ref(false);
const confirming = ref(false);
const confirmPayment = reactive({
  paidAmount: selected.value?.totalAmount || 0,
  paymentMethod: 'cash',
});

const historyItems = computed(() => historyOrder.value?.history || []);

// A non-terminal order (one whose workflow still allows CANCELLED) can be
// cancelled — and the user must hold the cancel permission.
const canCancel = (status) =>
  nextStatuses(status).includes(ORDER_STATUS.CANCELLED) && can('online_orders:cancel');

const emptyForm = () => ({
  channelId: null,
  customerId: null,
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  province: '',
  notes: '',
  branchId: inventoryStore.selectedBranchId || null,
  warehouseId: inventoryStore.selectedWarehouseId || null,
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

  { title: 'الدفع', key: 'paymentStatus', sortable: false },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const branchItems = computed(() => inventoryStore.branches || []);
const warehouseItems = computed(() => inventoryStore.warehouses || []);

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
const PRODUCT_PAGE_SIZE = 20;
const searchResults = ref([]);
const selectedProducts = ref({}); // id → { id, name, sellingPrice, sku }
const productLoading = ref(false);
// Server-side pagination for the autocomplete (infinite scroll).
const productQuery = ref('');
const productPage = ref(1);
const productTotalPages = ref(1);
const productHasMore = computed(() => productPage.value < productTotalPages.value);

const productOptions = computed(() => {
  const map = new Map();
  Object.values(selectedProducts.value).forEach((p) => map.set(p.id, p));
  searchResults.value.forEach((p) => map.set(p.id, p));
  return [...map.values()];
});

// Available stock for a product option: per-warehouse when a warehouse is
// selected (the figure the confirm/oversell guard checks against), otherwise
// the total across warehouses.
const availableStockOf = (p) => {
  if (!p) return 0;
  if (formData.value.warehouseId && p.warehouseStock != null) {
    return Number(p.warehouseStock) || 0;
  }
  return Number(p.totalStock ?? p.stock ?? 0);
};

// Render each option with its available stock and disable out-of-stock items
// when a warehouse is selected (can't be ordered against that warehouse).
const productItemProps = (p) => {
  const scoped = !!formData.value.warehouseId;
  const stock = availableStockOf(p);
  return {
    title: p.name,
    value: p.id,
    subtitle: scoped ? `المتاح: ${stock}` : `المخزون: ${stock}`,
    disabled: scoped && stock <= 0,
  };
};

// Line-quantity rule: cap at the available stock when a warehouse is selected
// (matches the backend SALE_STOCK_VALIDATION oversell guard on confirm).
const quantityRules = (item) => [
  (v) => {
    const qty = Number(v) || 0;
    if (qty < 1) return 'الكمية يجب أن تكون 1 على الأقل';
    if (!formData.value.warehouseId || !item.productId || item.availableStock == null) return true;
    return qty <= item.availableStock || `الكمية المتاحة: ${item.availableStock}`;
  },
];

// Fetch a page of products. `append` keeps prior results (infinite scroll),
// otherwise the list is reset for a fresh query. An empty query loads the
// default first page so the menu shows options immediately on focus.
const fetchProductList = async (q = '', { append = false } = {}) => {
  if (productLoading.value) return;
  const page = append ? productPage.value + 1 : 1;
  productLoading.value = true;
  try {
    const params = { page, limit: PRODUCT_PAGE_SIZE };
    if (q) params.search = q;
    // Scope stock to the selected warehouse so `warehouseStock` is populated.
    if (formData.value.warehouseId) params.warehouseId = formData.value.warehouseId;
    const res = await productStore.fetch(params, { silent: true });
    const list = Array.isArray(res?.data) ? res.data : [];
    const mapped = list.map((p) => ({
      id: p.id,
      name: p.name,
      sellingPrice: p.sellingPrice,
      sku: p.sku,
      warehouseStock: p.warehouseStock,
      totalStock: p.totalStock ?? p.stock,
    }));
    searchResults.value = append ? [...searchResults.value, ...mapped] : mapped;
    productQuery.value = q;
    productPage.value = Number(res?.meta?.page) || page;
    productTotalPages.value = Number(res?.meta?.totalPages) || productPage.value;
  } catch {
    // keep previous results
  } finally {
    productLoading.value = false;
  }
};

let productSearchTimer = null;
const onProductSearch = (term) => {
  clearTimeout(productSearchTimer);
  const q = (term || '').trim();
  // Ignore search events echoing the current query (e.g. after selection) to
  // avoid clobbering the loaded pages.
  if (q === productQuery.value && searchResults.value.length) return;
  productSearchTimer = setTimeout(() => fetchProductList(q), 300);
};

// Preload a default list on focus so the dropdown isn't empty before typing.
const onProductFocus = () => {
  if (!searchResults.value.length) fetchProductList('');
};

// Infinite scroll: load the next page when the sentinel scrolls into view.
const onProductIntersect = (isIntersecting) => {
  if (isIntersecting && productHasMore.value && !productLoading.value) {
    fetchProductList(productQuery.value, { append: true });
  }
};

// Re-read available stock for the already-selected lines against the current
// warehouse (used on warehouse change and when editing an existing order).
const refreshLineStock = async () => {
  const lines = formData.value.items.filter((it) => it.productId);
  if (!lines.length) return;
  try {
    const params = { limit: 1000 };
    if (formData.value.warehouseId) params.warehouseId = formData.value.warehouseId;
    const res = await productStore.fetch(params, { silent: true });
    const byId = new Map((Array.isArray(res?.data) ? res.data : []).map((p) => [p.id, p]));
    const nextSelected = { ...selectedProducts.value };
    for (const it of lines) {
      const p = byId.get(it.productId);
      if (!p) continue;
      const opt = {
        id: p.id,
        name: p.name,
        sellingPrice: p.sellingPrice,
        sku: p.sku,
        warehouseStock: p.warehouseStock,
        totalStock: p.totalStock ?? p.stock,
      };
      nextSelected[p.id] = opt;
      it.availableStock = availableStockOf(opt);
    }
    selectedProducts.value = nextSelected;
  } catch {
    // ignore — the backend still enforces stock on confirm
  }
};

// Switching warehouse changes the available figures: reset the search pool so
// the next search/scroll is scoped to it, and refresh caps on existing lines.
const onWarehouseChange = () => {
  searchResults.value = [];
  productQuery.value = '';
  productPage.value = 1;
  productTotalPages.value = 1;
  refreshLineStock();
};

const onProductSelected = (item, productId) => {
  const p = productOptions.value.find((x) => x.id === productId);
  if (!p) {
    // cleared selection
    item.productId = null;
    item.productName = '';
    item.availableStock = null;
    return;
  }
  item.productId = p.id;
  item.productName = p.name;
  item.productSku = p.sku || null;
  item.unitPrice = Number(p.sellingPrice) || 0;
  item.availableStock = availableStockOf(p);
  // Don't let a pre-filled quantity exceed what's available in the warehouse.
  if (formData.value.warehouseId && Number(item.quantity) > item.availableStock) {
    item.quantity = item.availableStock > 0 ? item.availableStock : 1;
  }
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
  productQuery.value = '';
  productPage.value = 1;
  productTotalPages.value = 1;
};

const openDialog = (order = null) => {
  if (order) {
    selected.value = order;
    // Load full order (with items) for editing.
    orderStore.fetchOrder(order.id).then((full) => {
      formData.value = {
        channelId: full.channelId,
        customerId: full.customerId ?? null,
        customerName: full.customerName ?? '',
        customerPhone: full.customerPhone ?? '',
        customerAddress: full.customerAddress ?? '',
        province: full.province ?? '',
        notes: full.notes ?? '',
        branchId: full.branchId ?? null,
        warehouseId: full.warehouseId ?? null,
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
      // Populate per-warehouse stock caps for the loaded lines.
      refreshLineStock();
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
    customerId: formData.value.customerId || null,
    customerName: formData.value.customerName?.trim(),
    customerPhone: formData.value.customerPhone?.trim() || null,
    customerAddress: formData.value.customerAddress?.trim() || null,
    province: formData.value.province?.trim() || null,
    notes: formData.value.notes?.trim() || null,
    branchId: formData.value.branchId || null,
    warehouseId: formData.value.warehouseId || null,
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

// Status menu dispatcher: CONFIRMED/CANCELLED/RETURNED open dedicated dialogs
// (they have side effects — stock/payment/return); plain fulfilment steps apply
// directly.
const onStatusPick = (order, status) => {
  selected.value = order;
  if (status === ORDER_STATUS.CONFIRMED) {
    // Prefill the paid amount with the order total (full payment by default).
    confirmPayment.paidAmount = Number(order.totalAmount) || 0;
    confirmPayment.paymentMethod = 'cash';
    confirmDialog.value = true;
  } else if (status === ORDER_STATUS.CANCELLED) {
    cancelDialog.value = true;
  } else if (status === ORDER_STATUS.RETURNED) {
    openReturn(order);
  } else {
    changeStatus(order, status);
  }
};

const changeStatus = async (order, status, options = {}) => {
  try {
    await orderStore.changeStatus(order.id, status, options);
  } catch {
    // surfaced via notification store (backend Arabic message, incl. oversell)
  }
};

// Confirm an order → creates the linked sale, deducts stock, records payment.
const handleConfirm = async () => {
  confirming.value = true;
  try {
    await orderStore.changeStatus(selected.value.id, ORDER_STATUS.CONFIRMED, {
      paidAmount: Number(confirmPayment.paidAmount) || 0,
      paymentMethod: confirmPayment.paymentMethod || 'cash',
    });
    confirmDialog.value = false;
    await orderStore.fetchOrders();
  } catch {
    // surfaced via notification store (e.g. الكمية غير كافية)
  } finally {
    confirming.value = false;
  }
};

// ── Returns (full / partial) ────────────────────────────────────────────────
const openReturn = async (order) => {
  selected.value = order;
  returnLines.value = [];
  returnDialog.value = true;
  try {
    const full = await orderStore.fetchOrder(order.id);
    returnLines.value = (full.items || [])
      .filter((it) => it.productId)
      .map((it) => ({
        productId: it.productId,
        productName: it.productName,
        ordered: Number(it.quantity) || 0,
        quantity: Number(it.quantity) || 0, // default to full return
      }));
  } catch {
    // surfaced via notification store
  }
};

const returnTotalQty = computed(() =>
  returnLines.value.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
);

const handleReturn = async () => {
  const items = returnLines.value
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
  if (!items.length) return;
  returning.value = true;
  try {
    await orderStore.returnOrder(selected.value.id, { items });
    returnDialog.value = false;
    await orderStore.fetchOrders();
  } catch {
    // surfaced via notification store
  } finally {
    returning.value = false;
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
  orderShipment.value = null;
  try {
    historyOrder.value = await orderStore.fetchOrder(order.id);
    // Detect an existing shipment (to show "already sent" + gate resend).
    if (can('online_orders:view_shipment')) {
      const list = await shipmentStore.fetchForEntity({ onlineOrderId: order.id });
      orderShipment.value = list[0] || null;
    }
  } catch {
    // surfaced via notification store
  } finally {
    historyLoading.value = false;
  }
};

// Reflect a freshly-created/resent shipment so the dialog flips to "already
// sent" and the panel re-fetches the latest carrier/tracking.
const onShipmentCreated = (shipment) => {
  if (shipment) orderShipment.value = shipment;
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

// Cancelling a confirmed (sale-backed) order reverses the linked sale and
// restores stock; a pre-confirm order is simply marked cancelled.
const confirmCancel = (order) => {
  selected.value = order;
  cancelDialog.value = true;
};
const handleCancel = async () => {
  try {
    await orderStore.changeStatus(selected.value.id, ORDER_STATUS.CANCELLED);
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

// Fill the contact snapshot from a chosen/created customer (اختيار عميل موجود
// أو إنشاء جديد). The fields stay editable for delivery-specific overrides.
const onCustomerSelected = (customer) => {
  if (!customer) return;
  formData.value.customerName = customer.name || formData.value.customerName;
  if (customer.phone) formData.value.customerPhone = customer.phone;
  if (customer.address) formData.value.customerAddress = customer.address;
  if (customer.city && !formData.value.province) formData.value.province = customer.city;
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
  // Branch / warehouse pickers for the create form (best-effort, silent).
  if (!branchItems.value.length) inventoryStore.fetchBranches?.().catch(() => {});
  if (!warehouseItems.value.length) inventoryStore.fetchWarehouses?.().catch(() => {});
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
