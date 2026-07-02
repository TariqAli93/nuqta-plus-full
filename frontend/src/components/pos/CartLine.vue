<template>
  <v-card class="line" :class="{ 'line--flash': flash }">
    <div class="line__top">
      <div class="line__name" :title="item.name">{{ item.name }}</div>
      <div class="line__actions">
        <v-btn
          icon="mdi-tune-variant"
          size="x-small"
          variant="text"
          color="primary"
          title="خصم / ملاحظة"
          @click.stop="emit('openLineEdit', item)"
        />
        <v-btn
          icon="mdi-trash-can-outline"
          size="x-small"
          variant="text"
          color="error"
          :title="`إزالة ${item.name}`"
          @click.stop="emit('removeItem', item.id)"
        />
      </div>
    </div>

    <div class="line__meta">
      <span class="line__unit-price">
        {{ formatMoney(Math.max(0, item.price - item.discount), currency) }}
      </span>
      <span class="line__sep">·</span>
      <span class="line__unit-label">
        {{ item.unitName ? `سعر ${item.unitName}` : 'للوحدة' }}
      </span>

      <v-menu v-if="item.units && item.units.length > 1" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            size="x-small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-swap-horizontal"
            class="line__unit-btn"
            @click.stop
          >
            {{ item.unitName || 'الوحدة' }}
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item
            v-for="unit in item.units"
            :key="unit.id"
            :active="unit.id === item.unitId"
            :disabled="unit.isActive === false"
            @click="emit('updateLineUnit', item.id, unit.id)"
          >
            <v-list-item-title>
              {{ unit.name }}
              <span v-if="!unit.isBase" class="text-caption text-medium-emphasis">
                (يعادل {{ Number(unit.conversionFactor) || 1 }})
              </span>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-chip v-if="item.discount > 0" size="x-small" color="warning" variant="tonal" label>
        <v-icon start size="11">mdi-tag-outline</v-icon>خصم
      </v-chip>
      <v-chip
        v-if="lineDiscountCapped"
        :key="item.id + '-line-discount-capped'"
        size="x-small"
        color="warning"
        variant="tonal"
        label
      >
        <span>اقصى خصم ممكن: </span>
        <b>{{ formatMoney(appliedLineDiscountAmount, currency) }}</b>
      </v-chip>
      <v-chip
        v-if="item.isCustomPrice"
        size="x-small"
        color="info"
        variant="tonal"
        label
        :title="`السعر الأصلي: ${formatMoney(item.originalPrice, currency)}`"
      >
        <v-icon start size="11">mdi-cash-edit</v-icon>سعر مخصص
      </v-chip>
      <v-chip v-if="item.note" size="x-small" variant="tonal" label :title="item.note">
        <v-icon start size="11">mdi-note-text-outline</v-icon>{{ truncate(item.note, 14) }}
      </v-chip>

      <v-spacer />

      <span class="text-caption text-medium-emphasis">
        سعر التكلفة: {{ formatMoney(item.baseCostPrice, item.currency) }}
      </span>
    </div>

    <div v-if="isServiceLine" class="line__service-price" @click.stop>
      <v-text-field
        :model-value="item.price || ''"
        :data-testid="`pos-service-price-${item.productId}`"
        type="number"
        min="0"
        variant="outlined"
        density="compact"
        hide-details
        hide-spin-buttons
        label="السعر المستلم"
        :error="!(Number(item.price) > 0)"
        prepend-inner-icon="mdi-cash-edit"
        @update:model-value="(value) => emit('updatePrice', item.id, value)"
      />
    </div>

    <div v-else-if="canEditPrice" @click.stop>
      <v-text-field
        :model-value="groupNumber(item.price)"
        :data-testid="`pos-line-price-${item.productId}`"
        min="0"
        variant="outlined"
        hide-details
        hide-spin-buttons
        label="سعر الوحدة"
        :prepend-inner-icon="item.isCustomPrice ? 'mdi-pencil' : 'mdi-cash-edit'"
        @update:model-value="(value) => emit('updatePrice', item.id, parseAmount(value))"
      />
    </div>

    <div v-if="expiryWarning" class="line__warn">
      <v-icon size="13">mdi-alert-outline</v-icon>
      {{ expiryWarning }}
    </div>

    <div class="line__bottom">
      <div class="line__qty" @click.stop>
        <v-btn
          icon="mdi-minus"
          size="x-small"
          variant="tonal"
          density="comfortable"
          aria-label="إنقاص"
          @click="emit('decQty', item.id)"
        />
        <v-text-field
          :model-value="item.qty"
          type="number"
          :min="1"
          variant="outlined"
          density="compact"
          hide-details
          hide-spin-buttons
          class="line__qty-input"
          inputmode="numeric"
          @click.stop
          @blur="(event) => emit('commitQty', item.id, event.target.value)"
          @keyup.enter="
            (event) => {
              emit('commitQty', item.id, event.target.value);
              event.target.blur();
            }
          "
        />
        <v-btn
          icon="mdi-plus"
          size="x-small"
          variant="tonal"
          density="comfortable"
          aria-label="زيادة"
          @click="emit('incQty', item.id)"
        />
      </div>

      <div class="line__total">
        <b>{{ formatMoney(lineSubtotalAmount, currency) }}</b>

        <span
          v-if="item.baseCostPrice > 0"
          class="text-caption text-medium-emphasis"
          :class="{
            'text-error': profitPrice(item).includes('-'),
            'text-success': !profitPrice(item).includes('-'),
          }"
        >
          ({{ profitPrice(item) }})
        </span>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';
import { formatCurrency as formatMoney } from '@/utils/formatters';

defineProps({
  item: { type: Object, required: true },
  flash: { type: Boolean, default: false },
  currency: { type: String, required: true },
  canEditPrice: { type: Boolean, default: false },
  lineDiscountCapped: { type: Boolean, default: false },
  appliedLineDiscountAmount: { type: Number, default: 0 },
  lineSubtotalAmount: { type: Number, default: 0 },
  expiryWarning: { type: String, default: '' },
  isServiceLine: { type: Boolean, default: false },
});

const emit = defineEmits([
  'openLineEdit',
  'removeItem',
  'updateLineUnit',
  'updatePrice',
  'decQty',
  'commitQty',
  'incQty',
]);

const truncate = (value, length) => {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length)}…` : text;
};

const profitPrice = (item) => {
  const profit = item.price - item.baseCostPrice;
  return `الربح: ${formatMoney(profit * item.qty, item.currency)}`;
};
</script>
