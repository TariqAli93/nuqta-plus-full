<template>
  <section ref="root" class="customer-band">
    <span class="customer-band__label mb-2">
      العميل
      <v-chip v-if="paymentType === 'installment'" size="x-small" color="error" variant="tonal">
        مطلوب
      </v-chip>
    </span>
    <div class="customer-band__row">
      <!-- Selected → inline chip -->
      <div v-if="selectedCustomer" class="customer-chip">
        <v-avatar size="28" color="primary" variant="tonal">
          <span class="text-caption">{{ initials }}</span>
        </v-avatar>
        <span class="customer-chip__name text-truncate">{{ selectedCustomer.name }}</span>
        <span v-if="selectedCustomer.phone" class="customer-chip__sep">·</span>
        <span v-if="selectedCustomer.phone" class="customer-chip__meta">{{
          selectedCustomer.phone
        }}</span>
        <span v-if="debt > 0" class="customer-chip__sep">·</span>
        <span v-if="debt > 0" class="customer-chip__debt">{{ formatCurrency(debt) }}</span>
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          density="comfortable"
          aria-label="إزالة العميل"
          @click="clearCustomer"
        />
      </div>

      <!-- Not selected → selector -->
      <div v-else class="customer-band__selector">
        <CustomerSelector
          :model-value="modelValue"
          :required="paymentType === 'installment'"
          :show-label="false"
          @update:model-value="$emit('update:modelValue', $event)"
          @customer-selected="onSelected"
        />
      </div>

      <!-- Pricing tier -->
      <v-btn-toggle
        v-if="agentPricingOn"
        :model-value="selectedCustomerType"
        color="primary"
        variant="elevated"
        class="tier-toggle"
        @update:model-value="onTierChange"
      >
        <v-btn v-for="tier in priceTiers" :key="tier.value" :value="tier.value" size="small">
          {{ tier.label }}
        </v-btn>
      </v-btn-toggle>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import CustomerSelector from '@/components/CustomerSelector.vue';
import { useCustomerStore } from '@/stores/customer';
import { usePermissions } from '@/composables/usePermissions';
import { formatCurrency } from '@/utils/formatters';

const props = defineProps({
  modelValue: { type: [Number, Object], default: null },
  paymentType: { type: String, default: 'cash' },
  agentPricingOn: { type: Boolean, default: false },
  selectedCustomerType: { type: String, default: 'retail' },
  priceTiers: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'update:modelValue',
  'customer-selected',
  'update:selectedCustomerType',
  'price-type-change',
]);

const customerStore = useCustomerStore();
const { can } = usePermissions();

const root = ref(null);
const selectedCustomer = ref(null);

const debt = computed(() => Number(selectedCustomer.value?.totalDebt) || 0);
const initials = computed(() => {
  const name = selectedCustomer.value?.name?.trim() || '';
  return name ? name.charAt(0) : '؟';
});

const onSelected = (customer) => {
  selectedCustomer.value = customer;
  emit('update:modelValue', customer?.id ?? null);
  emit('customer-selected', customer);
};

const onTierChange = (value) => {
  emit('update:selectedCustomerType', value);
  emit('price-type-change', value);
};

const clearCustomer = () => {
  selectedCustomer.value = null;
  emit('update:modelValue', null);
  emit('customer-selected', null);
};

const hydrate = async (id) => {
  if (!id || !can('customers:read')) return;
  if (selectedCustomer.value?.id === id) return;
  try {
    const res = await customerStore.fetchCustomer(id);
    selectedCustomer.value = res.data || null;
  } catch {
    selectedCustomer.value = null;
  }
};

watch(
  () => props.modelValue,
  (id) => {
    if (!id) selectedCustomer.value = null;
    else if (selectedCustomer.value?.id !== id) hydrate(id);
  }
);

onMounted(() => {
  if (props.modelValue) hydrate(props.modelValue);
});

defineExpose({
  focus() {
    root.value?.querySelector('input')?.focus();
  },
});
</script>

<style scoped lang="scss">
.customer-band {
  flex: 0 0 auto;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  background: rgba(var(--v-theme-surface-variant), 0.12);

  &__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 800;
    color: rgba(var(--v-theme-on-surface), 0.58);
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  &__selector {
    min-width: 0;
  }
}

.customer-chip {
  min-width: 0;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  background: rgba(var(--v-theme-primary), 0.055);

  &__name {
    min-width: 0;
    font-size: 0.88rem;
    font-weight: 800;
  }

  &__sep,
  &__meta {
    flex: 0 0 auto;
    font-size: 0.76rem;
    color: rgba(var(--v-theme-on-surface), 0.58);
  }

  &__debt {
    flex: 0 0 auto;
    font-size: 0.76rem;
    font-weight: 800;
    color: rgb(var(--v-theme-error));
  }
}

.tier-toggle {
  flex: 0 0 auto;
  border-radius: 10px;

  :deep(.v-btn) {
    min-width: 56px;
    font-weight: 700;
  }
}

@media (max-width: 760px) {
  .customer-band__row {
    grid-template-columns: 1fr;
  }

  .tier-toggle {
    width: 100%;

    :deep(.v-btn) {
      flex: 1;
    }
  }
}
</style>

