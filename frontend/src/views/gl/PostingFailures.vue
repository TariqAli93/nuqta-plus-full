<template>
  <div class="page-shell">
    <PageHeader
      title="إصلاح القيود"
      subtitle="مستندات فشل ترحيلها محاسبياً — يبقى المستند سليماً والقيد فقط هو المعلّق. أعد الترحيل بعد إصلاح السبب."
      icon="mdi-wrench-clock"
    >
      <v-btn-toggle v-model="statusFilter" density="comfortable" mandatory @update:model-value="reload">
        <v-btn value="pending" size="small">معلّقة</v-btn>
        <v-btn value="resolved" size="small">محلولة</v-btn>
        <v-btn value="ignored" size="small">متجاهلة</v-btn>
      </v-btn-toggle>
    </PageHeader>

    <v-card class="page-section">
      <v-card-text v-if="!loading && failures.length === 0">
        <EmptyState
          title="لا توجد قيود معلّقة"
          description="كل المستندات رُحّلت محاسبياً بنجاح."
          icon="mdi-check-decagram-outline"
        />
      </v-card-text>
      <v-table v-else density="comfortable">
        <thead>
          <tr>
            <th class="text-start">المصدر</th>
            <th class="text-start">المعرّف</th>
            <th class="text-start">سبب الفشل</th>
            <th class="text-start">التاريخ</th>
            <th v-if="canManage && statusFilter === 'pending'" class="text-end" style="width: 180px">إجراء</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in failures" :key="f.id">
            <td>
              <v-chip size="x-small" variant="tonal" color="error">{{ f.sourceType }}</v-chip>
            </td>
            <td class="font-mono">#{{ f.sourceId }}</td>
            <td class="text-error">{{ f.errorMessage }}</td>
            <td class="text-caption text-medium-emphasis">{{ formatDate(f.createdAt) }}</td>
            <td v-if="canManage && statusFilter === 'pending'" class="text-end">
              <v-btn
                size="x-small"
                color="primary"
                variant="tonal"
                prepend-icon="mdi-refresh"
                :loading="busyId === f.id"
                @click="repost(f)"
              >
                إعادة الترحيل
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-close-circle-outline"
                title="تجاهل"
                @click="ignore(f)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatDate } from '@/utils/formatters';

const glStore = useGlStore();
const authStore = useAuthStore();

const loading = computed(() => glStore.loading);
const failures = computed(() => glStore.failures);
const canManage = computed(() => authStore.hasPermission?.('gl:repair_postings'));

const statusFilter = ref('pending');
const busyId = ref(null);

async function reload() {
  await glStore.fetchFailures(statusFilter.value);
}

async function repost(f) {
  busyId.value = f.id;
  try {
    await glStore.repostFailure(f.id);
    await reload();
  } catch (err) {
    console.error('Failed to repost', err);
  } finally {
    busyId.value = null;
  }
}

async function ignore(f) {
  if (!confirm('تجاهل هذا السجل؟ لن يُرحَّل المستند محاسبياً.')) return;
  try {
    await glStore.ignoreFailure(f.id);
    await reload();
  } catch (err) {
    console.error('Failed to ignore', err);
  }
}

onMounted(reload);
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
