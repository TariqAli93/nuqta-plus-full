<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card v-if="item" rounded="lg">
      <v-card-title>
        <div>{{ item.name }}</div>
        <div class="text-caption text-medium-emphasis">
          السعر: {{ formatMoney(item.price, currency) }}
        </div>
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-3">
        <v-text-field
          :model-value="groupNumber(draft.discount)"
          :min="0"
          :max="item.price"
          label="خصم / وحدة"
          variant="outlined"
          density="comfortable"
          hide-details
          @update:model-value="emit('updateDraftDiscount', parseAmount($event))"
        />
        <v-text-field
          :model-value="draft.note"
          label="ملاحظة"
          variant="outlined"
          density="comfortable"
          hide-details
          autofocus
          @update:model-value="emit('updateDraftNote', $event)"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" @click="emit('update:modelValue', false)">إلغاء</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="emit('save')">حفظ</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';
import { formatCurrency as formatMoney } from '@/utils/formatters';

defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: null },
  draft: { type: Object, required: true },
  currency: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue', 'updateDraftDiscount', 'updateDraftNote', 'save']);
</script>
