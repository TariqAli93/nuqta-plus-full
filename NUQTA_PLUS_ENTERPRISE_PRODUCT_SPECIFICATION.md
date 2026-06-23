# NuqtaPlus Enterprise Product Specification

Version: Draft 1  
Date: 2026-06-23  
Scope: missing official product-specification documentation for NuqtaPlus as a world-class Arabic ERP/POS product.  
Audience: product, design, QA, frontend, backend, technical writing, support, training, sales, investors.

This document covers Reports 20 through 32 only:

- Complete Design Tokens Specification
- Complete Component Library
- Complete Interaction Specification
- Accessibility WCAG AA
- Performance Experience Specification
- Offline Experience
- Printing Experience
- Import / Export Experience
- AI and Smart Features Roadmap
- Internationalization
- User Personas
- Business Rule Specification
- Product Roadmap

This is not a code review, architecture review, security review, UX audit, workflow audit, or redesign critique. It is the missing enterprise-grade product specification layer.

---

# Report 20 - Complete Design Tokens Specification

## 20.1 Token Naming Convention

Token format:

```text
category.role.state.scale
```

Examples:

```text
color.sales.default
surface.app.default
text.body.default
radius.component.md
motion.duration.fast
table.row.height.compact
form.input.height.default
```

Rules:

- Tokens describe purpose, not raw color names.
- Component styles must consume tokens, not hardcoded values.
- New UI must not introduce ad hoc colors, spacing, shadows, z-index, or typography values.
- Dark mode tokens must be defined as semantic equivalents, not inverted manually.

## 20.2 Color Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `color.brand.primary` | `#2563EB` | Primary brand actions and active navigation | Save, complete sale, selected tab | Use for one primary action per surface | Do not use for every icon/card |
| `color.brand.secondary` | `#475569` | Secondary brand surfaces and quiet UI | Secondary button, neutral icon | Use when primary would overemphasize | Do not use for disabled state |
| `color.success.default` | `#16A34A` | Successful, completed, paid, healthy | Paid chip, sale complete | Pair with label/icon | Do not use only color to communicate success |
| `color.warning.default` | `#D97706` | Risk, due soon, low stock, needs review | Low stock, upcoming due date | Use before danger state | Do not use for normal pending states |
| `color.danger.default` | `#DC2626` | Destructive, overdue, failed, loss | Delete, failed payment, overdue debt | Reserve for genuine risk | Do not use for minor validation hints |
| `color.info.default` | `#0284C7` | Informational system state | Sync complete, helper banner | Use for neutral guidance | Do not use for required action |
| `color.sales.default` | `#2563EB` | Sales/revenue domain | Sales KPI, invoice icon | Use consistently for sales data | Do not mix with inventory color |
| `color.profit.default` | `#059669` | Profit, margin, positive result | Profit card, positive margin | Use for financial gain | Do not use for paid status if profit is not shown |
| `color.loss.default` | `#DC2626` | Loss, negative profit/margin | Loss chip, below-cost sale | Use with explanation | Do not hide negative values in neutral text |
| `color.expense.default` | `#EA580C` | Expenses and outflows | Expense report, cash out | Use for money leaving business | Do not use for inventory warnings |
| `color.debt.default` | `#B45309` | Receivables/payables and owed money | Customer debt, supplier payable | Use for open balances | Do not use for paid/settled records |
| `color.inventory.default` | `#0D9488` | Products, stock, counts | Product icon, stock KPI | Use for inventory area | Do not use for shipping |
| `color.warehouse.default` | `#0891B2` | Warehouses, transfers, movement | Transfer request, warehouse card | Use for stock location changes | Do not use for product master data |
| `color.shipping.default` | `#4F46E5` | Delivery and shipments | Shipment chip, provider card | Use for delivery lifecycle | Do not use for online order source |
| `color.online.default` | `#9333EA` | Online channels and ecommerce orders | Channel badge, online order status | Use for online order domain | Do not let purple dominate all UI |
| `color.accounting.default` | `#334155` | Accounting and finance controls | GL, period close | Keep understated | Do not use bright colors for accounting base state |
| `color.approval.default` | `#DB2777` | Manager approval required | Locked discount, refund approval | Use when human approval is needed | Do not use for simple errors |
| `color.disabled.default` | `#CBD5E1` | Disabled control state | Disabled button/icon | Combine with text explanation | Do not rely on low contrast alone |
| `color.readonly.default` | `#E2E8F0` | Read-only fields/surfaces | Locked form field | Use to show visible but not editable | Do not make read-only look broken |
| `color.focus.default` | `#2563EB` | Keyboard focus ring | Focused input/button | Always visible | Do not remove focus outlines |
| `color.selection.default` | `#BFDBFE` | Selected table rows/cards | Bulk-selected rows | Use with checkbox/marker | Do not use same style as hover |

## 20.3 Surface Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `surface.app.default` | `#F8FAFC` | Main app background | Main layout | Use behind page bands | Do not put cards on saturated backgrounds |
| `surface.panel.default` | `#FFFFFF` | Cards, panels, forms | Settings card, side panel | Use for primary content | Do not nest panel inside panel without purpose |
| `surface.panel.muted` | `#F1F5F9` | Subtle grouped areas | Filter bar, table header | Use for grouping | Do not use for disabled controls |
| `surface.panel.raised` | `#FFFFFF` | Overlays and floating panels | Menu, command palette | Add shadow/elevation | Do not use elevation on every card |
| `surface.danger.subtle` | `#FEF2F2` | Danger warning surface | Delete confirmation body | Use for warnings | Do not make entire page red |
| `surface.success.subtle` | `#F0FDF4` | Successful state surface | Payment complete summary | Use for completion | Do not overuse on static paid rows |
| `surface.warning.subtle` | `#FFFBEB` | Warning state surface | Low stock card | Use for attention | Do not use for neutral pending |
| `surface.dark.app` | `#0F172A` | Dark app background | Dark mode | Keep contrast high | Do not invert light colors manually |
| `surface.dark.panel` | `#1E293B` | Dark cards/panels | Dark mode cards | Use semantic dark token | Do not use pure black for all surfaces |

## 20.4 Text Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `text.strong` | `#0F172A` | Headings, primary values | Page title, KPI value | Use for most important text | Do not use for helper text |
| `text.default` | `#334155` | Body text | Labels, body copy | Use for normal content | Do not use low contrast gray |
| `text.muted` | `#64748B` | Metadata and hints | timestamps, subtitles | Use for secondary content | Do not use for required information |
| `text.inverse` | `#FFFFFF` | Text on dark/colored buttons | Primary button label | Verify contrast | Do not use on pale colors |
| `text.danger` | `#B91C1C` | Error text | Field error | Pair with icon/field state | Do not use for warnings |
| `text.success` | `#15803D` | Success labels | Paid, completed | Use sparingly | Do not use for general positive emphasis |
| `text.link` | `#2563EB` | Links | Support link, drilldown | Underline on hover/focus | Do not style disabled text as link |

## 20.5 Icon Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `icon.size.xs` | `14px` | Tiny inline metadata | status dot icon | Use in chips | Do not use for tappable controls |
| `icon.size.sm` | `18px` | Buttons and table actions | edit icon | Standard row actions | Do not mix random icon sizes |
| `icon.size.md` | `22px` | Toolbar/navigation | nav icon | Use for most UI icons | Do not use for dense table rows |
| `icon.size.lg` | `28px` | Empty states/cards | KPI icon | Use sparingly | Do not use as decoration only |
| `icon.color.default` | `text.muted` | Standard icons | toolbar icons | Keep secondary | Do not overpower labels |
| `icon.color.active` | `color.brand.primary` | Active nav/selected state | active menu | Use with selected state | Do not use for inactive nav |
| `icon.color.danger` | `color.danger.default` | Destructive icon | delete | Use only in danger context | Do not use red icons for normal close |

## 20.6 Border Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `border.width.none` | `0` | Borderless surfaces | full page bands | Use intentionally | Do not rely on shadow for all separation |
| `border.width.hairline` | `1px` | Default divisions | cards, tables, inputs | Use consistently | Do not mix 1px/2px randomly |
| `border.width.focus` | `2px` | Focus ring | keyboard focus | Always visible | Do not remove in production |
| `border.color.default` | `#E2E8F0` | Standard border | cards, table | Use on light surfaces | Do not use low-contrast border in dark mode |
| `border.color.strong` | `#CBD5E1` | Emphasized borders | selected panel | Use when grouping important area | Do not create visual noise |
| `border.color.danger` | `#FCA5A5` | Error border | invalid input | Pair with message | Do not rely only on red border |

## 20.7 Radius Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `radius.none` | `0` | Full-width bands/table edges | page bands | Use for structural sections | Do not use everywhere |
| `radius.xs` | `4px` | chips, small controls | status chip | Use in dense UI | Do not make tiny pills too rounded |
| `radius.sm` | `6px` | inputs, buttons | text field | Use default controls | Do not mix with 20px buttons |
| `radius.md` | `8px` | cards, tables | data card | Default application radius | Do not exceed for ordinary cards |
| `radius.lg` | `12px` | overlays, command palette | dialog/menu | Use for floating surfaces | Do not use for all cards |
| `radius.full` | `999px` | pills/chips | status pill | Use for badges/chips only | Do not use for large cards |

## 20.8 Shadow And Elevation Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `shadow.none` | `none` | Default cards/panels | normal card | Prefer flat UI | Do not shadow every card |
| `shadow.sm` | `0 1px 2px rgba(15,23,42,.08)` | small floating controls | dropdown | Use for menus | Do not use for page layout |
| `shadow.md` | `0 8px 24px rgba(15,23,42,.12)` | side panels/dialogs | side panel | Use for overlays | Do not stack many elevated surfaces |
| `shadow.lg` | `0 16px 48px rgba(15,23,42,.18)` | command palette/full overlay | command palette | Use sparingly | Do not use inside tables |
| `elevation.base` | `0` | default surfaces | cards | Default | Do not over-elevate |
| `elevation.overlay` | `8` | dialogs/menus | modal | Overlay only | Do not assign to static page cards |
| `elevation.critical` | `16` | blocking confirmation | restore dialog | Only for blocking flows | Do not use for notifications |

## 20.9 Opacity Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `opacity.disabled` | `.45` | disabled controls | disabled button | Combine with disabled cursor/explanation | Do not make labels unreadable |
| `opacity.muted` | `.68` | secondary content | helper text | Use for non-critical text | Do not use for required labels |
| `opacity.hover` | `.08` | hover layer | table row hover | Use subtle hover | Do not change layout |
| `opacity.pressed` | `.14` | active press layer | pressed button | Use for feedback | Do not leave active after click |
| `opacity.scrim` | `.48` | modal background | dialog scrim | Use only blocking overlay | Do not dim non-modal side panels too heavily |

