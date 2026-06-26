<template>
  <div ref="root" class="product-search">
    <v-autocomplete
      v-model="model"
      v-model:search="term"
      :items="products"
      item-title="name"
      item-value="id"
      :custom-filter="customProductFilter"
      label="ابحث عن منتج، باركود أو SKU…"
      prepend-inner-icon="mdi-barcode-scan"
      density="comfortable"
      variant="outlined"
      hide-details
      autocomplete="off"
      no-data-text="لم يتم العثور على منتج مطابق"
      class="product-search__field"
      :menu-props="{ maxHeight: 340 }"
      @update:model-value="onSelect"
      @keydown.enter="onEnter"
    >
      <template #append-inner>
        <span class="product-search__kbd">F2</span>
      </template>
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="{ ...itemProps, disabled: !isSellable(item.raw) }">
          <template #title>
            <div class="d-flex align-center justify-space-between ga-3">
              <span class="text-truncate">{{ item.raw.name }}</span>
              <span class="text-caption text-medium-emphasis">
                {{ formatCurrency(item.raw.sellingPrice, item.raw.currency) }}
              </span>
            </div>
          </template>
          <template #subtitle>
            <span class="text-caption">
              <template v-if="item.raw.sku">SKU: {{ item.raw.sku }} ·</template>
              <span :class="stockClass(item.raw)">{{ stockLabel(item.raw) }}</span>
            </span>
          </template>
        </v-list-item>
      </template>
    </v-autocomplete>

    <v-btn
      color="primary"
      variant="tonal"
      class="product-search__add"
      prepend-icon="mdi-plus"
      :disabled="!term"
      @click="commit"
    >
      إضافة
    </v-btn>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { formatCurrency } from '@/utils/formatters';

const props = defineProps({
  products: { type: Array, default: () => [] },
  customProductFilter: { type: Function, required: true },
  availableStockOf: { type: Function, required: true },
});

const emit = defineEmits(['add', 'scan']);

const root = ref(null);
const model = ref(null);
const term = ref('');

const isService = (p) => p?.productType === 'service';
const isSellable = (p) => isService(p) || props.availableStockOf(p) > 0;

const stockLabel = (p) => {
  if (isService(p)) return 'خدمة';
  const s = props.availableStockOf(p);
  return s > 0 ? `المخزون: ${s}` : 'غير متوفر';
};
const stockClass = (p) => {
  if (isService(p)) return 'text-secondary';
  return props.availableStockOf(p) > 0 ? 'text-medium-emphasis' : 'text-error';
};

const reset = async () => {
  model.value = null;
  await nextTick();
  term.value = '';
};

const onSelect = (id) => {
  if (!id) return;
  emit('add', id);
  reset();
};

const exactMatch = (code) =>
  props.products.find(
    (p) =>
      p.barcode === code ||
      (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
      (Array.isArray(p.units) && p.units.some((u) => u.barcode && u.barcode === code))
  );

// Hardware scanners type the code then fire Enter — scan on an exact barcode/SKU
// match rather than letting the autocomplete select a name-highlighted row.
const onEnter = (e) => {
  const code = (term.value || '').trim();
  if (!code) return;
  if (exactMatch(code)) {
    e.preventDefault();
    e.stopPropagation();
    emit('scan', code);
    reset();
  }
};

// The «إضافة» button: scan an exact code, else add the single matching product.
const commit = () => {
  const code = (term.value || '').trim();
  if (!code) return;
  if (exactMatch(code)) {
    emit('scan', code);
    return reset();
  }
  const matches = props.products.filter((p) =>
    props.customProductFilter(p.name, code, { raw: p })
  );
  const sellable = matches.filter((p) => isSellable(p));
  if (sellable.length >= 1) {
    emit('add', sellable[0].id);
    reset();
  }
};

defineExpose({
  focus() {
    root.value?.querySelector('input')?.focus();
  },
});
</script>

<style scoped lang="scss">
.product-search {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  &__field {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__add {
    flex: 0 0 auto;
    width: 96px;
    height: 48px;
  }

  &__kbd {
    align-self: center;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.62rem;
    font-weight: 600;
    background-color: rgba(var(--v-theme-on-surface), 0.08);
    color: rgba(var(--v-theme-on-surface), 0.5);
  }
}
</style>
