<template>
  <v-menu :close-on-content-click="false" location="bottom end" offset="6">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        variant="tonal"
        color="primary"
        size="small"
        prepend-icon="mdi-tune-variant"
      >
        تخصيص
      </v-btn>
    </template>

    <v-card width="290" class="customize-card">
      <div class="customize-head">
        <span class="font-weight-bold">تخصيص الشاشة</span>
        <v-btn variant="text" size="x-small" color="primary" @click="reset">إعادة الضبط</v-btn>
      </div>
      <v-divider />

      <div class="customize-group-title">المؤشرات</div>
      <v-switch
        v-for="k in kpiItems"
        :key="`k-${k.key}`"
        v-model="prefs.kpis[k.key]"
        :label="k.label"
        color="primary"
        density="compact"
        hide-details
        inset
        class="customize-switch"
      />

      <v-divider class="my-1" />

      <div class="customize-group-title">الأقسام</div>
      <v-switch
        v-for="s in sectionItems"
        :key="`s-${s.key}`"
        v-model="prefs.sections[s.key]"
        :label="s.label"
        color="primary"
        density="compact"
        hide-details
        inset
        class="customize-switch"
      />
    </v-card>
  </v-menu>
</template>

<script setup>
import { useDashboardPrefs } from '@/composables/useDashboardPrefs';

const { prefs, reset } = useDashboardPrefs();

const kpiItems = [
  { key: 'sales', label: 'مبيعات اليوم' },
  { key: 'profit', label: 'أرباح اليوم' },
  { key: 'invoices', label: 'فواتير اليوم' },
  { key: 'customers', label: 'العملاء' },
  { key: 'inventory', label: 'قيمة البضاعة' },
  { key: 'dues', label: 'المستحقات' },
];

const sectionItems = [
  { key: 'quickActions', label: 'العمليات السريعة' },
  { key: 'performance', label: 'مؤشرات الأداء' },
  { key: 'alerts', label: 'مركز التنبيهات' },
  { key: 'activity', label: 'النشاط الحديث' },
];
</script>

<style scoped>
.customize-card {
  padding-bottom: 0.5rem;
}

.customize-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
}

.customize-group-title {
  font-size: 0.74rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.55);
  padding: 0.5rem 0.9rem 0.2rem;
}

.customize-switch {
  padding: 0 0.9rem;
}

:deep(.customize-switch .v-label) {
  font-size: 0.85rem;
  opacity: 1;
}
</style>