## 20.10 Motion, Animation, Transition Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `motion.duration.instant` | `80ms` | button press | press feedback | Use for tactile response | Do not animate important layout this fast |
| `motion.duration.fast` | `120ms` | hover/focus | row hover | Keep UI snappy | Do not exceed 150ms for hover |
| `motion.duration.base` | `180ms` | side panel, menu | panel slide | Default transition | Do not animate all child elements |
| `motion.duration.slow` | `260ms` | dialog/page transition | command palette | Use for larger overlays | Do not slow repeated workflows |
| `motion.easing.standard` | `cubic-bezier(.2,0,0,1)` | most transitions | panel open | Use consistently | Do not mix easing styles per component |
| `motion.easing.out` | `cubic-bezier(0,0,.2,1)` | enter animation | snackbar in | Use on entry | Do not use for exit |
| `motion.easing.in` | `cubic-bezier(.4,0,1,1)` | exit animation | dialog out | Use on exit | Do not bounce operational UI |
| `animation.skeleton` | `1200ms linear infinite` | loading skeleton | table skeleton | Use for loading | Do not use if stale data can remain |
| `transition.color` | `120ms ease` | hover/active color | button hover | Use for state changes | Do not animate text size |
| `transition.transform` | `180ms standard` | panels, drawers | side panel | Use small transforms | Do not animate table rows excessively |

## 20.11 Blur Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `blur.none` | `0` | default UI | all app screens | Prefer no blur | Do not blur dense data tables |
| `blur.backdrop.sm` | `4px` | optional overlay backdrop | command palette | Use sparingly | Do not reduce text readability |
| `blur.backdrop.md` | `8px` | modal scrim optional | blocking modal | Use only if performance acceptable | Do not use on low-end devices by default |

## 20.12 Grid And Breakpoint Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `grid.columns.desktop` | `12` | desktop layouts | settings forms | Use 12-col grid | Do not create custom per-screen grid |
| `grid.columns.tablet` | `8` | tablet layouts | POS tablet | Use for medium screens | Do not cram desktop table |
| `grid.columns.mobile` | `4` | mobile layouts | scanner mode | Use card queues | Do not show wide tables |
| `container.max.default` | `1440px` | content pages | admin/report | Center content | Do not constrain POS unnecessarily |
| `container.max.form` | `960px` | form pages | product wizard | Keep forms readable | Do not stretch fields edge to edge |
| `breakpoint.xs` | `0` | phone | mobile cards | Use bottom sheets | Do not rely on hover |
| `breakpoint.sm` | `600px` | large phone | scanner workflows | Use single-column forms | Do not show desktop drawer |
| `breakpoint.md` | `960px` | tablet | POS tablet | Use split views | Do not overload sidebars |
| `breakpoint.lg` | `1280px` | desktop | standard app | Use full table layout | Do not hide useful columns |
| `breakpoint.xl` | `1600px` | wide desktop | operations center | Add extra side panel | Do not stretch line lengths |

## 20.13 Z-Index Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | ---: | --- | --- | --- | --- |
| `z.base` | 0 | normal content | page body | Default | Do not set arbitrary values |
| `z.sticky` | 10 | sticky headers/footers | table header | Use for local stickiness | Do not cover overlays |
| `z.drawer` | 100 | nav drawers | main drawer | Keep below dialogs | Do not place toast below drawer |
| `z.sidePanel` | 300 | side panels | record details | Use for non-blocking overlay | Do not block app unless needed |
| `z.dropdown` | 500 | menus/selects | autocomplete | Above panels if inside | Do not exceed modal z |
| `z.toast` | 700 | snackbars/toasts | save success | Above page, below modal | Do not hide behind modals |
| `z.modal` | 1000 | dialogs | restore wizard | Blocking only | Do not use for simple popovers |
| `z.commandPalette` | 1200 | command palette | Ctrl+K | Top interactive layer | Do not stack dialogs over it |
| `z.critical` | 1500 | fatal app state | backend unavailable | Highest | Use rarely |

## 20.14 Focus Ring Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `focus.ring.width` | `2px` | focus outline | inputs/buttons | Always visible | Do not suppress for mouse users globally |
| `focus.ring.offset` | `2px` | separation | buttons | Use for clarity | Do not overlap label text |
| `focus.ring.color` | `color.focus.default` | focus state | all interactive controls | Consistent token | Do not use random blue |
| `focus.ring.error` | `color.danger.default` | invalid focused field | error field | Pair with error message | Do not show error only on blur |
| `focus.ring.inset` | `inset 0 0 0 2px` | table cells | editable cell | Use in dense grids | Do not change row height |

## 20.15 Spacing Scale

| Name | Value | Usage | Examples | Do | Don't |
| --- | ---: | --- | --- | --- | --- |
| `space.0` | `0` | reset | flush table edge | Use intentionally | Do not remove needed breathing room |
| `space.1` | `4px` | tiny gaps | icon-label gap | Use inside chips | Do not use as page padding |
| `space.2` | `8px` | compact gaps | button groups | Default small gap | Do not use random 10px |
| `space.3` | `12px` | compact padding | dense card | Use in table toolbar | Do not cram forms |
| `space.4` | `16px` | default padding | card/form | Standard panel padding | Do not exceed for dense table cells |
| `space.5` | `20px` | section spacing | form sections | Use for form rhythm | Do not use if 24px better aligns |
| `space.6` | `24px` | page section gap | dashboard bands | Use for page rhythm | Do not use inside chips |
| `space.8` | `32px` | major blocks | page groups | Use sparingly | Do not create huge scroll gaps |
| `space.10` | `40px` | large hero/setup pages | onboarding | Setup only | Do not use operational tables |

## 20.16 Typography Scale

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `font.family.base` | Arabic-first UI font fallback | all UI | page labels | Use one app font stack | Do not mix random fonts |
| `font.family.numeric` | tabular numeral capable font | tables/money | totals | Enable tabular nums | Do not let numbers jitter |
| `font.size.caption` | `11px` | chips/timestamps | status chip | Use for metadata | Do not use for body |
| `font.size.meta` | `12px` | helper text | field hint | Keep readable | Do not go below 11px |
| `font.size.body` | `14px` | primary UI | table cells | Default | Do not use 16px in dense tables |
| `font.size.bodyLg` | `16px` | forms/reading | descriptions | Use for onboarding/settings | Do not use in compact grids |
| `font.size.h3` | `18px` | panel title | side panel | Use for section heading | Do not use for every card |
| `font.size.h2` | `20px` | major section | dashboard group | Use sparingly | Do not nest H2 in cards repeatedly |
| `font.size.h1` | `24px` | page title | customers | Use once per page | Do not use for table title |
| `font.size.display` | `32px` | owner dashboard metrics | profit | Use for KPIs | Do not use in admin forms |
| `font.weight.regular` | `400` | body | text | Default | Do not use light font |
| `font.weight.medium` | `500` | labels | field labels | Use for scannability | Do not make all text bold |
| `font.weight.semibold` | `600` | headings/table primary | entity name | Use for emphasis | Do not overuse |
| `font.weight.bold` | `700` | page title/KPI | H1 | Use sparingly | Do not use for helper text |
| `lineHeight.compact` | `1.25` | chips/tables | table cell | Dense data | Do not use for paragraphs |
| `lineHeight.default` | `1.5` | body/forms | field help | Standard | Do not create tall row surprise |

## 20.17 Component Size Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | ---: | --- | --- | --- | --- |
| `size.button.sm.height` | `32px` | dense toolbar | table filter | Use in compact tables | Do not use as touch target |
| `size.button.md.height` | `40px` | default buttons | save | Standard | Do not mix heights in same toolbar |
| `size.button.lg.height` | `48px` | important form action | complete sale | Use for primary tasks | Do not use everywhere |
| `size.touch.min` | `48px` | mobile/touch | POS tablet | Minimum touch target | Do not create 32px mobile buttons |
| `size.input.md.height` | `40px` | default inputs | forms | Standard | Do not create uneven form rows |
| `size.input.lg.height` | `48px` | POS/payment inputs | money input | Use for high-frequency entry | Do not use in dense filters |
| `size.iconButton.md` | `36px` | table/toolbar icon button | row menu | Standard | Do not make 24px clickable icons |
| `size.sidePanel.md` | `560px` | common side panel | customer quick add | Standard detail panel | Do not exceed if form can be wizard |
| `size.sidePanel.lg` | `720px` | complex side panel | order edit | Use only for complex forms | Do not use for simple notes |

## 20.18 Density Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `density.compact.rowHeight` | `44px` | power-user tables | sales list | Use when data-heavy | Do not use for touch/mobile |
| `density.default.rowHeight` | `52px` | default tables | customers | Standard | Do not exceed unnecessarily |
| `density.comfortable.rowHeight` | `60px` | low-density/visual tables | owner dashboard | Use for readability | Do not use for 100-row operational table |
| `density.form.compactGap` | `12px` | dense forms | filters | Compact only | Do not use for setup wizard |
| `density.form.defaultGap` | `20px` | standard forms | product form | Default | Do not create inconsistent gaps |
| `density.touch.rowHeight` | `64px` | tablet/mobile work queues | warehouse mobile | Touch mode | Do not use on desktop by default |

## 20.19 Table Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `table.header.height` | `44px` | table header | all tables | Sticky header | Do not let header wrap excessively |
| `table.row.height.compact` | `44px` | dense rows | sales/products | Use with density toggle | Do not put multiline content inside |
| `table.row.height.default` | `52px` | standard rows | customers | Default | Do not mix heights in same table |
| `table.row.hover.bg` | `#EFF6FF` | row hover | data tables | Subtle hover | Do not hide selected state |
| `table.row.selected.bg` | `#DBEAFE` | selected row | bulk selection | Show selected clearly | Do not use only checkbox |
| `table.cell.padding.x` | `12px` | table cell horizontal | all tables | Keep consistent | Do not use 24px in dense tables |
| `table.cell.padding.y` | `8px` | cell vertical | all tables | Keep rows scannable | Do not create cramped text |
| `table.footer.height` | `48px` | summary/pagination footer | reports | Sticky if totals matter | Do not hide totals above scroll |
| `table.action.width` | `48px` | row action menu | context menu | Keep action stable | Do not create 4 visible row buttons |

## 20.20 Form Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `form.section.gap` | `24px` | between form sections | product wizard | Use for grouping | Do not create one long undivided form |
| `form.field.gap` | `16px` | between fields | customer form | Standard | Do not use arbitrary spacing |
| `form.label.size` | `12px` | field labels | all forms | Always visible | Do not rely on placeholder only |
| `form.helper.size` | `12px` | helper/error text | field hints | Keep concise | Do not write paragraphs under fields |
| `form.footer.height` | `64px` | sticky form actions | side panels | Use for save/cancel | Do not let save disappear below fold |
| `form.required.marker` | `*` | required fields | forms | Use consistently | Do not overmark optional fields |
| `form.error.icon` | alert icon | invalid field | errors | Pair icon/text | Do not rely on red border only |

## 20.21 Chart Tokens

