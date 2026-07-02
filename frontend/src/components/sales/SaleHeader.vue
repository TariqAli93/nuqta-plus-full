<template>
  <PageHeader
    title="فاتورة بيع جديدة"
    subtitle="أنشئ فاتورة نقدية أو بيعاً بالأقساط"
    icon="mdi-cart-plus"
    icon-color="primary"
    icon-size="22"
  >
    <div class="sale-header__meta">
      <span class="sale-header__chip">
        <v-icon size="15">mdi-calendar-today</v-icon>
        {{ today }}
      </span>
      <span v-if="branchName" class="sale-header__chip">
        <v-icon size="15">mdi-office-building-outline</v-icon>
        {{ branchName }}
      </span>
      <span v-if="warehouseName" class="sale-header__chip">
        <v-icon size="15">mdi-warehouse</v-icon>
        {{ warehouseName }}
      </span>
      <span class="sale-header__chip sale-header__chip--count">
        <v-icon size="15">mdi-package-variant</v-icon>
        {{ itemCount }} منتج
      </span>
    </div>
  </PageHeader>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate } from '@/utils/formatters';
import PageHeader from '@/components/PageHeader.vue';

defineProps({
  branchName: { type: String, default: '' },
  warehouseName: { type: String, default: '' },
  itemCount: { type: Number, default: 0 },
});

const today = computed(() => formatDate(new Date()));
</script>

<style scoped lang="scss">
.sale-header__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.sale-header__chip {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 750;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.72);
  background: rgba(var(--v-theme-on-surface), 0.055);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);

  &--count {
    color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.09);
    border-color: rgba(var(--v-theme-primary), 0.2);
  }
}

@media (max-width: 760px) {
  .sale-header__meta {
    justify-content: flex-start;
  }
}
</style>

