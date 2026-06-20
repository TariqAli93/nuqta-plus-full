<template>
  <div class="page-shell">
    <PageHeader
      title="شركات التوصيل"
      subtitle="الإعدادات ← التكاملات ← شركات التوصيل"
      icon="mdi-truck-outline"
    />

    <v-alert v-if="store.error" type="error" variant="tonal" class="mb-4">
      {{ store.error }}
    </v-alert>

    <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-4" />

    <v-alert
      v-if="!store.loading && !store.error && providers.length === 0"
      type="info"
      variant="tonal"
    >
      لا توجد شركات توصيل. تأكد من Seed أو API: GET /api/delivery/providers
    </v-alert>

    <v-row v-else>
      <v-col v-for="p in providers" :key="p.id" cols="12" sm="6" md="4">
        <v-card class="pa-4 h-100 d-flex flex-column">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="d-flex align-center gap-2">
              <span class="text-subtitle-1 font-weight-medium">{{ p.name }}</span>
              <v-chip v-if="p.isDefault" color="primary" size="x-small" variant="flat">
                <v-icon start size="12">mdi-star</v-icon>افتراضي
              </v-chip>
            </div>

            <v-chip v-if="p.isImplemented" :color="conn(p).color" size="small" variant="tonal">
              <v-icon start size="14">{{ conn(p).icon }}</v-icon>
              {{ conn(p).label }}
            </v-chip>

            <v-chip v-else size="small" variant="tonal" color="grey"> قريباً </v-chip>
          </div>

          <div class="text-caption text-medium-emphasis mb-1">
            <v-icon size="13">{{ p.isActive ? 'mdi-check' : 'mdi-close' }}</v-icon>
            {{ p.isActive ? 'مفعّل' : 'غير مفعّل' }}
          </div>

          <v-btn
            v-if="canManage && !p.isDefault"
            variant="text"
            size="small"
            color="primary"
            prepend-icon="mdi-star-outline"
            class="mb-2 px-1"
            :loading="store.saving"
            @click="makeDefault(p)"
          >
            تعيين كافتراضي
          </v-btn>

          <v-spacer />

          <v-btn
            color="primary"
            variant="tonal"
            block
            prepend-icon="mdi-cog-outline"
            :to="settingsLink(p)"
          >
            إعداد
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useAuthStore } from '@/stores/auth';
import { connectionMeta } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';

const store = useDeliveryProviderStore();
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('delivery_providers:manage'));
const providers = computed(() => store.providers);
const conn = (p) => connectionMeta(p.connectionStatus);

// Boxy keeps its dedicated settings page; every other provider uses the generic
// settings screen keyed by its code.
const settingsLink = (p) =>
  p.code === 'BOXY'
    ? '/settings/integrations/delivery-providers/boxy'
    : `/settings/integrations/delivery-providers/${String(p.code).toLowerCase()}`;

const makeDefault = async (p) => {
  try {
    await store.setDefault(p.id);
  } catch {
    /* surfaced via notification store */
  }
};

onMounted(() => store.fetchProviders());
</script>