| Name | Value | Usage | Examples | Do | Don't |
| --- | --- | --- | --- | --- | --- |
| `chart.palette.1` | `color.sales.default` | primary measure | revenue | Use first series | Do not randomize series colors |
| `chart.palette.2` | `color.profit.default` | positive/profit series | profit | Use for gain | Do not use for expenses |
| `chart.palette.3` | `color.expense.default` | expense/outflow series | costs | Use for outflow | Do not use for stock |
| `chart.palette.4` | `color.inventory.default` | inventory series | stock value | Use for stock | Do not use for delivery |
| `chart.palette.5` | `color.shipping.default` | delivery series | shipments | Use for shipping | Do not use for sales |
| `chart.axis.text` | `text.muted` | chart labels | axis | Keep readable | Do not use tiny low-contrast labels |
| `chart.grid.line` | `border.color.default` | chart grid | reports | Subtle grid | Do not overdraw chart |
| `chart.tooltip.surface` | `surface.panel.raised` | tooltip | hover detail | Use elevated panel | Do not use browser default tooltip |
| `chart.negative` | `color.loss.default` | negative values | loss | Use clear warning | Do not hide negative sign |

---

# Report 21 - Complete Component Library

## 21.1 Component Standards

Every component must define:

- Purpose.
- Variants.
- States.
- Props/properties.
- Accessibility behavior.
- Keyboard behavior.
- RTL behavior.
- Dark mode behavior.
- Motion behavior.
- Use and avoid rules.

## 21.2 Core Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button | Trigger action | primary, secondary, tertiary, danger, icon, split | default, hover, focus, pressed, loading, disabled | label, icon, loading, disabled, type | Enter/Space activates; aria-label for icon | icon direction mirrored when needed; token colors | any explicit user action | navigation rows or status display |
| IconButton | Compact toolbar/table action | default, danger, selected | hover, focus, disabled | icon, tooltip, aria-label | tooltip required; 36px min desktop | use icon tokens | table row menu, toolbar | primary destructive action without label |
| SplitButton | Primary action plus menu | save + more, print + more | open, loading, disabled | primaryAction, menuItems | arrow key menu | menu opens aligned for RTL | related action family | unrelated actions |
| Card | Summary container | default, metric, entity, warning, insight | hover, selected, disabled | title, body, actions | if clickable, role/button/link | no nested cards unless repeated item | entity summary, repeated widgets | page section wrapper |
| Panel | Structured surface | side panel, form panel, detail panel | open, saving, error | title, sections, footer | trap focus only if modal | side panel slides from action edge | focused task detail | simple row expansion |
| Dialog | Blocking decision | confirm, critical, system | open, loading, error | title, message, actions | focus trap, Esc rules | centered, scrim | destructive confirmation | long forms |
| Drawer | Navigation or persistent side area | nav, filter, details | open, collapsed | items, active, footer | keyboard nav, landmarks | RTL drawer direction correct | nav/filter | blocking confirmation |
| BottomSheet | Mobile contextual action | action list, quick form | open, dragging | actions, handle | focus order, Escape/back closes | mobile only mostly | mobile action picker | desktop complex forms |
| Popover | Small anchored detail | tooltip, quick menu, field helper | open/closed | anchor, content | closes on Esc/click outside | flips for RTL | small contextual controls | high-risk confirmations |
| Toolbar | Page/table controls | page, table, report | sticky, compact | search, filters, actions | tab order logical | RTL ordering consistent | repeated page actions | unrelated groups |
| Tabs | Switch related views | top, segmented, vertical | active, disabled | items, active | arrow keys | RTL order natural | same entity views | unrelated pages |
| Accordion | Progressive disclosure | form section, advanced settings | expanded, collapsed | title, summary, content | Enter/Space toggle | arrow icon mirrors | optional/advanced content | core required fields |
| Stepper | Guided multi-step flow | horizontal, vertical, full-screen | active, complete, error | steps, current, validation | keyboard step nav | RTL step direction | setup/close/restore | simple forms |

## 21.3 Data Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DataTable | Structured record list | server, client, compact, comfortable | loading, empty, selected, error | columns, rows, sort, filters, selection | table semantics, row nav, sort labels | pinned RTL columns, dark row hover | operational lists | card grids requiring visual inspection |
| TableToolbar | Standard table controls | simple, advanced | filters active, selection active | search, filters, views, columns, density | search focus `/`; buttons labeled | sticky in dark/light | every major table | custom per-screen toolbar |
| SavedViewSelector | Switch table/report views | dropdown, chips | active, dirty | views, activeView | keyboard selectable | RTL dropdown | repeated filters | one-off simple pages |
| ColumnPicker | Customize visible columns | checklist | selected, disabled | columns | keyboard checkbox list | dark menu | complex tables | tiny fixed lists |
| BulkActionBar | Actions on selected rows | inline, sticky | visible, loading | selectionCount, actions | announces count | slides in 120ms | bulk operations | permanent toolbar clutter |
| RowContextMenu | Per-row secondary actions | standard, destructive group | open | actions, record | Shift+F10/right click | RTL menu position | row actions | primary action if one action dominates |
| ExpandableRow | Show row details | detail, timeline, source | expanded | row, content | aria-expanded | smooth height | audit details | large forms |
| Timeline | Chronological events | compact, detailed, audit | loading, empty | events, filters | list semantics | RTL time placement | customer/product/order history | unrelated metrics |
| ActivityFeed | Recent system/user activity | dashboard, entity | live, paused | items | announces new critical items | quiet motion | dashboards | high-volume logs |
| TreeView | Hierarchical data | accounts, categories | expanded, selected | nodes | arrow navigation | RTL indentation | chart of accounts | flat lists |
| Kanban | Status workflow | orders, tasks | dragging, empty lane | lanes, cards | keyboard move actions | RTL lane order | online orders/delivery | financial ledgers |
| Calendar | Time-based tasks | month, week, due list | today, selected | events | keyboard date nav | locale aware | recurring expenses/tasks | dense financial tables |

## 21.4 Form Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TextInput | Text entry | single, multiline | focus, error, disabled, readonly | label, value, maxLength | label required, error described | RTL text default | names/notes | numeric/money |
| MoneyInput | Currency amounts | sale, expense, payment | focus, invalid, locked | amount, currency, precision | announces currency | numeric alignment | all money fields | plain text input for money |
| QuantityStepper | Quantity entry | compact, touch, table cell | min/max/error | value, unit, step | arrow keys increment | touch target in mobile | POS, inventory | free text quantity |
| BarcodeInput | Barcode/SKU entry | scan, manual | scanning, found, not found | value, mode | Enter triggers lookup | success/error feedback | products/POS/receiving | generic search if barcode matters |
| ScannerInput | Hardware/camera scanner | hardware, camera | ready, scanning, error | targetEntity | sound/visual feedback | mobile camera mode | warehouse/POS | normal text fields |
| SmartSelect | Context-aware dropdown | single, grouped | loading, empty | options, recent, suggested | typeahead | RTL menu | branch, cashbox, provider | huge lists without search |
| Autocomplete | Entity selection | customer, product, supplier, account | loading, no result | query, results, createInline | arrow/enter support | RTL result layout | entity lookup | small option sets |
| DatePicker | Date selection | single, range, preset | selected, invalid | value, min, max, presets | keyboard calendar | locale calendar | reports, due dates | simple today default if no change |
| SegmentedControl | Small exclusive choice | payment, status, type | selected, disabled | options | arrow keys | RTL order | cash/debt/partial | long option lists |
| Toggle | Boolean setting | switch, checkbox | on/off/disabled | checked, label | Space toggles | RTL label order | settings | complex multi-choice |
| ChipSelector | Quick multi-select | tags, categories | selected, disabled | chips | keyboard nav | wraps in RTL | filters | large lists |
| FormSection | Group related fields | default, advanced | collapsed, error | title, summary | accordion semantics | token spacing | long forms | tiny two-field forms |
| StickyFormFooter | Persistent form actions | save, wizard, review | saving, disabled | primary, secondary | keyboard actions | bottom aligned | side panels/forms | simple inline edit |

## 21.5 Business Entity Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CustomerCard | Customer summary | compact, debt, profile | selected, overdue | name, phone, debt, risk | link/card semantics | debt color token | POS/profile/search | full history display |
| ProductCard | Product summary | grid, POS, inventory | out-of-stock, selected | name, price, stock, barcode | keyboard selectable | stock status visible | POS/product selection | detailed product editing |
| SupplierCard | Supplier summary | compact, payable | overdue | name, phone, payable | accessible action buttons | debt token | supplier profile/payables | purchase lines |
| WarehouseCard | Warehouse state | stock, transfer | selected, warning | name, branch, counts | selectable card | warehouse color | warehouse selector | long warehouse table |
| InvoiceCard | Invoice summary | sale, purchase, online | paid, unpaid, returned | number, total, party, status | open with Enter | status chip | search/results | full invoice detail |
| ShipmentCard | Shipment summary | compact, exception | late, failed, delivered | provider, tracking, status | action buttons labeled | shipping color | delivery queue | high-density archive |
| CashboxCard | Cashbox summary | current, reconcile | difference, closed | name, balance, difference | clear money labels | finance colors | treasury dashboard | transaction ledger |
| ApprovalCard | Approval request | discount, return, stock | pending, approved, rejected | requester, action, impact | approve/reject keyboard | approval color | manager inbox | ordinary notifications |
| InsightCard | Business insight | owner, manager, report | positive, warning, critical | headline, explanation, action | readable summary | semantic colors | reports/dashboards | raw data display |
| WarningCard | Attention-needed item | low stock, overdue, failed | critical, warning | reason, action | role=alert when critical | warning/danger tokens | dashboards | success state |
| ErrorCard | Recoverable error | inline, page | retryable, fatal | message, action | focus moves to error summary | danger subtle surface | failures | field validation only |

## 21.6 Feedback And Loading Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Snackbar | Low-priority feedback | success, info, undo | visible, queued | message, action | live region polite | bottom placement RTL-safe | save success/export | critical errors |
| Banner | Persistent page/system state | info, warning, danger | visible, dismissible | message, action | role status/alert | full-width | backup overdue, sync issue | quick success |
| NotificationCenter | Stored notifications/tasks | grouped, priority | unread, resolved | groups, filters | keyboard list | badges | operational inbox | simple save messages |
| ProgressNotification | Long-running task | determinate, indeterminate | running, failed, complete | progress, phase | live progress text | non-blocking | backup/import/export | instant actions |
| Skeleton | Placeholder loading | table, card, form | loading | shape | aria-busy | shimmer token | first load | refresh with stale data |
| Spinner | Small indeterminate loading | button, inline | running | size | label for screen reader | subtle | button save | full-page tables |
| EmptyState | No data/action state | first-use, filtered, permission | empty, filtered | title, action | accessible action | icon token | lists | hiding errors |

## 21.7 Analytics And Dashboard Components

