<template>
  <!-- Renderless host: this component has no visual chrome of its own. The
       toast snackbar, error dialog and update banner are mounted globally in
       App.vue so they also work on pre-auth screens. This component owns the
       *session-scoped realtime alert connection* lifecycle that previously
       lived inline in MainLayout — kept here so the desktop shell has a single,
       clear home for live notifications. The unread badge is rendered by the
       command bar. -->
  <span class="dt-notifications-host" aria-hidden="true" hidden></span>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAlertStore } from '@/stores/alert';

const authStore = useAuthStore();
const alertStore = useAlertStore();

onMounted(() => {
  if (authStore.isAuthenticated) {
    alertStore.connectRealtime();
  }
});

onUnmounted(() => {
  alertStore.disconnectRealtime();
});
</script>
