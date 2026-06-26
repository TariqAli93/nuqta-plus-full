<template>
  <header class="sale-header">
    <div class="sale-header__main">
      <div class="sale-header__icon">
        <v-icon size="22">mdi-cart-plus</v-icon>
      </div>
      <div class="sale-header__text">
        <h1 class="sale-header__title">فاتورة بيع جديدة</h1>
        <p class="sale-header__subtitle">أنشئ فاتورة نقدية أو بيعاً بالأقساط</p>
      </div>
    </div>

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
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate } from '@/utils/formatters';

defineProps({
  branchName: { type: String, default: '' },
  warehouseName: { type: String, default: '' },
  itemCount: { type: Number, default: 0 },
});

const today = computed(() => formatDate(new Date()));
</script>

<style scoped lang="scss">
.sale-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);

  &__main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background-color: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
    flex-shrink: 0;
  }

  &__title {
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.25;
    margin: 0;
    color: rgb(var(--v-theme-on-surface));
  }

  &__subtitle {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), 0.75);
    background-color: rgba(var(--v-theme-on-surface), 0.05);
    border: 1px solid rgba(var(--v-theme-on-surface), 0.08);

    &--count {
      color: rgb(var(--v-theme-primary));
      background-color: rgba(var(--v-theme-primary), 0.08);
      border-color: rgba(var(--v-theme-primary), 0.2);
    }
  }
}
</style>