| Component | Purpose | Variants | States | Key Properties | Accessibility / Keyboard | RTL / Dark / Motion | Use | Do Not Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MetricCard | Single KPI | money, count, percent | positive, negative, neutral | value, label, delta | value has text equivalent | semantic color | dashboards | complex explanations |
| TrendChart | Time series | line, bar | loading, empty | series, range | table alternative | chart tokens | sales/profit | categorical shares |
| BreakdownChart | Distribution | bar, donut | selected | categories | accessible labels | semantic palette | expenses/channels | exact financial totals only |
| ReportHeader | Report context/actions | standalone, embedded | loading | title, date, export | heading structure | RTL actions | reports | normal pages |
| InsightSummary | Plain-language analysis | owner, accountant | warning, normal | insights, actions | readable list | subtle animations | reports | raw logs |
| DashboardWidget | Configurable dashboard block | metric, queue, chart | pinned, hidden | widgetConfig | keyboard reordering | responsive | role dashboards | arbitrary custom code |

---

# Report 22 - Complete Interaction Specification

## 22.1 Interaction Matrix

| Interaction | Trigger | Expected Response | Animation | Timing | Visual Feedback | Sound Feedback | Failure Behavior | Recovery |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| Mouse click | Primary button click | Execute action once | press state | 80ms | loading if async | none unless POS/scan | disabled if invalid | show inline error/action |
| Double click | Table row double click | Open details only where enabled | row highlight | 120ms | row selected/opened | none | no duplicate open | single detail panel |
| Right click | Row/entity right click | Open context menu | menu fade/scale | 120ms | menu anchored to row | none | if no actions, no menu | keyboard Shift+F10 alternative |
| Hover | Pointer over actionable item | Show hover state and tooltip if icon-only | color transition | 120ms | background/icon change | none | no hover on touch | tooltip not required for labeled controls |
| Focus | Keyboard tab to control | Show focus ring | none or color | instant | 2px focus ring | none | missing focus is defect | visible focus state |
| Touch tap | Mobile/tablet tap | Activate target | press state | 80ms | ripple/pressed | optional POS | target too small is defect | min 48px targets |
| Long press | Mobile row/card | Open context actions | bottom sheet slide | 180ms | selected card | haptic optional | if unsupported, no effect | actions also visible elsewhere |
| Drag | Start dragging card/row | Show ghost and valid drop zones | transform | 120ms | dragged item raised | none | invalid zone blocked | Escape cancels |
| Drop | Release over valid target | Apply move/reorder/status | snap/settle | 180ms | success state | optional subtle | invalid drop returns item | undo snackbar if safe |
| Selection | Checkbox/row select | Add to bulk selection | row color | 120ms | selected bg + count | none | selection blocked if no bulk actions | clear selection |
| Context menu action | Choose row action | Execute or open panel | menu close | 120ms | action feedback | none | show error snackbar | retry or undo |
| Clipboard copy | Click copy action/Ctrl+C | Copy formatted value | none | instant | "Copied" snackbar | none | permission denied message | manual select fallback |
| Paste | Ctrl+V in import/grid | Paste parsed data | paste highlight | 120ms | preview validation | none | invalid cells flagged | allow edit/rollback |
| Undo | Click snackbar undo/Ctrl+Z where safe | Revert last safe action | reverse state | 180ms | restored snackbar | none | if impossible, explain | show history |
| Redo | Ctrl+Y where supported | Reapply undone safe action | state change | 180ms | redone snackbar | none | if expired, explain | none |
| Back navigation | Browser/app back | Return to prior context preserving filters | page transition | 180ms | same scroll/filter | none | unsaved changes prompt | save draft/discard |
| Escape | Esc key | Close popover/panel/dialog according to risk | close transition | 120-180ms | focus returns | none | high-risk dialogs require explicit cancel | Cancel button |
| Tab navigation | Tab/Shift+Tab | Move through logical focus order | none | instant | focus ring | none | trapped focus defect | skip nav/focus repair |
| Enter | Enter key | Submit/search/select default action | press | 80ms | default action feedback | POS optional | invalid field prevents submit | focus first invalid |
| Space | Space key | Toggle selected control | press | 80ms | checkbox/button state | none | if disabled, explain | none |
| Shortcut | Global/function key | Execute mapped action | depends | 0-120ms | command/target feedback | optional POS | conflict shown | shortcut help |
| Scanner input | Barcode scanner sends text+Enter | Lookup entity/add line/increment qty | scan flash | <150ms feedback | green success/red failure | beep success/fail | unknown barcode side panel | create product/search |
| Search typing | Input in search/command | Debounced results | result fade | 150-250ms | loading/result groups | none | network error inline | retry/offline cached results |
| Filtering | Apply filter chip | Update table preserving context | table refresh | <300ms perceived | active chips | none | query error banner | remove filter |
| Sorting | Header click | Sort table | header arrow | <300ms perceived | sort indicator | none | unsupported sort disabled | explain unavailable |
| Loading screen | Route/data load | Show skeleton or stale data | skeleton shimmer | immediate | aria-busy | none | timeout warning | retry/continue stale |
| Saving | Save form | Validate, submit, lock duplicate submits | button spinner | immediate | saving text | none | inline error | retry/save draft |
| Long operation | Backup/import/export/report | Show phases/progress | progress bar | immediate | determinate if possible | none | failed phase details | retry/resume/export error report |
| Error recovery | User fixes invalid data | Clear field error when valid | color transition | 120ms | error removed | none | if still invalid, keep message | focus next error |
| Conflict resolution | Same record changed elsewhere | Show compare panel | side panel | 180ms | local vs remote | none | block overwrite by default | choose mine/theirs/merge |
| Offline recovery | Reconnect after offline | Sync queued operations | progress notification | immediate | queue count | none | conflict queue | resolve conflicts |

## 22.2 Navigation Interaction Rules

- Row click opens detail side panel, not full page, unless deep details are required.
- Ctrl+K opens command palette from anywhere except secure text fields where shortcut is disabled.
- Escape closes the topmost non-critical overlay first.
- Back returns to previous saved view, filters, scroll, and selected row.
- Unsaved forms must preserve draft on accidental navigation.
- All high-risk actions must show impact before execution.

## 22.3 Long-Running Operation Rules

For backup, restore, import, export, report generation, sync, update:

```text
Start -> Validate -> Execute -> Verify -> Complete
```

Required UI:

- Operation name.
- Current phase.
- Progress percent if measurable.
- Estimated remaining time if reliable.
- Cancel button only if safe.
- Details accordion.
- Error report on failure.
- Retry or resume when possible.

## 22.4 Conflict Resolution Rules

Conflict UI must show:

- Record name.
- Local version.
- Server/current version.
- Changed fields.
- Timestamp/user.
- Options:
  - keep current
  - use my changes
  - merge field by field
  - discard draft

Conflict UI must not:

- Silently overwrite.
- Show raw JSON to normal users.
- Force the user to restart the workflow.

---

# Report 23 - Accessibility WCAG AA

## 23.1 Accessibility Requirements

NuqtaPlus must meet WCAG 2.2 AA for desktop web/Electron and responsive workflows.

## 23.2 Accessibility Checklist

| Area | Requirement | Severity If Missing | Priority | Required Fix |
| --- | --- | --- | --- | --- |
| Keyboard-only usage | Every action reachable by keyboard | Critical | P0 | Add tab order, shortcuts, visible focus, row actions keyboard menu |
| Focus order | Logical RTL reading/action order | High | P0 | Audit all pages and dialogs |
| Focus visibility | 2px visible ring on all controls | Critical | P0 | Use focus tokens globally |
| Skip navigation | Skip to content and main work area | Medium | P1 | Add skip links in layout |
| Screen reader labels | All icon-only buttons labeled | Critical | P0 | Add aria-label/tooltip text |
| Dialog accessibility | Focus trap, title, description, return focus | Critical | P0 | Standard dialog component |
| Side panel accessibility | Announce panel open and purpose | High | P1 | aria-modal when blocking, landmark when non-blocking |
| Contrast | 4.5:1 normal text, 3:1 large/UI | Critical | P0 | Token contrast validation |
| Large text | Supports 200% zoom without loss | High | P1 | Responsive layout and non-fixed text containers |
| Color blindness | Color never sole signal | High | P1 | Add labels/icons/patterns |
| Motor disabilities | Targets >= 44px desktop where possible, 48px touch | High | P1 | Increase target sizes |
| Low vision | High contrast mode and strong focus | High | P1 | High contrast theme |
| Accessible tables | Headers, sort state, row labels, keyboard nav | High | P1 | Standard DataTable |
| Accessible charts | Text summary and data table alternative | High | P1 | Insight + table below charts |
| Accessible forms | Labels, required state, error association | Critical | P0 | Standard FormField |
| Accessible errors | Focus first invalid field, summarize long forms | High | P1 | Error summary component |
| Accessible notifications | Live regions with correct priority | High | P1 | Snackbar/banner roles |
| Accessible shortcuts | Document shortcuts and allow disabling conflicts | Medium | P2 | Shortcut help/settings |
| RTL screen readers | Arabic labels and direction metadata | High | P1 | Set lang/dir per locale |
| Touch accessibility | Large controls and non-hover alternatives | High | P1 | Touch mode components |

## 23.3 Keyboard Standards

| Component | Keyboard Requirement |
| --- | --- |
| Button | Enter/Space activates |
| Icon button | Enter/Space activates; tooltip/label required |
| Menu | Arrow keys, Enter, Escape, typeahead |
| Dialog | Focus trapped, Escape closes if safe, focus returns |
| Side panel | Focus moves to title/first field, Escape closes if safe |
| Table | Arrow rows optional, Tab to toolbar/action menu, sort via Enter |
| Tree | Arrow expand/collapse, Home/End, typeahead |
| Tabs | Arrow keys switch, Tab enters active panel |
| Autocomplete | Arrow results, Enter select, Escape close |
| Date picker | Arrow dates, Page Up/Down month, Enter select |
| Command palette | Ctrl+K open, arrows, Enter execute, Escape close |

## 23.4 Accessible Table Requirements

Every table must provide:

- Caption or accessible label.
- Column headers with scope.
- Sort state announced.
- Selection count announced.
- Row action menu labeled by entity name.
- Empty state announced.
- Loading state with aria-busy.
- Summary row text accessible.
- Data export for complex reports.

## 23.5 Accessible Chart Requirements

Every chart must include:

- Plain-language insight above chart.
- Text summary of key values.
- Data table alternative.
- Pattern/label support, not color-only.
- Keyboard accessible legend.
- Tooltip content available without hover.

## 23.6 Accessibility Severity Definitions

| Severity | Definition | Example |
| --- | --- | --- |
| Critical | Blocks core task for keyboard/screen reader/low vision users | Cannot complete sale without mouse |
| High | Major barrier or error-prone accessibility issue | Unlabeled delete icon |
| Medium | Workaround exists but experience is poor | Chart lacks table alternative |
| Low | Minor polish issue | Tooltip delay inconsistent |

---

# Report 24 - Performance Experience Specification

