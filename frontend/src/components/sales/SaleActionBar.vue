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
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.035);

  &__spacer {
    flex: 1;
  }

  &__reason {
    max-width: 340px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: rgba(var(--v-theme-on-surface), 0.66);
  }

  &__total {
    min-width: 130px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
  }

  &__total-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: rgba(var(--v-theme-on-surface), 0.52);
  }

  &__total-value {
    font-size: 1.22rem;
    font-weight: 950;
    color: rgb(var(--v-theme-primary));
    font-variant-numeric: tabular-nums;
  }

  &__create {
    min-width: 178px;
    height: 46px !important;
    border-radius: 12px;
    font-weight: 900;
  }
}

.reason-list {
  margin: 0;
  padding-inline-start: 18px;
  font-size: 0.8rem;
}

.kbd {
  margin-inline-start: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.64rem;
  font-weight: 800;
  background: rgba(var(--v-theme-on-surface), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.62);

  &--light {
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
  }
}

@media (max-width: 760px) {
  .action-bar {
    flex-wrap: wrap;
    height: auto;
  }

  .action-bar__reason {
    display: none;
  }

  .action-bar__total {
    order: -1;
    width: 100%;
    align-items: stretch;
  }

  .action-bar__create {
    flex: 1;
    min-width: 150px;
  }
}
</style>

