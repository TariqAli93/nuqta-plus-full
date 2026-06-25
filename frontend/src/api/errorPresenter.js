import router from '@/router';
import { useNotificationStore } from '@/stores/notification';
import { useErrorDialogStore } from '@/stores/errorDialog';
import { buildPermissionDeniedDialog } from '@/utils/errorTranslator';
import { ErrorCodes } from './AppError';

/** Contextual "what to do next" link for a few well-known error shapes. */
function getHelpLinkForError(appError) {
  const status = appError.status;
  const url = appError.originalError?.config?.url || '';
  if (status === 401) return { url: '/auth/login', text: 'تسجيل الدخول' };
  if (status === 403) return { url: '/profile', text: 'التحقق من الصلاحيات' };
  if (status === 404 && url.includes('/products')) return { url: '/products', text: 'عرض المنتجات' };
  if (status === 404 && url.includes('/customers')) return { url: '/customers', text: 'عرض العملاء' };
  return null;
}

/**
 * Present an AppError to the user on the right surface — the SINGLE place that
 * decides toast vs dialog. Conversion (toAppError) is separate from this
 * decision (rule 6), so callers convert once and choose whether to present.
 *
 * - permission/capability denial → structured error dialog
 * - validation with detail lines  → details dialog
 * - everything else               → one toast (optionally with a help action)
 *
 * Canceled errors are never shown. The notification store dedups identical
 * messages within a short window, so if a store ALSO toasts the same
 * AppError.message the user still sees exactly one toast.
 */
export function presentAppError(appError) {
  if (!appError || appError.code === ErrorCodes.CANCELED) return appError;
  const notify = useNotificationStore();

  if (appError.code === 'PERMISSION_DENIED' || appError.code === 'CAPABILITY_DENIED') {
    const dialog = buildPermissionDeniedDialog(appError.originalError);
    if (dialog) {
      useErrorDialogStore().show(dialog);
      return appError;
    }
  }

  if (appError.details.length > 0) {
    useErrorDialogStore().show({
      title: 'خطأ في التحقق من البيانات',
      message: appError.message,
      details: appError.details,
      helpLink: appError.status === 422 ? { url: '/settings', text: 'التحقق من الإعدادات' } : null,
    });
    return appError;
  }

  const helpLink = getHelpLinkForError(appError);
  if (helpLink) {
    notify.showNotification({
      message: appError.message,
      type: 'error',
      timeout: 6000,
      action: { label: helpLink.text, onClick: () => helpLink.url && router.push(helpLink.url) },
    });
  } else {
    notify.error(appError.message);
  }
  return appError;
}