These are UX performance KPIs. They measure how fast the product feels and how quickly users get feedback, not backend internals.

## 24.1 Performance KPI Table

| Experience | Target | Maximum Acceptable | Warning Threshold | Measurement Method |
| --- | ---: | ---: | ---: | --- |
| App shell visible after launch | 2.5s | 5s | >3.5s | Electron startup telemetry |
| Login to dashboard usable | 1.5s | 3s | >2s | RUM event |
| POS screen usable | 1s | 2s | >1.5s | route timing |
| Product scan feedback | 150ms | 300ms | >200ms | scanner event to UI feedback |
| Add product to cart | 100ms | 250ms | >150ms | UI event timing |
| Complete cash sale feedback | 500ms | 1.5s | >1s | click to success state |
| Receipt print job queued | 500ms | 2s | >1s | print event |
| Receipt physically starts | 2s | 5s | >3s | printer callback/user test |
| Dialog open | 120ms | 250ms | >180ms | UI animation timing |
| Side panel open | 180ms | 300ms | >240ms | UI animation timing |
| Drawer open | 180ms | 300ms | >240ms | UI animation timing |
| Table first meaningful rows | 800ms | 2s | >1.2s | route/table load |
| Table filter response | 300ms | 1s | >500ms | filter event timing |
| Table sort response | 300ms | 1s | >500ms | sort event timing |
| Command palette open | 120ms | 250ms | >180ms | keydown to visible |
| Search first results | 300ms | 900ms | >500ms | query event |
| Customer autocomplete | 250ms | 800ms | >400ms | type to results |
| Product autocomplete | 200ms | 700ms | >350ms | type to results |
| Save simple form | 500ms | 1.5s | >1s | submit to success |
| Save complex form | 1s | 3s | >2s | submit to success |
| Online order status move | 300ms optimistic | 2s confirmed | >1s no feedback | UI state + sync result |
| Report cached preview | 500ms | 1.5s | >1s | report route |
| Report fresh generation | 3s | 10s | >6s | report progress |
| Export starts download | 1s | 5s | >3s | click to file prompt |
| Backup progress appears | 500ms | 2s | >1s | click to progress UI |
| Backup progress updates | every 1s | every 5s | >3s no update | progress telemetry |
| Restore progress appears | 500ms | 2s | >1s | start to progress UI |
| Restore phase update | every 2s | every 10s | >5s no update | progress telemetry |
| Notification appearance | 150ms | 300ms | >200ms | event to snackbar/banner |
| Navigation transition | 180ms | 400ms | >250ms | route animation |
| Empty state visible | 500ms | 1.5s | >1s | page load |

## 24.2 Perceived Performance Rules

- Preserve stale data during refresh.
- Never blank a table if previous data exists.
- Show skeleton only on first load.
- Show progress phase for long-running tasks.
- Use optimistic UI for reversible or low-risk updates.
- Do not optimistic-update high-risk financial completion without rollback messaging.
- Cache recent searches and recent entities.
- Prefetch role dashboard next actions.

## 24.3 Measurement Events

Required UX telemetry events:

- `app.launch.shell_visible`
- `auth.login.dashboard_usable`
- `route.view.usable`
- `pos.scan.feedback`
- `pos.sale.completed_feedback`
- `table.rows.first_visible`
- `table.filter.response`
- `command_palette.opened`
- `search.results.first_visible`
- `form.save.feedback`
- `report.preview.visible`
- `long_task.progress.first_visible`
- `print.job.queued`
- `notification.visible`

---

# Report 25 - Offline Experience

## 25.1 Offline States

| State | Meaning | UI |
| --- | --- | --- |
| Online | Connected and synced | No banner, sync status green in diagnostics |
| Degraded | Slow/unreliable connection | Yellow banner, operations continue where safe |
| Offline | No backend/server connection | Offline banner, queue visible |
| Syncing | Reconnected and pushing/pulling data | Progress notification |
| Conflict | Queued operation conflicts with current data | Conflict resolution inbox |
| Recovery | Crash/power failure recovery active | Recovery banner/wizard |

## 25.2 Offline Indicators

- App bar status pill: Online, Offline, Syncing, Conflict.
- Offline banner on affected screens.
- Queue count badge.
- Last successful sync time.
- Branch/server identity visible in client mode.

## 25.3 Pending Operations

| Operation | Offline Allowed | Queue Behavior | Conflict Risk |
| --- | --- | --- | --- |
| Draft sale | Yes | local draft queue | medium |
| Complete sale | Server-mode local: yes; client disconnected: limited by policy | queue if allowed | high |
| Product lookup from cache | Yes | no queue | low |
| Create customer quick add | Yes if local draft | queue | medium |
| Stock transfer | Draft yes, final submit depends on connection | queue draft | high |
| Expense | Draft yes | queue | medium |
| Online order status | No or draft only | queue intent | high |
| Shipment creation | No unless provider unavailable draft | queue draft | high |
| Report generation | Cached only | no new report | low |
| Backup/restore | No during offline client mode | blocked | critical |

## 25.4 Queue Management

Queue screen shows:

- Operation type.
- Entity.
- Created by.
- Time.
- Status: pending, syncing, failed, conflict.
- Retry.
- Cancel if safe.
- View payload in human-readable form.

Queue rules:

- Financial operations are ordered.
- Stock operations are ordered per product/warehouse.
- Duplicate queued actions are detected.
- User can pause sync.
- Admin can export queue diagnostics.

## 25.5 Conflict Resolution

Conflict types:

- Same customer edited twice.
- Product price changed while sale draft exists.
- Stock quantity changed before transfer completes.
- Order status changed by another user.
- Payment applied to already settled debt.

Conflict UI:

```text
Conflict title
Affected record
What changed
Your queued action
Current system state
Recommended resolution
Actions: apply adjusted, discard, merge, ask manager
```

## 25.6 Reconnect Flow

```text
Connection restored
-> validate server identity
-> fetch latest sync marker
-> sync pending safe operations
-> pause high-risk conflicts
-> show sync complete summary
```

## 25.7 Crash And Power Failure Recovery

On restart:

- Detect incomplete sale/payment/print/backup/restore/import.
- Show recovery screen if high-risk process was interrupted.
- Restore unsaved form drafts.
- Verify local database state.
- Show "safe to continue" only after checks pass.
- Offer backup reminder after abnormal shutdown.

## 25.8 Safe Shutdown

Before closing:

- Warn if sale is in progress.
- Warn if backup/restore/import is running.
- Warn if pending queued operations exist.
- Auto-save drafts.
- Stop accepting new operations during shutdown phase.

---

# Report 26 - Printing Experience

## 26.1 Print Job Types

| Print Type | Purpose | Default Format | Critical Options |
| --- | --- | --- | --- |
| Receipt | POS customer receipt | thermal 80mm | silent print, reprint, cash drawer |
| Invoice | formal sale invoice | A4 or thermal | customer, tax/company info |
| Barcode label | product barcode | label printer | product name, barcode, price |
| Shelf label | shelf/product price label | label printer | product, price, promo |
| Purchase order | supplier order | A4 | supplier, items, totals |
| Delivery note | shipment handoff | A4/thermal | customer, address, items |
| Shipping label | provider label | provider format | tracking, barcode, address |
| A4 report | management/accounting report | PDF/A4 | date range, filters, signature |
| Cashbox close report | end-of-day cash report | A4/thermal | expected/count/difference |

## 26.2 Printer Profiles

Printer profile fields:

- Name.
- Type: receipt, label, A4, kitchen, cash drawer.
- Device name.
- Paper width.
- Default branch.
- Default warehouse.
- Default user/role.
- Silent print allowed.
- Copies.
- Cut paper.
- Open cash drawer.
- Test print.

## 26.3 Printer Routing

| Document | Routing Rule |
| --- | --- |
| POS receipt | cashier profile receipt printer |
| Sale invoice A4 | branch A4 printer |
| Barcode label | product label printer |
| Shipping label | delivery/provider label printer |
| Kitchen/warehouse ticket | warehouse/kitchen printer by product category |
| Cashbox report | manager/admin printer |

## 26.4 Print Preview

Preview must show:

- Exact layout approximation.
- Selected printer.
- Paper size.
- Copy count.
- Silent print toggle if allowed.
- Print, save PDF, cancel.

Preview not required:

- Fast POS silent receipt if printer profile is trusted.
- Cash drawer trigger.

## 26.5 Print Queue

Queue fields:

- Job ID.
- Document type.
- Source record.
- Printer.
- Status.
- Submitted by.
- Submitted at.
- Attempts.
- Last error.
- Retry.
- Cancel if not printed.

Statuses:

- queued
- printing
- printed
- failed
- cancelled
- needs printer

## 26.6 Retry Strategy

- Retry transient printer failures up to 3 times.
- Do not retry cash drawer endlessly.
- Show failed print badge on source invoice/order.
- Allow reprint with reason for sensitive documents.
- Record reprint count and user.

## 26.7 Printer Diagnostics

Diagnostics screen:

- Installed printers.
- Default profiles.
- Last print success.
- Failed jobs.
- Test print.
- Cash drawer test.
- Paper size test.
- Export diagnostic bundle.

---

# Report 27 - Import / Export Experience

## 27.1 Import Types

| Type | Formats | Required Features |
| --- | --- | --- |
| Products | Excel, CSV | template, mapping, duplicate detection, barcode validation |
| Customers | Excel, CSV | phone normalization, duplicate merge |
| Suppliers | Excel, CSV | phone/name duplicate detection |
| Opening balances | Excel | validation, review, rollback |
| Inventory count | Excel, CSV, scanner file | variance preview |
| Online orders | Excel, CSV, JSON | channel mapping |
| Expenses | Excel, CSV | category mapping |
| Accounts/COA | Excel | hierarchy validation |
| Backup restore | backup ZIP/dump | preview, verify, restore wizard |

## 27.2 Import Workflow

```text
Choose import type
-> Download/use template
-> Upload file
-> Preview file
-> Map columns
-> Validate rows
-> Resolve duplicates/errors
-> Review summary
-> Import
-> Result report
-> Undo/rollback if supported
```

## 27.3 Column Mapping

Mapping UI:

- Source column.
- Target field.
- Required marker.
- Sample values.
- Transformation preview.
- Auto-map by header synonyms.
- Save mapping template.

## 27.4 Validation

Validation output:

- Row number.
- Field.
- Problem.
- Suggested fix.
- Severity.
- Can import row or blocked.

Validation severities:

- Error: blocks row.
- Warning: row can import but needs review.
- Info: system changed/normalized value.

## 27.5 Duplicate Detection

| Entity | Duplicate Keys |
| --- | --- |
| Customer | phone, normalized name + branch |
| Product | barcode, SKU, normalized name + category |
| Supplier | phone, normalized name |
| Online order | channel + external order ID |
| Account | account code |

Duplicate actions:

- Skip.
- Update existing.
- Create new anyway.
- Merge selected fields.

