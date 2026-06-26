<template>
  <div class="action-bar">
    <v-btn
      variant="text"
      prepend-icon="mdi-close"
      :disabled="loading"
      aria-label="إلغاء (Esc)"
      @click="$emit('cancel')"
    >
      إلغاء
      <span class="kbd">Esc</span>
    </v-btn>

    <div class="action-bar__spacer" />

    <div v-if="!canSubmit && disabledReasons.length" class="action-bar__reason">
      <v-icon size="16" color="warning">mdi-alert-circle-outline</v-icon>
      {{ disabledReasons[0] }}
    </div>

    <div class="action-bar__total">
      <span class="action-bar__total-label">الإجمالي</span>
      <span class="action-bar__total-value">{{ formatCurrency(total, currency) }}</span>
    </div>

    <v-tooltip :disabled="canSubmit" location="top">
      <template #activator="{ props: tip }">
        <span v-bind="tip">
          <v-btn
            color="primary"
            variant="elevated"
            size="large"
            prepend-icon="mdi-check"
            class="action-bar__create"
            :loading="loading"
            :disabled="!canSubmit"
            data-testid="submit-sale"
            aria-label="إنشاء الفاتورة (Ctrl+Enter)"
            @click="$emit('submit')"
          >
            إنشاء الفاتورة
            <span class="kbd kbd--light">Ctrl + Enter</span>
          </v-btn>
        </span>
      </template>
      <ul class="reason-list">
        <li v-for="r in disabledReasons" :key="r">{{ r }}</li>
      </ul>
    </v-tooltip>
  </div>
</template>

<script setup>
import { formatCurrency } from '@/utils/formatters';

defineProps({
  loading: { type: Boolean, default: false },
  canSubmit: { type: Boolean, default: false },
  disabledReasons: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  currency: { type: String, default: 'IQD' },
});
defineEmits(['cancel', 'submit']);
</script>

<style scoped lang="scss">
.action-bar {
  flex: 0 0 auto;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 10px;

  &__spacer {
    flex: 1;
  }

  &__reason {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: rgba(var(--v-theme-on-surface), 0.65);
  }

  &__total {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
  }

  &__total-label {
    font-size: 0.68rem;
    color: rgba(var(--v-theme-on-surface), 0.55);
  }

  &__total-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: rgb(var(--v-theme-primary));
    font-variant-numeric: tabular-nums;
  }

  &__create {
    height: 44px !important;
    min-width: 168px;
  }
}

.reason-list {
  margin: 0;
  padding-inline-start: 18px;
  font-size: 0.8rem;
}

.kbd {
  margin-inline-start: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  background-color: rgba(var(--v-theme-on-surface), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.6);

  &--light {
    background-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }
}

@media (max-width: 700px) {
  .action-bar__reason {
    display: none;
  }
  .action-bar__create {
    min-width: 130px;
  }
}
</style>
