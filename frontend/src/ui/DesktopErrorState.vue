<template>
  <div class="dt-error-state" role="alert">
    <v-icon :color="iconColor" :size="iconSize">{{ icon }}</v-icon>
    <div class="dt-error-state__title">{{ resolvedTitle }}</div>
    <div v-if="resolvedMessage" class="dt-error-state__message">{{ resolvedMessage }}</div>
    <ul v-if="details.length" class="dt-error-state__details">
      <li v-for="(line, i) in details" :key="i">{{ line }}</li>
    </ul>
    <div class="dt-error-state__actions">
      <slot name="actions">
        <v-btn
          v-if="retryable"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          @click="$emit('retry')"
        >
          إعادة المحاولة
        </v-btn>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

/**
 * Error / not-found panel. Can be driven directly by a normalized AppError
 * (reads its `message`, `details`, `statusCode`) or by explicit title/message.
 * No business logic, no RBAC — purely presentational.
 *
 * @prop {object} error      An AppError (or { message, details, statusCode }).
 * @prop {string} title      Overrides the derived title.
 * @prop {string} message    Overrides error.message.
 * @prop {boolean} retryable Show the default retry button (emits `retry`).
 */
const props = defineProps({
  error: { type: Object, default: null },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  icon: { type: String, default: 'mdi-alert-circle-outline' },
  iconColor: { type: String, default: 'error' },
  iconSize: { type: Number, default: 56 },
  retryable: { type: Boolean, default: false },
});

defineEmits(['retry']);

const resolvedTitle = computed(() => {
  if (props.title) return props.title;
  if (props.error?.statusCode === 404 || props.error?.status === 404) return 'العنصر غير موجود';
  return 'حدث خطأ';
});
const resolvedMessage = computed(() => props.message || props.error?.message || '');
const details = computed(() => (Array.isArray(props.error?.details) ? props.error.details : []));
</script>

<style scoped lang="scss">
.dt-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 16px;
  text-align: center;

  &__title {
    font-size: 16px;
    font-weight: 600;
  }
  &__message {
    font-size: 13px;
    color: rgba(var(--v-theme-on-surface), 0.7);
    max-width: 520px;
    white-space: pre-line;
  }
  &__details {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12.5px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  &__actions {
    margin-top: 8px;
  }
}
</style>