## 27.6 Partial Import And Rollback

Rules:

- User can import valid rows and export invalid rows.
- Import result must include created/updated/skipped/failed counts.
- Rollback available for imports where no dependent transaction occurred.
- High-risk imports require backup reminder.

## 27.7 Export Types

| Export | Formats | Features |
| --- | --- | --- |
| Table export | Excel, CSV | current filters, selected columns |
| Report export | PDF, Excel | summary, charts, detail |
| Accounting export | Excel/PDF | period, signature, immutable metadata |
| Backup export | ZIP/dump | encrypted option, metadata preview |
| Scheduled export | Excel/PDF | schedule, recipients, filters |
| Error export | Excel/CSV | import validation errors |

## 27.8 Export Templates

Templates include:

- Columns.
- Filters.
- Sort.
- File format.
- Header/footer.
- Language.
- Currency formatting.
- Schedule if applicable.

---

# Report 28 - AI And Smart Features Roadmap

## 28.1 AI Principles

- AI recommends; user approves.
- AI never silently changes stock, cash, accounting, users, roles, or backups.
- Every AI insight must explain data used and confidence.
- AI features must be optional and permission-controlled.
- Arabic natural language support is required before broad launch.

## 28.2 Smart Feature Roadmap

| Feature | Description | Priority | Business Value | Complexity | Explainability | Required Data |
| --- | --- | --- | --- | --- | --- | --- |
| Smart Search | Natural/fuzzy search across products/customers/invoices/settings | P1 | High | Medium | show matched fields | indexed records |
| Duplicate Detection | Detect duplicate customers/products/suppliers | P1 | High | Medium | show matching reasons | names, phones, barcodes |
| Smart Reorder | Suggest reorder quantities by velocity/min stock | P1 | High | Medium/Hard | show sales velocity/stock days | sales, stock, suppliers |
| Low Margin Alerts | Detect products sold below target margin | P1 | High | Medium | show cost/price/margin | sales/product cost |
| AI Reports Summary | Plain-language summary of reports | P2 | High | Medium | cite metrics | report data |
| Predictive Alerts | Warn about stockouts, cash issues, overdue debt | P2 | High | Hard | show drivers | time series |
| Demand Forecast | Forecast sales by product/category/season | P2 | High | Hard | confidence bands | historical sales |
| Smart Pricing | Suggest price changes based on cost/margin/sales | P3 | High | Hard | show margin impact | cost/sales/competitors optional |
| Cash Flow Prediction | Forecast upcoming cash position | P3 | High | Hard | show receivables/payables | sales, debts, expenses |
| Product Suggestions | Recommend bundles/cross-sell | P3 | Medium | Hard | show purchase patterns | basket data |
| Natural Language Search | "Who owes me more than..." | P2 | High | Hard | show query translation | reports/search |
| Voice Commands | Arabic voice POS/search commands | P4 | Medium | Hard | confirm action before execution | speech/NLU |
| Smart Assistant | Business assistant for owner/admin | P4 | High | Hard | sources/actions | unified data layer |
| OCR Purchase Invoice | Read supplier invoices from photo/PDF | P3 | Medium/High | Hard | show extracted fields | documents |
| Delivery Risk Score | Predict delivery failure/return risk | P3 | Medium/High | Hard | reasons: province/provider/history | orders/shipments |

## 28.3 AI Safety Levels

| Level | Allowed Behavior | Examples |
| --- | --- | --- |
| Informational | Read-only insight | report summary |
| Assisted | Pre-fill draft, user confirms | purchase draft |
| Approval Required | Manager approval before action | price change |
| Prohibited | AI cannot do automatically | delete, restore, close period, issue refund |

---

# Report 29 - Internationalization

## 29.1 Language Direction

Supported directions:

- RTL: Arabic.
- LTR: English and future languages.

Rules:

- Direction is locale-driven.
- Directional icons mirror where meaning depends on direction.
- Numeric values align consistently regardless of language.
- Mixed Arabic/English text must use proper bidi isolation.

## 29.2 Locale Requirements

| Locale Area | Requirement |
| --- | --- |
| Arabic | Full UI, reports, receipts, validation, support messages |
| English | Full UI readiness for global deployment |
| Translation keys | No hardcoded UI strings in components |
| Pluralization | Locale-specific plural forms |
| Dates | Locale-specific display, ISO storage |
| Times | 12/24-hour preference |
| Timezones | Store timezone-aware timestamps; display by business/user setting |
| Currency | Multi-currency symbols, decimals, separators |
| Numbers | Arabic/English digit display preference |
| Sorting | Locale-aware collation |
| Search | Arabic normalization, English fallback |
| Printing | Locale-specific receipt/report templates |

## 29.3 Currency Formatting

Currency settings:

- Default business currency.
- Additional currencies.
- Decimal precision per currency.
- Symbol/code display.
- Exchange rate source/manual rate.
- Formatting examples in settings.

Examples:

| Currency | Display Example |
| --- | --- |
| IQD | `1,250,000 IQD` |
| USD | `$1,250.00` |
| EUR | `EUR 1,250.00` |

## 29.4 Date And Number Formats

User preferences:

- Date format: `YYYY-MM-DD`, `DD/MM/YYYY`, localized Arabic.
- Time format: 12h/24h.
- Digit style: Arabic-Indic or Western.
- Week start: Saturday/Sunday/Monday.
- Calendar: Gregorian initially; future regional calendars optional.

## 29.5 Translation Strategy

- Use structured translation keys: `module.screen.element.state`.
- Separate product copy from technical strings.
- Keep glossary for business terms:
  - sale
  - invoice
  - return
  - stock
  - warehouse
  - cashbox
  - voucher
  - accounting period
  - shipment
- Add pseudo-locale testing.
- Add missing translation CI check.

## 29.6 Regional Settings

Business-level:

- Country/region.
- Currency.
- Tax mode.
- Receipt language.
- Report language.
- Timezone.
- Work week.
- Fiscal year start.

User-level:

- UI language.
- Number style.
- Date/time format.
- Default branch/warehouse.

---

# Report 30 - User Personas

## 30.1 Owner

| Attribute | Specification |
| --- | --- |
| Goals | Know cash, profit, debt, stock risk, employee/branch performance, and what needs action today. |
| Daily Tasks | Check dashboard, review cash/profit, approve exceptions, inspect debts, review low stock, view reports. |
| Pain Points | Too many reports, accounting terms, hidden problems, lack of time. |
| Technical Skill | Low to medium. |
| Most Used Screens | Owner dashboard, reports, debts, low stock, cashbox, branch performance. |
| Most Important KPIs | cash today, profit today/month, receivables, payables, stockout risk, sales by branch, staff performance. |
| Permissions | broad read, approval, reports, selected admin. |
| Required Shortcuts | Ctrl+K, dashboard report cards, scheduled summaries. |
| Expected Dashboard | answer-first business dashboard with recommendations. |
| Training Needs | interpret KPIs, approve requests, read alerts, export/share reports. |

## 30.2 Branch Manager

| Attribute | Specification |
| --- | --- |
| Goals | Keep branch selling, stocked, staffed, reconciled, and free of operational problems. |
| Daily Tasks | Monitor sales, approve returns/discounts, review low stock, manage cash close, handle customer issues. |
| Pain Points | Switching between sales, inventory, cash, and reports. |
| Technical Skill | Medium. |
| Most Used Screens | manager dashboard, POS, sales, inventory, low stock, cashbox, online orders. |
| Most Important KPIs | daily sales, returns, discounts, stockouts, cash difference, staff performance. |
| Permissions | branch management, approvals, local reports, stock actions. |
| Required Shortcuts | approve, search invoice, collect, low stock, end-of-day. |
| Expected Dashboard | exception queue and branch performance. |
| Training Needs | approvals, end-of-day, stock transfer, report interpretation. |

## 30.3 Cashier

| Attribute | Specification |
| --- | --- |
| Goals | Sell quickly, avoid mistakes, print receipts, handle simple returns/payments. |
| Daily Tasks | Login/PIN, scan products, complete sales, collect payments, reprint receipts, create quick customer. |
| Pain Points | Too many options, slow product search, payment confusion, printer issues. |
| Technical Skill | Low. |
| Most Used Screens | POS, invoice search, customer quick add, collections. |
| Most Important KPIs | personal sales, open shift, printer state, pending returns. |
| Permissions | sell, reprint, limited returns/discounts, customer quick add. |
| Required Shortcuts | barcode scan, F8 payment, F9 print, Ctrl+K invoice. |
| Expected Dashboard | POS-first cashier workspace. |
| Training Needs | sale, return, customer, payment, printer recovery. |

## 30.4 Warehouse Employee

| Attribute | Specification |
| --- | --- |
| Goals | Receive, count, transfer, and keep stock accurate. |
| Daily Tasks | Receive purchases, scan items, transfer stock, count stock, handle low/expired stock. |
| Pain Points | Desktop forms, wrong warehouse, manual entry, unclear transfer status. |
| Technical Skill | Low to medium. |
| Most Used Screens | warehouse dashboard, inventory, transfer requests, receiving, expiry, low stock. |
| Most Important KPIs | pending transfers, low stock, count variance, receiving tasks, expiring stock. |
| Permissions | inventory view/update, transfer, receive, count. |
| Required Shortcuts | scanner input, transfer, count, product lookup. |
| Expected Dashboard | warehouse task queue with scanner mode. |
| Training Needs | scanner workflow, transfer states, variance handling. |

## 30.5 Accountant

| Attribute | Specification |
| --- | --- |
| Goals | Keep financial records correct, close periods, reconcile cash, fix postings, produce statements. |
| Daily Tasks | Review expenses, vouchers, cashboxes, failed postings, periods, reports. |
| Pain Points | Fragmented financial workflow, hidden blockers, ambiguous document state. |
| Technical Skill | High. |
| Most Used Screens | accountant dashboard, expenses, vouchers, cashbox ledger, accounting periods, GL, reports. |
| Most Important KPIs | failed postings, unreconciled cash, open periods, expenses, debt/payables. |
| Permissions | finance/accounting, reports, period close, posting repair. |
| Required Shortcuts | close period, find source document, export, repair. |
| Expected Dashboard | close checklist and finance exception inbox. |
| Training Needs | system-specific accounting mappings, close process, restore/export policies. |

## 30.6 Sales Employee

| Attribute | Specification |
| --- | --- |
| Goals | Serve customers, create quotes/sales, follow up debts, manage relationships. |
| Daily Tasks | Search customers, create sales, send receipts, follow up payments, inspect customer history. |
| Pain Points | Finding history, duplicate customers, manual messaging. |
| Technical Skill | Medium. |
| Most Used Screens | customers, customer profile, POS/new sale, collections, reports. |
| Most Important KPIs | sales amount, conversion, debt collected, customer activity. |
| Permissions | sales, customers, limited reports. |
| Required Shortcuts | customer search, invoice search, message, collect. |
| Expected Dashboard | customer follow-up and sales actions. |
| Training Needs | customer timeline, debt workflow, messaging templates. |

