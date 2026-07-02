<template>
  <div class="cart__header">
    <div class="cart__title">
      <v-icon size="20" color="primary">mdi-cart-variant</v-icon>
      <span class="cart__title-text">السلة</span>
      <v-chip v-if="itemCount > 0" size="x-small" color="primary" variant="flat">
        {{ itemCount }}
      </v-chip>
    </div>

    <div class="cart__header-actions">
      <v-tooltip location="bottom" :text="draftsReason" :disabled="!draftsDisabled">
        <template #activator="{ props: tipProps }">
          <span v-bind="tipProps">
            <v-btn
              v-if="draftsVisible"
              size="small"
              variant="text"
              :color="currentDraftId ? 'primary' : undefined"
              :prepend-icon="draftsDisabled ? 'mdi-lock-outline' : 'mdi-archive-clock-outline'"
              :disabled="draftsDisabled"
              @click="emit('openDraftsList')"
            >
              المسودات
              <v-chip
                v-if="currentDraftId && !draftsDisabled"
                size="x-small"
                class="ms-1"
                color="primary"
              >
                #{{ currentDraftId }}
              </v-chip>
            </v-btn>
          </span>
        </template>
      </v-tooltip>

      <v-btn
        v-if="hasItems"
        size="small"
        variant="text"
        color="error"
        prepend-icon="mdi-delete-sweep-outline"
        @click="emit('confirmClear')"
      >
        تفريغ
      </v-btn>
    </div>
  </div>
</template>

<script setup>
defineProps({
  itemCount: { type: Number, default: 0 },
  draftsReason: { type: String, default: '' },
  draftsDisabled: { type: Boolean, default: false },
  draftsVisible: { type: Boolean, default: false },
  currentDraftId: { type: [Number, String], default: null },
  hasItems: { type: Boolean, default: false },
});

const emit = defineEmits(['openDraftsList', 'confirmClear']);
</script>
