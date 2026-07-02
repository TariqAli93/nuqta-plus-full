<template>
  <div ref="gridRef" class="pos__grid" role="grid" aria-live="polite" @keydown="onGridKey">
    <template v-if="loadingProducts">
      <v-card
        v-for="n in 12"
        :key="`sk-${n}`"
        class="pos-tile pos-tile--skeleton"
        rounded="lg"
        flat
        aria-hidden="true"
      >
        <div class="pos-tile__media sk-shimmer" />
        <div class="pos-tile__body">
          <div class="sk-line sk-shimmer" />
          <div class="sk-line sk-line--short sk-shimmer" />
          <div class="sk-line sk-line--price sk-shimmer" />
        </div>
      </v-card>
    </template>

    <div v-else-if="filteredProducts.length === 0" class="pos__empty">
      <EmptyState
        :icon="debouncedSearch || selectedCategory ? 'mdi-magnify-close' : 'mdi-package-variant-closed'"
        :title="debouncedSearch || selectedCategory ? 'لا نتائج' : 'لا توجد منتجات'"
        :description="
          debouncedSearch || selectedCategory
            ? 'جرّب تعديل البحث أو التصنيف.'
            : 'أضف منتجات من شاشة المنتجات لبدء البيع.'
        "
      />
    </div>

    <ProductCard
      v-for="product in paginatedProducts"
      v-else
      :key="product.id"
      :product="product"
      :sellable="isSellable(product)"
      :expired="expiryStatusOf(product) === 'منتهي'"
      :show-expiry-chip="
        expiryStatusOf(product) === 'ينتهي قريباً' || expiryStatusOf(product) === 'منتهي'
      "
      :is-service-product="isService(product)"
      :available="availableOf(product)"
      :stock-status="stockStatusOf(product)"
      :expiry-status="expiryStatusOf(product)"
      :expiry-color="expiryColor(expiryStatusOf(product))"
      :placeholder-style="placeholderStyle(product)"
      :formatted-cost-price="formatMoney(product.costPrice, product.currency)"
      :formatted-selling-price="formatMoney(product.sellingPrice, product.currency)"
      @add="emit('addProduct', $event)"
    />
  </div>

  <div
    v-if="!loadingProducts && filteredProducts.length > 0"
    class="pos__pager"
    :class="{ 'pos__pager--mobile': isMobile }"
  >
    <v-select
      :model-value="productsPerPage"
      :items="perPageOptions"
      density="compact"
      variant="outlined"
      hide-details
      label="لكل صفحة"
      class="pos__pager-size"
      @update:model-value="emit('update:productsPerPage', $event)"
    />
    <span class="pos__pager-count">
      {{ pageRangeStart }}-{{ pageRangeEnd }} من {{ filteredProducts.length }}
    </span>
    <v-pagination
      :model-value="productPage"
      :length="totalProductPages"
      :total-visible="isMobile ? 3 : 7"
      density="comfortable"
      class="pos__pager-nav"
      @update:model-value="emit('update:productPage', $event)"
    />
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatCurrency as formatMoney } from '@/utils/formatters';
import ProductCard from './ProductCard.vue';

const props = defineProps({
  loadingProducts: { type: Boolean, default: false },
  filteredProducts: { type: Array, default: () => [] },
  paginatedProducts: { type: Array, default: () => [] },
  debouncedSearch: { type: String, default: '' },
  selectedCategory: { type: [Number, String], default: null },
  productsPerPage: { type: Number, required: true },
  perPageOptions: { type: Array, default: () => [] },
  pageRangeStart: { type: Number, required: true },
  pageRangeEnd: { type: Number, required: true },
  totalProductPages: { type: Number, required: true },
  productPage: { type: Number, required: true },
  isMobile: { type: Boolean, default: false },
  availableOf: { type: Function, required: true },
  isService: { type: Function, required: true },
  isSellable: { type: Function, required: true },
  stockStatusOf: { type: Function, required: true },
  expiryStatusOf: { type: Function, required: true },
  expiryColor: { type: Function, required: true },
  placeholderStyle: { type: Function, required: true },
  focusRequest: { type: Number, default: 0 },
});

const emit = defineEmits(['addProduct', 'update:productsPerPage', 'update:productPage']);

const gridRef = ref(null);

const focusFirstCard = () => {
  const first = gridRef.value?.querySelector('.pos-tile:not(.pos-tile--disabled)');
  if (first) first.focus();
};

const gridCols = () => {
  const grid = gridRef.value;
  if (!grid) return 1;
  const tmpl = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, tmpl.split(' ').filter(Boolean).length);
};

const onGridKey = (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;

  const cards = Array.from(
    gridRef.value?.querySelectorAll('.pos-tile:not(.pos-tile--disabled)') || []
  );
  if (cards.length === 0) return;

  const current = document.activeElement;
  let index = cards.indexOf(current);
  if (index < 0) index = 0;

  const cols = gridCols();
  let next = index;

  switch (event.key) {
    case 'ArrowLeft':
      next = index + 1;
      break;
    case 'ArrowRight':
      next = index - 1;
      break;
    case 'ArrowDown':
      next = index + cols;
      break;
    case 'ArrowUp':
      next = index - cols;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = cards.length - 1;
      break;
    default:
      break;
  }

  if (next < 0 || next >= cards.length) return;
  event.preventDefault();
  cards[next]?.focus();
};

watch(
  () => props.productPage,
  () => {
    nextTick(() => gridRef.value?.scrollTo?.({ top: 0 }));
  }
);

watch(
  () => props.focusRequest,
  () => {
    nextTick(focusFirstCard);
  }
);
</script>