## 30.7 Administrator

| Attribute | Specification |
| --- | --- |
| Goals | Configure system, users, roles, modules, backups, integrations, support. |
| Daily Tasks | Add users, assign roles, check backup/update/license, configure integrations. |
| Pain Points | Permission complexity, settings sprawl, support diagnostics. |
| Technical Skill | Medium to high. |
| Most Used Screens | admin dashboard, users, roles, settings, feature modules, backup, integrations. |
| Most Important KPIs | backup health, user status, integration health, license/update status. |
| Permissions | full admin except owner-only financial if separated. |
| Required Shortcuts | settings search, add user, backup, diagnostics. |
| Expected Dashboard | setup/health dashboard. |
| Training Needs | permissions, backups, restore, integrations. |

## 30.8 Support Technician

| Attribute | Specification |
| --- | --- |
| Goals | Diagnose issues quickly without damaging data. |
| Daily Tasks | Review diagnostics, logs, version, connection, printers, backup status, sync issues. |
| Pain Points | Missing context, remote troubleshooting, user descriptions incomplete. |
| Technical Skill | High. |
| Most Used Screens | support center, diagnostics, printer diagnostics, backup logs, webhook logs, update status. |
| Most Important KPIs | error frequency, failed jobs, version mismatch, backup age, printer status. |
| Permissions | diagnostic read, support tools, no destructive access unless explicitly granted. |
| Required Shortcuts | export diagnostics, search logs, copy machine ID, printer test. |
| Expected Dashboard | support/health center. |
| Training Needs | product modules, safe support procedures, escalation. |

---

# Report 31 - Business Rule Specification

## 31.1 Rule Format

Each rule must be testable by QA and understandable by product/support.

Fields:

- Description.
- Conditions.
- Validation.
- Exceptions.
- Edge cases.
- Error message guidance.
- Dependencies.
- Related modules.

## 31.2 Sales Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sale requires at least one line | A sale cannot be completed empty | Complete sale action | cart lines > 0 | none | removed all lines before pay | "Add at least one product before completing sale." | products | POS, invoices |
| Physical product requires stock policy | Stock impact must be known | physical product line | available qty if stock enforcement enabled | manager override if allowed | negative stock, wrong warehouse | "Not enough stock in selected warehouse." | inventory | POS, inventory |
| Service sale uses received amount | Service can be sold without stock movement | service product | service amount > 0 | fixed-price service | zero received amount | "Enter received service amount." | product type | POS, reports |
| Payment cannot exceed due without handling change | Payment amount must be reconciled | cash payment | amount >= due; change calculated | overpayment as credit if feature exists | multi-currency | "Payment exceeds total. Confirm change or credit." | cashbox | treasury |
| Debt sale requires customer | Unpaid balance must be linked to party | remaining balance > 0 | customer selected | anonymous debt not allowed | customer deleted/inactive | "Select a customer for unpaid sales." | customers | collections |
| Discount threshold requires approval | Protect margin and policy | discount > user limit | manager approval | owner/admin role | product below cost | "Manager approval required for this discount." | roles | approvals |
| Sale date belongs to open period if accounting periods enabled | Sales must post to valid period | accounting period module on | open period exists/date valid | draft sale | period closed during sale | "Open an accounting period before completing sales." | accounting periods | GL, reports |
| Receipt can be reprinted with audit | Reprints must be tracked | user reprints | invoice exists | none | cancelled invoice | "Receipt reprint recorded." | printing | audit |

## 31.3 Returns Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Return references original sale | Return must be tied to invoice | return action | sale exists | manual adjustment separate | deleted/cancelled sale | "Select a valid invoice to return." | sales | inventory, treasury |
| Return quantity cannot exceed net sold quantity | Prevent over-return | item return | return qty <= sold - previous returns | manager override not recommended | multiple partial returns | "Return quantity is greater than remaining sold quantity." | sale items | inventory |
| Refund method defaults to original payment | Reduce cashier error | refund | original payment known | customer credit if selected | split payment | "Review refund method before confirming." | payments | cashbox |
| Returned physical item needs stock disposition | Decide stock impact | physical return | return to stock/damaged/supplier | service return no stock | expired/damaged item | "Choose where returned stock should go." | inventory | reports |
| Return in closed period is restricted | Preserve accounting integrity | closed period | block or reversal workflow | accountant reversal | historical correction | "This invoice belongs to a closed period." | accounting periods | GL |

## 31.4 Products And Services Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Product name required | Every product needs display name | create/update | non-empty name | none | duplicate whitespace | "Enter product name." | catalog | POS |
| Barcode unique when provided | Barcode identifies product | barcode entered | no active duplicate | inactive product reuse with confirmation | leading zeros | "Barcode already belongs to another product." | catalog | POS/import |
| Physical product requires positive selling price | Inventory item must be sellable | physical product | selling price > 0 | purchase-only item if supported | free samples | "Enter selling price greater than zero." | pricing | POS |
| Service product does not affect stock | Services are non-inventory | service type | no stock movement | bundled service/product not allowed unless bundle feature | mixed service/physical sale | "Service products do not use warehouse stock." | product type | sales |
| Unit conversion must be positive | Prevent calculation errors | multi-unit | factor > 0 | base unit factor 1 | decimal precision | "Unit conversion must be greater than zero." | units | inventory |
| Price below cost requires warning/approval | Protect margin | price < cost | show margin warning | owner override | cost missing | "Selling price is below cost." | cost | sales |

## 31.5 Inventory, Warehouses, Transfers Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stock belongs to warehouse and branch | Quantity must have location | stock operation | branch/warehouse selected | single warehouse default | user has no warehouse | "Select warehouse before stock operation." | branches | inventory |
| Transfer source and destination differ | Cannot transfer to same place | transfer | source != destination | none | same branch different warehouse allowed | "Choose a different destination warehouse." | warehouses | transfers |
| Transfer quantity cannot exceed available | Prevent impossible movement | transfer submit | qty <= available | manager negative stock override if policy | stock changed before approval | "Not enough stock to transfer." | inventory | warehouse |
| Stock movement needs reason/source | Auditability | adjustment/manual movement | reason provided | system movements auto-source | import adjustment | "Choose reason for stock adjustment." | audit | reports |
| Expiry warning uses earliest batch | Sell/transfer expiry-sensitive products safely | product has batches | nearest expiry shown | non-expiring product | multiple batches | "This product has stock expiring soon." | batches | POS |
| Low stock triggered below minimum | Operational alert | qty <= min | min stock set | min stock zero disables | multi-warehouse | "Product is below minimum stock." | product settings | purchasing |

## 31.6 Customers Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer phone normalized | Prevent duplicates | phone entered | normalized format | no phone allowed if name exists | multiple numbers | "Phone number format is invalid." | locale | sales |
| Duplicate customer warning | Reduce duplicate debt/history | create/update | match phone/name | user confirms merge/create | family/shared phone | "Possible duplicate customer found." | customers | import |
| Debt balance equals unpaid sales minus payments/returns | Authoritative balance | balance display | computed from documents | opening balance | closed period corrections | "Customer balance updated from invoices and payments." | sales/payments | reports |
| Customer with debt cannot be hard-deleted | Preserve history | delete customer | no open debt/docs | deactivate instead | mistaken duplicate | "Customer has transactions; deactivate or merge instead." | sales | audit |

## 31.7 Suppliers And Purchases Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Purchase requires supplier | AP and history need supplier | create purchase | supplier selected | cash anonymous purchase not recommended | supplier quick-add | "Select supplier before saving purchase." | suppliers | inventory |
| Purchase line requires product, qty, cost | Receiving stock must be complete | line add | product, qty > 0, cost >= 0 | free sample cost zero | service purchase | "Complete product, quantity, and cost." | products | inventory |
| Credit purchase increases supplier payable | AP tracking | unpaid purchase | payable updated | paid purchase | partial payment | "Supplier balance updated." | treasury | reports |
| Purchase return cannot exceed purchased net qty | Prevent over-return | return | qty <= purchased - returned - consumed rules | damaged adjustment separate | consumed stock | "Return quantity exceeds available purchased quantity." | inventory | suppliers |
| Supplier payment reduces payable | Payables integrity | payment | amount <= payable unless advance allowed | advance payment feature | multi-currency | "Payment exceeds supplier balance." | treasury | cashbox |

## 31.8 Payments, Expenses, Cashboxes Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Payment requires method and amount | Every payment must be traceable | payment create | amount > 0, method selected | zero-value correction not payment | rounding | "Enter payment amount and method." | treasury | sales |
| Cash payment affects cashbox | Cash must reconcile | cash payment | cashbox selected/defaulted | user assigned default | missing cashbox | "No cashbox selected for cash payment." | cashboxes | reports |
| Expense requires category and amount | Expense reporting | create expense | amount > 0, category selected | uncategorized only admin | recurring generated | "Choose expense category and amount." | categories | reports |
| Recurring expense generates due expense once per cycle | Avoid duplicates | due generation | not already generated for period | manual skip | timezone/date edge | "Expense already generated for this period." | scheduler | notifications |
| Cashbox transfer needs from/to and amount | Cash movement integrity | transfer | different accounts, amount > 0 | bank/cash transfer rules | currency conversion | "Complete transfer source, destination, and amount." | treasury | accounting |
| Cancel voucher reverses effect if allowed | Preserve ledger | cancel voucher | source rules permit | source-generated vouchers may require source reversal | closed period | "This voucher must be reversed from its source document." | cashbox | GL |

## 31.9 Accounting And Accounting Period Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| One open period per scope | Avoid ambiguous posting | open period | no overlapping open period | branch-specific policy | timezone boundaries | "Another accounting period is already open." | settings | GL |
| Closed period blocks operational edits | Preserve statements | edit document in closed period | block or reversal | accountant adjustment | late return | "This document belongs to a closed period." | accounting | sales |
| Journal entry must balance | Debits equal credits | manual journal | debit == credit | none | rounding | "Journal entry is not balanced." | GL | reports |
| System account mappings required before posting | Posting needs accounts | posting event | required mappings exist | module disabled | missing inventory account | "Complete accounting mappings before posting." | system accounts | GL |
| Failed postings require repair queue | No silent accounting failure | posting fails | create failure task | none | repeated failure | "Accounting posting needs review." | notifications | reports |
| Period close requires checklist complete | Close readiness | close period | no blockers | owner override with reason if policy | backup missing | "Resolve period blockers before closing." | backup, GL | reports |

