<template>
  <div class="pos__toolbar">
    <v-text-field
      ref="searchRef"
      :model-value="searchInput"
      data-testid="pos-search"
      class="pos__search"
      variant="solo-filled"
      density="comfortable"
      flat
      rounded="lg"
      hide-details
      clearable
      autocomplete="off"
      placeholder="ابحث بالاسم / SKU أو امسح الباركود ثم Enter"
      prepend-inner-icon="mdi-magnify"
      @update:model-value="emit('update:searchInput', $event)"
      @keyup.enter="emit('searchEnter')"
      @keydown.esc.prevent="emit('update:searchInput', '')"
      @keydown.down.prevent="emit('focusFirstCard')"
    >
      <template #append-inner>
        <v-icon size="18" class="pos__search-hint">mdi-barcode-scan</v-icon>
      </template>
    </v-text-field>

    <div class="pos__filters">
      <v-autocomplete
        :model-value="selectedCategory"
        :items="categoryOptions"
        item-title="title"
        item-value="value"
        class="pos__category"
        variant="solo-filled"
        density="comfortable"
        flat
        rounded="lg"
        hide-details
        clearable
        menu-icon="mdi-chevron-down"
        placeholder="كل التصنيفات"
        prepend-inner-icon="mdi-shape-outline"
        no-data-text="لا توجد تصنيفات"
        @update:model-value="emit('update:selectedCategory', $event)"
      />

      <v-btn-toggle
        v-if="agentPricingOn"
        :model-value="priceType"
        color="primary"
        variant="elevated"
        class="pos__tiers"
        aria-label="نوع التسعيرة"
        @update:model-value="emit('setPriceType', $event)"
      >
        <v-btn v-for="tier in priceTiers" :key="tier.value" :value="tier.value" size="small">
          {{ tier.label }}
        </v-btn>
      </v-btn-toggle>

      <v-switch
        :model-value="hideExpired"
        color="error"
        density="compact"
        hide-details
        inset
        label="إخفاء المنتهي"
        class="pos__expired"
        @update:model-value="emit('update:hideExpired', $event)"
      />

      <v-switch
        :model-value="hideNotAvailable"
        color="warning"
        density="compact"
        hide-details
        inset
        label="إخفاء غير المتوفر"
        class="pos__stock"
        @update:model-value="emit('update:hideNotAvailable', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  searchInput: { type: String, default: '' },
  selectedCategory: { type: [Number, String], default: null },
  categoryOptions: { type: Array, default: () => [] },
  agentPricingOn: { type: Boolean, default: false },
  priceType: { type: String, default: '' },
  priceTiers: { type: Array, default: () => [] },
  hideExpired: { type: Boolean, default: false },
  hideNotAvailable: { type: Boolean, default: false },
  focusRequest: { type: Number, default: 0 },
});

const emit = defineEmits([
  'update:searchInput',
  'update:selectedCategory',
  'setPriceType',
  'update:hideExpired',
  'update:hideNotAvailable',
  'searchEnter',
  'focusFirstCard',
]);

const searchRef = ref(null);

watch(
  () => props.focusRequest,
  () => {
    nextTick(() => searchRef.value?.focus?.());
  }
);
</script>
