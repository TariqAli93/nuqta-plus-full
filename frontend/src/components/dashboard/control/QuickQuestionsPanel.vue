<template>
  <v-card v-if="cards.length" class="cc-panel" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-comment-question-outline" size="20" color="primary" />
        <span>الأسئلة السريعة</span>
      </div>
      <span class="cc-panel__hint d-none d-md-inline">تفتح كل بطاقة تقريراً في نافذة مستقلة</span>
    </header>

    <div class="qq-grid pa-4">
      <button
        v-for="card in cards"
        :key="card.type"
        type="button"
        class="qq-item"
        :style="{ '--qq-accent': card.accent }"
        :title="card.title"
        @click="open(card.type)"
      >
        <span class="qq-item__icon"><v-icon :icon="card.icon" size="26" /></span>
        <span class="qq-item__q">{{ card.question }}</span>
        <span class="qq-item__sub">{{ card.title }}</span>
      </button>
    </div>
  </v-card>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { openReportWindow } from '@/composables/useReportWindow';
import { REPORT_CONFIGS, REPORT_ORDER } from '@/views/reports/reportConfigs.js';

const authStore = useAuthStore();

// RBAC: only show a card the user is permitted to open (backend authorizes too).
const cards = computed(() =>
  REPORT_ORDER.map((t) => REPORT_CONFIGS[t]).filter((c) => authStore.hasPermission(c.permission))
);

function open(type) {
  openReportWindow(type);
}
</script>

<style scoped>
.qq-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(7, minmax(140px, 1fr));
}
.qq-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    border-color 0.12s ease;
  text-align: center;
}
.qq-item:hover {
  transform: translateY(-2px);
  border-color: var(--qq-accent);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
}
.qq-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  color: #fff;
  background: var(--qq-accent, #2563eb);
}
.qq-item__q {
  font-weight: 800;
  font-size: 0.95rem;
  color: rgb(var(--v-theme-on-surface));
}
.qq-item__sub {
  font-size: 0.72rem;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.6;
}
</style>