## 31.10 Online Orders And Shipping Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Online order has source channel | Trace order origin | create/import | channel selected | manual channel default | disabled channel | "Select sales channel." | channels | reports |
| External order ID unique per channel | Prevent duplicate imports | import/create | unique channel+external ID | manual duplicate override | platform resend | "Order already exists for this channel." | online orders | import |
| Shipment requires recipient phone/address | Carrier needs delivery info | create shipment | phone and address/province valid | pickup order | incomplete imported order | "Complete recipient phone and address." | customers | delivery |
| Provider selected before shipment submission | Shipment routing | create shipment | provider active | auto-suggest default | provider disabled | "Select active delivery provider." | providers | shipping |
| Order status follows allowed transitions | Prevent invalid lifecycle | status change | transition allowed | admin correction | delivered then returned | "This status change is not allowed." | order status matrix | reports |
| Returned delivery updates order financial state | Delivery return has business impact | mark returned | return handling chosen | no-sale order | partial delivery | "Choose how returned order affects stock/payment." | sales/inventory | accounting |

## 31.11 Users, Roles, Permissions Rules

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| User requires role | Access based on role | create user | active role selected | first owner role auto-created | role disabled | "Select active role." | roles | auth |
| Cashier can use PIN mode if enabled | Faster POS login | cashier role | PIN policy valid | password fallback | forgotten PIN | "PIN must meet policy." | settings | POS |
| Role cannot be deleted while assigned | Prevent orphan users | delete role | no active users assigned | deactivate instead | system role | "Role is assigned to users." | users | permissions |
| Restricted action needs permission or approval | Business control | action click | permission or manager approval | owner override | temporary unlock expired | "Manager approval required." | approvals | audit |
| User branch/warehouse limits data context | Scope control | user assigned scope | operations use permitted scope | global admin | no assignment | "You do not have access to this branch/warehouse." | branches | inventory |

## 31.12 Branches, Licensing, Backup, Restore, Feature Flags, Notifications, Reports

| Rule | Description | Conditions | Validation | Exceptions | Edge Cases | Error Message Guidance | Dependencies | Related Modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Branch name unique enough for selection | Avoid wrong branch | create branch | name non-empty and distinguishable | same city with suffix | whitespace | "Branch name already exists." | branches | all modules |
| Licensed features control module visibility | Match subscription/config | feature access | feature enabled and licensed | trial mode | expired license | "This module is not enabled for your license." | licensing | navigation |
| Backup reminder triggered by age | Protect data | last backup older than threshold | threshold setting | disabled only admin | backup failed silently | "Backup is overdue." | backup | notifications |
| Restore requires preview and confirmation | Prevent accidental data loss | restore action | backup valid, user confirms | emergency support mode | wrong company backup | "Review backup details before restore." | backup | admin |
| Feature disable shows impact | Avoid hiding active data unexpectedly | disable module | impact reviewed | admin force | open documents in module | "Review affected screens and data before disabling." | feature flags | navigation |
| Notification priority follows business impact | Reduce noise | notification create | severity assigned | user mute for low priority | critical muted not allowed | "Critical notifications cannot be muted." | notifications | dashboards |
| Report respects role and data scope | Prevent confusing/unpermitted data | report open | permission and scope applied | owner/global | branch manager needs own branch | "Report filtered to your assigned branch." | permissions | reports |

---

# Report 32 - Product Roadmap

## 32.1 Roadmap Principles

- Version 2.x focuses on usability, consistency, and operational speed.
- Version 3.0 expands intelligence, mobility, and collaboration.
- Version 4.0 targets multi-business, enterprise, ecosystem, and platform growth.

## 32.2 Version 2.1 - Foundation And Design System

| Feature | Priority | Business Value | Complexity | Dependencies | Estimate | Risk | Expected ROI | User Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Design token implementation | P0 | Medium | Medium | design approval | 3-5 weeks | token migration | high long-term | consistent UI |
| Component library foundation | P0 | High | Hard | tokens | 6-10 weeks | migration scope | high | faster future screens |
| Unified table shell | P0 | High | Hard | component lib | 5-8 weeks | table edge cases | high | faster data work |
| Side panel framework | P0 | High | Medium/Hard | layout system | 3-5 weeks | focus/accessibility | high | less navigation |
| Command palette actions v1 | P1 | High | Medium | search/actions registry | 3-5 weeks | permission mapping | high | faster navigation |
| Role dashboard shell | P1 | High | Hard | widgets/tasks | 5-8 weeks | role complexity | high | less training |
| Accessibility baseline | P0 | High | Medium | component lib | 4-6 weeks | retrofitting | high | inclusive usage |

## 32.3 Version 2.2 - High-Frequency Workflow Redesign

| Feature | Priority | Business Value | Complexity | Dependencies | Estimate | Risk | Expected ROI | User Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POS cashier mode | P0 | Critical | Hard | component lib, printing | 6-10 weeks | checkout regressions | very high | faster sales |
| Product template wizard | P0 | High | Medium/Hard | form system | 4-7 weeks | import/product variants | high | faster catalog setup |
| Quick customer add | P0 | High | Medium | side panels | 2-4 weeks | duplicate rules | high | faster sales/collections |
| Debt collection dashboard | P1 | High | Medium/Hard | customer/payment data | 4-6 weeks | payment edge cases | high | better cash collection |
| Expense quick entry | P1 | Medium/High | Medium | side panels | 2-4 weeks | accounting mapping | medium/high | faster finance entry |
| Personal defaults | P1 | Medium | Medium | user preferences | 2-3 weeks | scope mistakes | high | fewer repeated choices |

## 32.4 Version 2.3 - Operations Workspaces

| Feature | Priority | Business Value | Complexity | Dependencies | Estimate | Risk | Expected ROI | User Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warehouse workspace | P1 | High | Hard | inventory APIs/UI shell | 6-10 weeks | scanner workflows | high | faster receiving/transfers |
| Online order lanes | P1 | High | Hard | kanban, order status rules | 6-10 weeks | status edge cases | high | faster fulfillment |
| Delivery exception center | P1 | High | Medium/Hard | notification/task center | 4-7 weeks | provider variance | high | fewer delivery failures |
| Accounting close wizard | P1 | High | Hard | checklist rules | 6-10 weeks | accounting correctness | high | safer period close |
| Backup center | P1 | High | Medium | backup metadata | 3-5 weeks | restore UX | high | better data confidence |
| Notification task inbox | P1 | High | Medium/Hard | notification grouping | 4-7 weeks | noise tuning | high | focused daily work |

## 32.5 Version 3.0 - Mobile, Intelligence, Collaboration

| Feature | Priority | Business Value | Complexity | Dependencies | Estimate | Risk | Expected ROI | User Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mobile owner dashboard | P2 | High | Hard | responsive dashboards | 8-12 weeks | mobile auth/offline | high | owner engagement |
| Mobile warehouse scanner | P2 | High | Hard | offline/scanner | 10-16 weeks | device variation | high | faster inventory |
| Smart reorder | P2 | High | Hard | sales/stock analytics | 6-10 weeks | bad suggestions | high | fewer stockouts |
| AI report summaries | P2 | Medium/High | Medium/Hard | report insights | 5-8 weeks | trust/explainability | medium/high | easier decisions |
| Scheduled reports | P2 | Medium/High | Medium | reports/notifications | 4-6 weeks | delivery reliability | medium/high | less manual reporting |
| Approval workflows | P2 | High | Hard | roles/task inbox | 6-10 weeks | blocking operations | high | better control |
| Import/export center | P2 | High | Medium/Hard | templates/validation | 6-10 weeks | data quality | high | easier setup/migration |

## 32.6 Version 4.0 - Platform And Enterprise

| Feature | Priority | Business Value | Complexity | Dependencies | Estimate | Risk | Expected ROI | User Impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-company support | P3 | High | Very Hard | data scoping/licensing | 12-20 weeks | data isolation | high for enterprise | multi-business usage |
| Integration API/webhooks | P3 | High | Hard | API platform | 10-16 weeks | support burden | high | ecosystem growth |
| Marketplace/plugins | P4 | High | Very Hard | platform APIs | 20+ weeks | quality/security | long-term high | extensibility |
| Advanced BI/custom reports | P3 | High | Hard | analytics layer | 10-16 weeks | query complexity | high | enterprise reporting |
| Advanced forecasting | P3 | High | Very Hard | historical data/ML | 12-18 weeks | prediction accuracy | medium/high | planning support |
| Enterprise admin portal | P3 | High | Hard | multi-tenant/admin | 10-16 weeks | complexity | high | centralized control |
| Partner/accountant portal | P4 | Medium/High | Hard | permissions/sharing | 8-14 weeks | access control | medium/high | external collaboration |

## 32.7 Roadmap Dependencies

```text
Design Tokens
  -> Component Library
    -> Table Shell
    -> Side Panels
    -> Form System
      -> POS Redesign
      -> Product Wizard
      -> Online Orders
      -> Warehouse Workspace
      -> Accounting Close Wizard

Notification Task Inbox
  -> Delivery Exceptions
  -> Approvals
  -> Offline Queue

Report Insight Framework
  -> Owner Dashboard
  -> Scheduled Reports
  -> AI Report Summaries

Import/Export Center
  -> Migration Tools
  -> Data Cleanup
  -> Enterprise Onboarding
```

## 32.8 Roadmap Risk Register

| Risk | Area | Mitigation |
| --- | --- | --- |
| Redesign slows current users | POS/workflows | phased rollout, feature flags, cashier training mode |
| Component migration creates inconsistency mid-transition | UI system | migrate screen families, not random screens |
| AI recommendations reduce trust if wrong | AI | explainability, confidence, user approval |
| Mobile offline creates data conflicts | mobile/offline | scoped offline capabilities, conflict inbox |
| Accounting workflow mistakes damage trust | finance | accountant validation, QA test suite, close preview |
| Import creates bad data | import | preview, validation, rollback, duplicate detection |
| Notification inbox becomes noisy | notifications | priority rules, grouping, user preferences |
| Roadmap too broad | product | version gates, success metrics, release criteria |

## 32.9 Release Success Metrics

| Version | Success Metrics |
| --- | --- |
| 2.1 | 80% of new screens use tokens/components; WCAG blocker count zero; table shell adopted by top 5 tables. |
| 2.2 | POS sale time reduced by 30%; product creation time reduced by 40%; customer quick add under 30 seconds. |
| 2.3 | Online order processing time reduced by 35%; period close checklist adopted; backup health visible to admins. |
| 3.0 | 30% owner weekly active use on mobile; low-stock purchase suggestions used in 40% of reorder cases. |
| 4.0 | multi-company customers onboarded; public API integrations live; advanced BI used by enterprise accounts. |

---

# Final Deliverable Definition

This document completes the missing specification layer by defining:

- The tokens every UI surface must use.
- The components every screen should be built from.
- The interactions every input method must support.
- The accessibility level required for WCAG AA.
- The perceived performance standards users should experience.
- The offline, printing, and import/export subsystems from a user perspective.
- The AI roadmap and safety model.
- The internationalization model for Arabic-first global growth.
- The user personas that drive dashboard, permission, shortcut, and training design.
- The business rules QA and future development teams can use to derive test cases.
- The release roadmap for NuqtaPlus 2.1 through 4.0.

Future product changes should reference this document before introducing new UI patterns, business workflows, or release commitments.
