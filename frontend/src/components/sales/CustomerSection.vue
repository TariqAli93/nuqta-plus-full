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
  padding: 8px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
  }

  &__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.75);
    flex: 0 0 auto;
  }

  &__selector {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.customer-chip {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 6px 4px 4px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);

  &__name {
    font-weight: 600;
    font-size: 0.88rem;
  }
  &__sep {
    color: rgba(var(--v-theme-on-surface), 0.3);
  }
  &__meta {
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  &__debt {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgb(var(--v-theme-error));
  }
}

.tier-toggle {
  flex: 0 0 auto;
  gap: 10px;
}

// CustomerSelector contributes its own margin via global form polish — strip it
// here so the band stays compact.
.customer-band__selector :deep(.v-input) {
  margin-bottom: 0;
}
</style>
