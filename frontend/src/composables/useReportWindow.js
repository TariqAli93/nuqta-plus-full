import router from '@/router';

/**
 * Open a quick-question report in its OWN window.
 *
 * - In Electron: asks the main process (IPC `reports:open`) to open a dedicated
 *   BrowserWindow for `type`, deduped + focused — `openReportWindow('sales')`.
 * - In a plain browser (dev / web): falls back to `window.open` on the route,
 *   or a same-tab navigation if popups are blocked, so the feature still works.
 *
 * `params` are initial filters (from/to/branchId/…) forwarded to
 * the report page via IPC payload (Electron) or the URL query (web).
 */
export function openReportWindow(type, params = {}) {
  const electron = typeof window !== 'undefined' ? window.electronAPI : null;
  if (electron?.openReportWindow) {
    // In Electron we let IPC failures REJECT so the caller can clear its loading
    // state and show a clear "تعذر فتح التقرير" message. The main process opens
    // the window immediately and resolves right away (it does not wait for the
    // report data), so this promise settles fast — typically well under 100ms.
    return Promise.resolve(electron.openReportWindow(type, params));
  }
  // Plain browser (dev / web): open the route in its own popup, or same-tab if
  // popups are blocked, so the feature still works.
  openInBrowser(type, params);
  return Promise.resolve({ ok: true, opened: true, web: true });
}

function openInBrowser(type, params) {
  const resolved = router.resolve({ name: reportRouteName(type), query: params || {} });
  const href = resolved.href;
  const win = window.open(href, `report_${type}`, 'width=1200,height=800');
  if (!win) {
    // Popup blocked → navigate in the current tab so the user still sees it.
    router.push(resolved.location || { name: reportRouteName(type), query: params || {} });
  }
}

/** Map a report type to its standalone route name. */
export function reportRouteName(type) {
  return `Report_${String(type).replace(/-/g, '_')}`; // e.g. 'cash-box' → 'Report_cash_box'
}
