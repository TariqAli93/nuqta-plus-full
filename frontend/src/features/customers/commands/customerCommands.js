/**
 * Customer feature commands (rule 9: page commands live in the Command Registry,
 * owned by the feature, not hand-wired into the page template).
 *
 * Pure data — execute uses the injected CommandContext. Aggregated centrally by
 * `@/commands/useCommands`. The command bar, palette, keyboard and any context
 * menu all invoke these by id (single execution path, no duplication).
 *
 * @type {import('@/commands/core.js').AppCommand[]}
 */
export const customerCommands = [
  {
    id: 'customers.create',
    title: 'إضافة عميل',
    icon: 'mdi-account-plus',
    group: 'إجراءات',
    scope: 'route',
    routes: ['/customers'],
    permission: 'customers:create',
    primary: true,
    shortcut: 'Ctrl+N',
    execute: (ctx) => ctx.app.navigate('/customers/new'),
  },
  {
    id: 'customers.open-list',
    title: 'العملاء',
    description: 'الانتقال إلى قائمة العملاء',
    icon: 'mdi-account-multiple',
    group: 'تنقّل',
    scope: 'global',
    permission: 'view:customers',
    keywords: ['customers', 'عملاء'],
    execute: (ctx) => ctx.app.navigate('/customers'),
  },
];
