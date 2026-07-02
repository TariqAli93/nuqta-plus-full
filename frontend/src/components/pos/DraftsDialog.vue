<template>
  <v-dialog :model-value="modelValue" max-width="640" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title>
        <div class="d-flex align-center ga-2">
          <v-icon size="22">mdi-archive-clock-outline</v-icon>
          <span>المسودات (POS)</span>
          <v-spacer />
          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="draftsLoading"
            title="تحديث"
            @click="emit('loadDrafts')"
          />
        </div>
        <v-text-field
          :model-value="draftsSearch"
          density="comfortable"
          variant="outlined"
          hide-details
          clearable
          placeholder="بحث برقم الفاتورة أو اسم العميل"
          prepend-inner-icon="mdi-magnify"
          class="mt-3"
          @update:model-value="emit('update:draftsSearch', $event)"
        />
      </v-card-title>

      <v-card-text style="min-height: 240px">
        <div v-if="draftsLoading && draftList.length === 0" class="drafts__state">
          <v-progress-circular indeterminate color="primary" />
          <div class="text-medium-emphasis mt-2">جاري التحميل...</div>
        </div>
        <div v-else-if="draftsError" class="drafts__state">
          <v-icon size="40" color="error">mdi-alert-circle-outline</v-icon>
          <div class="text-body-2 mt-2">{{ draftsError }}</div>
          <v-btn
            class="mt-3"
            variant="outlined"
            size="small"
            prepend-icon="mdi-refresh"
            @click="emit('loadDrafts')"
          >
            إعادة المحاولة
          </v-btn>
        </div>
        <div v-else-if="filteredDrafts.length === 0" class="drafts__state">
          <v-icon size="40" class="text-medium-emphasis">mdi-tray-remove</v-icon>
          <div class="text-body-2 text-medium-emphasis mt-2">
            {{ draftsSearch ? 'لا توجد مسودات مطابقة' : 'لا توجد مسودات للـ POS' }}
          </div>
        </div>
        <v-list v-else lines="two" class="bg-transparent">
          <v-list-item
            v-for="draft in filteredDrafts"
            :key="draft.id"
            class="drafts__item mb-2"
            rounded="lg"
          >
            <template #title>
              <div class="d-flex align-center justify-space-between">
                <span class="font-weight-bold">{{ draft.invoiceNumber || `#${draft.id}` }}</span>
                <span class="text-primary font-weight-bold">
                  {{ formatMoney(draft.total, draft.currency) }}
                </span>
              </div>
            </template>
            <template #subtitle>
              <div class="d-flex flex-wrap ga-3 text-caption mt-1">
                <span>
                  <v-icon size="14">mdi-account-outline</v-icon>
                  {{ draft.customer || 'بدون عميل' }}
                </span>
                <span>
                  <v-icon size="14">mdi-package-variant-closed</v-icon>
                  {{ draft.itemCount ?? 0 }} عنصر
                </span>
                <span>
                  <v-icon size="14">mdi-clock-outline</v-icon>
                  {{ formatDraftDate(draft.createdAt) }}
                </span>
              </div>
            </template>
            <template #append>
              <div class="d-flex ga-1">
                <v-btn
                  variant="flat"
                  color="primary"
                  size="small"
                  prepend-icon="mdi-play-circle-outline"
                  :loading="continuingDraftId === draft.id"
                  :disabled="!!continuingDraftId || deletingDraftId === draft.id"
                  @click="emit('continueDraft', draft)"
                >
                  متابعة
                </v-btn>
                <v-btn
                  icon="mdi-trash-can-outline"
                  variant="text"
                  color="error"
                  size="small"
                  :loading="deletingDraftId === draft.id"
                  :disabled="!!continuingDraftId || !!deletingDraftId"
                  @click="emit('askDeleteDraft', draft)"
                />
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { formatCurrency as formatMoney } from '@/utils/formatters';

defineProps({
  modelValue: { type: Boolean, default: false },
  draftsLoading: { type: Boolean, default: false },
  draftList: { type: Array, default: () => [] },
  draftsError: { type: String, default: '' },
  draftsSearch: { type: String, default: '' },
  filteredDrafts: { type: Array, default: () => [] },
  continuingDraftId: { type: [Number, String], default: null },
  deletingDraftId: { type: [Number, String], default: null },
  formatDraftDate: { type: Function, required: true },
});

const emit = defineEmits([
  'update:modelValue',
  'update:draftsSearch',
  'loadDrafts',
  'continueDraft',
  'askDeleteDraft',
]);
</script>
