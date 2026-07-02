<template>
  <v-card
    class="product-glass-card"
    :class="{ 'product-glass-card--disabled': !sellable || expired }"
    :ripple="sellable && !expired"
    @click="sellable && !expired && emit('add', product)"
  >
    <div class="product-glass-card__header">
      <div class="product-glass-card__icon" :style="placeholderStyle">
        <v-icon size="34">mdi-package-variant</v-icon>
      </div>

      <v-btn
        v-if="sellable && !expired"
        icon="mdi-plus"
        size="small"
        color="primary"
        variant="flat"
        class="product-glass-card__add"
        @click.stop="emit('add', product)"
      />
    </div>

    <div class="product-glass-card__content">
      <div class="product-glass-card__name" :title="product.name">
        {{ product.name }}
      </div>

      <div v-if="!isServiceProduct" class="product-glass-card__qty">
        <v-icon size="15">mdi-cube-outline</v-icon>
        {{ available }}
      </div>

      <div class="product-glass-card__code">
        <v-icon size="13">mdi-barcode-scan</v-icon>
        {{ product.sku || product.barcode || product.id }}
      </div>

      <div class="product-glass-card__badges">
        <v-chip size="x-small" :color="stockStatus.color" variant="tonal" label>
          <v-icon start size="12">{{ stockStatus.icon }}</v-icon>
          {{ stockStatus.label }}
        </v-chip>

        <v-chip v-if="showExpiryChip" size="x-small" :color="expiryColor" variant="tonal" label>
          {{ expiryStatus }}
        </v-chip>
      </div>

      <div class="product-glass-card__bottom">
        <div class="product-glass-card__prices">
          <div class="product-glass-card__cost">
            <span>سعر التكلفة</span>
            <strong>{{ formattedCostPrice }}</strong>
          </div>

          <v-divider />

          <div class="product-glass-card__sale">
            <span>سعر البيع</span>
            <strong>{{ formattedSellingPrice }}</strong>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup>
defineProps({
  product: { type: Object, required: true },
  sellable: { type: Boolean, default: false },
  expired: { type: Boolean, default: false },
  showExpiryChip: { type: Boolean, default: false },
  isServiceProduct: { type: Boolean, default: false },
  available: { type: Number, default: 0 },
  stockStatus: { type: Object, required: true },
  expiryStatus: { type: String, default: '' },
  expiryColor: { type: String, default: undefined },
  placeholderStyle: { type: Object, default: () => ({}) },
  formattedCostPrice: { type: String, required: true },
  formattedSellingPrice: { type: String, required: true },
});

const emit = defineEmits(['add']);
</script>
