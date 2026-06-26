/**
 * Global application commands (scope: 'global').
 *
 * Pure data — every `execute` operates through the injected {@link CommandContext}
 * (no direct store/router imports), so this module is import-safe and testable.
 * These are the canonical implementations: the command bar, menu bar, command
 * palette and keyboard shortcuts all invoke them by `id` (never re-implement).
 */

/** @type {import('./core.js').AppCommand[]} */
export const globalCommands = [
  {
    id: 'app.command-palette',
    title: 'لوحة الأوامر',
    description: 'البحث وتنفيذ أي أمر',
    icon: 'mdi-console-line',
    shortcut: 'Ctrl+Shift+P',
    group: 'تنقّل',
    keywords: ['palette', 'command', 'بحث', 'اوامر', 'أوامر'],
    scope: 'global',
    execute: (ctx) => ctx.app.openCommandPalette(),
  },
  {
    id: 'app.go-dashboard',
    title: 'الانتقال إلى الرئيسية',
    icon: 'mdi-view-dashboard',
    group: 'تنقّل',
    keywords: ['dashboard', 'home', 'رئيسية', 'لوحة'],
    scope: 'global',
    execute: (ctx) => ctx.app.navigate('/'),
  },
  {
    id: 'app.open-settings',
    title: 'فتح الإعدادات',
    icon: 'mdi-tune',
    group: 'تنقّل',
    permission: 'view:settings',
    keywords: ['settings', 'اعدادات', 'إعدادات'],
    scope: 'global',
    execute: (ctx) => ctx.app.navigate('/settings'),
  },
  {
    id: 'app.refresh',
    title: 'تحديث الصفحة',
    icon: 'mdi-refresh',
    shortcut: 'F5',
    group: 'عام',
    keywords: ['refresh', 'reload', 'تحديث'],
    scope: 'global',
    // Remounts the current page (re-runs its data load) — NOT an Electron
    // window reload. The shortcut engine preventDefault's F5 so Chromium never
    // reloads the renderer.
    execute: (ctx) => ctx.app.refreshWorkspace(),
  },
  {
    id: 'app.toggle-theme',
    title: 'تبديل السمة (فاتح/داكن)',
    icon: 'mdi-theme-light-dark',
    group: 'عام',
    keywords: ['theme', 'dark', 'light', 'سمة', 'داكن', 'فاتح'],
    scope: 'global',
    execute: (ctx) => ctx.app.toggleTheme(),
  },
  {
    id: 'app.backup',
    title: 'النسخ الاحتياطي',
    description: 'فتح تبويب النسخ الاحتياطي في الإعدادات',
    icon: 'mdi-backup-restore',
    group: 'عام',
    permission: 'view:settings',
    keywords: ['backup', 'restore', 'نسخ', 'احتياطي', 'استعادة'],
    scope: 'global',
    // Real action: open Settings AND select the backup tab (not just the page).
    // The operation commands `settings.backup.create` / `.restore` actually run.
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'backup' }),
  },
  {
    id: 'app.logout',
    title: 'تسجيل الخروج',
    icon: 'mdi-logout',
    group: 'حساب',
    keywords: ['logout', 'signout', 'خروج', 'تسجيل'],
    scope: 'global',
    execute: (ctx) => ctx.app.logout(),
  },
];
