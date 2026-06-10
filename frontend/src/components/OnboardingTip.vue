<template>
  <v-alert
    v-if="visible"
    :type="type"
    variant="tonal"
    density="compact"
    class="mb-3 onboarding-tip"
    closable
    @click:close="dismiss"
  >
    <span class="text-body-2">{{ text }}</span>
  </v-alert>
</template>

<script setup>
import { ref } from 'vue';

/**
 * Small, dismissible inline tip (تلميح). Once closed it stays hidden via
 * localStorage keyed by `id`, so we never nag the user twice.
 */
const props = defineProps({
  id: { type: String, required: true },
  text: { type: String, required: true },
  type: { type: String, default: 'info' },
});

const storageKey = `tip-dismissed:${props.id}`;
const visible = ref(localStorage.getItem(storageKey) !== '1');

function dismiss() {
  visible.value = false;
  try {
    localStorage.setItem(storageKey, '1');
  } catch {
    /* ignore */
  }
}
</script>
