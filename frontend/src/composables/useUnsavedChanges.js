import { onMounted, onUnmounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

/**
 * Guard a page against losing unsaved edits (desktop convention). Prompts on
 * in-app navigation away AND on window close/reload while `isDirty` is true.
 *
 * Uses the native confirm dialog (Electron renders an OS dialog) because route
 * guards and `beforeunload` need a synchronous decision.
 *
 * @param {import('vue').Ref<boolean>} isDirty
 * @param {{ message?: string }} [opts]
 */
export function useUnsavedChanges(isDirty, { message } = {}) {
  const msg = message || 'لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟';

  onBeforeRouteLeave(() => {
    if (!isDirty.value) return true;
    return window.confirm(msg);
  });

  const onBeforeUnload = (e) => {
    if (!isDirty.value) return;
    e.preventDefault();
    e.returnValue = ''; // Chromium shows its standard unsaved-changes prompt.
  };

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));
}
