<template>
  <div class="perm-empty" role="status">
    <div v-if="pageTitle" class="perm-empty__eyebrow">{{ pageTitle }}</div>

    <v-icon :icon="icon" :size="iconSize" color="medium-emphasis" class="mb-3" />

    <div class="perm-empty__title">{{ title }}</div>
    <p class="perm-empty__msg">{{ message }}</p>

    <!-- Required permissions for the hidden content -->
    <div v-if="normalizedMissing.length" class="perm-empty__perms">
      <div class="perm-empty__perms-title">الصلاحيات المطلوبة لعرض المحتوى:</div>
      <ul class="perm-empty__perms-list">
        <li v-for="m in normalizedMissing" :key="m.permission + m.label">
          <span v-if="m.label" class="perm-empty__perms-label">{{ m.label }}</span>
          <code class="perm-empty__perms-key">{{ m.permission }}</code>
        </li>
      </ul>
    </div>

    <p v-if="suggestion" class="perm-empty__suggestion">{{ suggestion }}</p>

    <slot />

    <div v-if="showHome" class="perm-empty__actions">
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-home" @click="goHome">
        الذهاب للوحة التحكم
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Friendly empty-state shown when a page (or a whole section of it) has nothing
 * to render because the user lacks the permissions for its content — even though
 * they were allowed to OPEN the page. This is a NORMAL display state, NOT an
 * error: never pair it with a toast/dialog.
 *
 * Usage:
 *   <PermissionEmptyState
 *     page-title="الرئيسية"
 *     :missing-permissions="[
 *       { label: 'عرض مبيعات وفواتير اليوم', permission: 'sales:read' },
 *       { label: 'عرض العملاء والمستحقات', permission: 'customers:read' },
 *     ]"
 *   />
 *
 * `missingPermissions` accepts either plain key strings ('sales:read') or
 * objects ({ label, permission }). The legacy `permission` prop is merged in for
 * backward-compat with earlier call sites.
 */
const props = defineProps({
  // Small eyebrow above the title (usually the page name).
  pageTitle: { type: String, default: '' },
  icon: { type: String, default: 'mdi-lock-outline' },
  iconSize: { type: [Number, String], default: 64 },
  title: { type: String, default: 'لا توجد بيانات متاحة لحسابك في هذه الصفحة' },
  message: {
    type: String,
    default: 'حسابك يملك صلاحية فتح الصفحة، لكن لا يملك صلاحيات عرض محتوى هذه الصفحة.',
  },
  // Array of permission KEY strings OR { label, permission } objects.
  missingPermissions: { type: Array, default: () => [] },
  // Legacy single/array permission prop (merged into missingPermissions).
  permission: { type: [String, Array], default: null },
  suggestion: { type: String, default: '' },
  // Show a "go to dashboard" button (useful when the WHOLE page is empty).
  showHome: { type: Boolean, default: false },
});

const router = useRouter();
const goHome = () => router.push('/');

const normalizedMissing = computed(() => {
  const out = [];
  const push = (item) => {
    if (!item) return;
    if (typeof item === 'string') out.push({ label: '', permission: item });
    else if (item.permission) out.push({ label: item.label || '', permission: item.permission });
  };
  props.missingPermissions.forEach(push);
  if (props.permission) {
    (Array.isArray(props.permission) ? props.permission : [props.permission]).forEach(push);
  }
  // De-dup by permission key.
  const seen = new Set();
  return out.filter((m) => (seen.has(m.permission) ? false : seen.add(m.permission)));
});
</script>

<style scoped>
.perm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  min-height: 240px;
}
.perm-empty__eyebrow {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 8px;
}
.perm-empty__title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 6px;
}
.perm-empty__msg {
  color: rgba(var(--v-theme-on-surface), 0.6);
  max-width: 480px;
  margin-bottom: 12px;
}
.perm-empty__perms {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 12px;
  padding: 12px 18px;
  margin-bottom: 12px;
  text-align: start;
  max-width: 480px;
}
.perm-empty__perms-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.65);
  margin-bottom: 6px;
}
.perm-empty__perms-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.perm-empty__perms-list li {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.perm-empty__perms-key {
  background: rgba(var(--v-theme-on-surface), 0.08);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.8rem;
}
.perm-empty__suggestion {
  color: rgba(var(--v-theme-on-surface), 0.6);
  max-width: 480px;
  font-size: 0.88rem;
  margin-bottom: 8px;
}
.perm-empty__actions {
  margin-top: 8px;
}
</style>
