<template>
  <div class="payment-method">
    <v-btn-toggle
      v-if="installmentsEnabled"
      :model-value="modelValue"
      color="primary"
      variant="elevated"
      class="payment-method__toggle"
      aria-label="طريقة الدفع"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <v-btn value="cash" prepend-icon="mdi-cash" data-testid="payment-type-cash">نقدي</v-btn>
      <v-btn
        value="installment"
        prepend-icon="mdi-calendar-clock"
        data-testid="payment-type-installment"
      >
        أقساط
      </v-btn>
    </v-btn-toggle>

    <v-btn
      v-else
      :model-value="modelValue"
      variant="elevated"
      prepend-icon="mdi-cash"
      data-testid="payment-type-cash"
      block
      @update:model-value="$emit('update:modelValue', 'cash')"
    >
      نقدي
    </v-btn>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'cash' },
  installmentsEnabled: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);
</script>

<style scoped lang="scss">
.payment-method__toggle {
  width: 100%;
  gap: 10px;

  :deep(.v-btn) {
    flex: 1;
  }
}
</style>
