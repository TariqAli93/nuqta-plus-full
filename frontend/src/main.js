import { createApp } from 'vue';
import { createPinia } from 'pinia';
import vuetify from './plugins/vuetify';
import router from './router';
import fontLoader from './plugins/fontLoader';
import loadingPlugin from './plugins/loading';
import rbacPlugin from './plugins/rbac';
import VueApexCharts from 'vue3-apexcharts';
import App from './App.vue';
import '@/styles/main.scss';

// استيراد نظام الخطوط
import './styles/fonts.css';

import { initAxiosBaseUrl } from './plugins/axios';
import { useConnectionStore } from './stores/connection';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);
app.use(fontLoader);
app.use(loadingPlugin);
app.use(rbacPlugin);
app.use(VueApexCharts);

// Initialize server connection and sync axios baseURL
const connectionStore = useConnectionStore();
connectionStore.loadSavedConnection();
initAxiosBaseUrl(connectionStore);

app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', {
    error: err,
    info,
    component: instance?.type?.name,
    route: window.location.pathname,
  });
};

window.addEventListener('error', (event) => {
  console.error('[Global Error]', {
    message: event.message,
    error: event.error,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    route: window.location.pathname,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise]', {
    reason: event.reason,
    route: window.location.pathname,
  });
});

app.mount('#app');
