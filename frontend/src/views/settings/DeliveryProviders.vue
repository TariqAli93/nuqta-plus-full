<template>
  <div class="page-shell">
    <PageHeader
      title="موفّرو التوصيل"
      subtitle="الإعدادات ← التكاملات ← موفّرو التوصيل"
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
      لا توجد موفّرات توصيل. تأكد من Seed أو API: GET /api/delivery/providers
    </v-alert>

    <v-row v-else>
      <v-col v-for="p in providers" :key="p.id" cols="12" sm="6" md="4">
        <v-card class="pa-4 h-100 d-flex flex-column">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-subtitle-1 font-weight-medium">{{ p.name }}</span>

            <v-chip v-if="p.isImplemented" :color="conn(p).color" size="small" variant="tonal">
              <v-icon start size="14">{{ conn(p).icon }}</v-icon>
              {{ conn(p).label }}
            </v-chip>

            <v-chip v-else size="small" variant="tonal" color="grey"> قريباً </v-chip>
          </div>

          <div class="text-caption text-medium-emphasis mb-4">
            <v-icon size="13">{{ p.isActive ? 'mdi-check' : 'mdi-close' }}</v-icon>
            {{ p.isActive ? 'مفعّل' : 'غير مفعّل' }}
          </div>

          <v-spacer />

          <v-btn
            v-if="p.code === 'BOXY'"
            color="primary"
            variant="tonal"
            block
            prepend-icon="mdi-cog-outline"
            :to="'/settings/integrations/delivery-providers/boxy'"
          >
            إعداد
          </v-btn>

          <v-btn v-else variant="text" block disabled> غير متاح بعد </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { connectionMeta } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';

const store = useDeliveryProviderStore();
const providers = computed(() => store.providers);
const conn = (p) => connectionMeta(p.connectionStatus);

onMounted(() => store.fetchProviders());
</script>
