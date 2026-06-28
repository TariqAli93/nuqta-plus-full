/**
 * Built-in page (route) commands.
 *
 * These are page-scoped actions whose implementation is generic enough to live
 * centrally (navigation to a `/new` route, print the current view) — so pages
 * don't hand-write command-bar buttons. Page actions that need page-local state
 * (edit/delete the open record, export the loaded dataset, feed a selection)
 * are registered by the page itself at runtime via `useCommands().register()`,
 * and MUST reuse a stable `id` so the bar, context menu and palette all invoke
 * the same execution path (never duplicate the handler).
 *
 * Pure data — `execute` uses only the injected context.
 *
 * @type {import('./core.js').AppCommand[]}
 */
export const pageCommands = [
  // ── Create-record commands (navigations to existing `/new` routes) ───────
  // NOTE: `customers.create` was migrated to the customers feature
  // (features/customers/commands/customerCommands.js) as the reference for
  // feature-owned commands. The remaining built-ins stay here until their
  // features are migrated.
  {
    id: 'products.create',
    title: 'إضافة منتج',
    icon: 'mdi-package-variant-plus',
    group: 'إجراءات',
    scope: 'route',
    routes: ['/products'],
    permission: 'products:create',
    primary: true,
    shortcut: 'Ctrl+N',
    execute: (ctx) => ctx.app.navigate('/products/new'),
  },
  {
    id: 'purchases.create',
    title: 'فاتورة شراء جديدة',
    icon: 'mdi-cart-plus',
    group: 'إجراءات',
    scope: 'route',
    routes: ['/purchases'],
    permission: 'purchases:create',
    primary: true,
    shortcut: 'Ctrl+N',
    execute: (ctx) => ctx.app.navigate('/purchases/new'),
  },
  {
    id: 'invoices.new-sale',
    title: 'بيع جديد',
    icon: 'mdi-cash-register',
    group: 'إجراءات',
    scope: 'route',
    routes: ['/sales'],
    permission: 'sales:create',
    primary: true,
    execute: (ctx) => ctx.app.navigate('/sales/pos'),
  },

  // // ── Generic page action available on any route ───────────────────────────
  // {
  //   id: 'page.print',
  //   title: 'طباعة',
  //   icon: 'mdi-printer',
  //   group: 'إجراءات',
  //   scope: 'route', // no `routes` ⇒ matches every route
  //   keywords: ['print', 'طباعة'],
  //   execute: (ctx) => ctx.app.print(),
  // },
];
