# NuqtaPlus World-Class UI Redesign, Design System, and Screen Specification Report

Audit date: 2026-06-23  
Scope: screen-by-screen redesign, action hierarchy, field decisions, dialog reduction, table redesign, visual language, design system, color system, notification UX, permission UX, reporting UX, owner experience, micro-interactions, onboarding, usability/HCI, information architecture, textual wireframes, and NuqtaPlus 2.0 redesign.

This report intentionally avoids repeating the previous code, architecture, security, product, workflow, click-reduction, automation, and productivity reviews. It assumes those are complete.

## Source Surface Used

Reviewed UI inventory:

- 60+ routed screens/report windows.
- 58 dialogs in reviewed Vue screens/components.
- 32 forms.
- 95 tables.
- 449 buttons.
- 441 input controls.

Highest-density screens:

| Screen | Dialogs | Forms | Tables | Buttons | Fields | Tabs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `sales/PosScreen.vue` | 3 | 0 | 0 | 32 | 12 | 0 |
| `products/ProductForm.vue` | 2 | 2 | 0 | 12 | 29 | 0 |
| `online-orders/OnlineOrders.vue` | 4 | 1 | 3 | 17 | 20 | 2 |
| `customers/CustomerProfile.vue` | 3 | 0 | 8 | 12 | 9 | 9 |
| `users/Users.vue` | 2 | 2 | 1 | 9 | 14 | 0 |
| `sales/SaleDetails.vue` | 1 | 1 | 5 | 13 | 8 | 5 |
| `purchases/PurchaseDetails.vue` | 3 | 0 | 4 | 10 | 5 | 4 |
| `expenses/Expenses.vue` | 1 | 1 | 1 | 8 | 11 | 0 |
| `expenses/RecurringExpenses.vue` | 1 | 1 | 1 | 7 | 13 | 0 |
| `accounting/AccountingPeriods.vue` | 3 | 0 | 1 | 9 | 4 | 0 |

Brutal design verdict: NuqtaPlus does not need more UI. It needs a stronger interaction model. The current UI is module-rich but still too screen-centric. Version 2 should be workspace-centric, task-centric, and role-aware.

## Report 1: Screen-By-Screen Redesign

Reduction estimates:

- Click reduction: expected average fewer clicks in the redesigned screen.
- Time reduction: expected average time saved for the screen's primary task.
- Error reduction: expected drop in common user mistakes for that screen.
- Training reduction: expected drop in explanation/training needed for that screen.

### Authentication, Activation, Setup

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Activation | Activate license and machine. | Licensing is abstract; machine ID and file activation can feel technical. Tabs create a decision before the user knows what to do. | Header: "Activate NuqtaPlus". Primary card: license key field. Secondary card: offline activation collapsed. Footer: support contact. Machine ID becomes copy-only utility row. | Tabs -> segmented control only if both modes are available. File picker -> secondary accordion. Status message -> inline banner. | 2 clicks, 30-60 sec, medium errors, medium training. |
| ServerSetup | Connect client computer to server. | "Server" language is technical. Manual and remote forms require the user to choose connection type early. | Header: "Connect this computer to your store". Body: discovered servers as cards. Below: manual connect accordion. Remote access accordion hidden unless enabled. | Forms -> wizard with Discover, Manual, Remote. Server list -> selectable cards. | 3-5 clicks, 1-3 min, high errors, high training. |
| Login | Authenticate user. | Fine for admin/manager, slow for cashier terminals. | Split into two modes: PIN cashier login and username/password. Last users as avatar chips on POS devices. | Password login remains. PIN login -> keypad bottom sheet/tablet panel. | 2-4 clicks, 10-30 sec, medium errors, high training for cashiers. |
| FirstRun | Initial app state. | Currently invisible/empty in inventory. First run should be a guided business setup. | Full-screen onboarding: owner account, company, currency, first branch, first cashbox, backup. Progress left rail. | Static screen -> setup wizard. | 5-10 clicks over setup, 10-20 min, high errors, high training. |
| SetupWizard | Choose operating mode/modules. | Preset cards are good but should lead to an operational checklist. | Stepper: business type, modules, accounting, branches, users, backup test. Right panel: what this choice enables. | Cards -> guided decision wizard. Completion -> persistent setup checklist. | 3-6 clicks, 5-15 min, high errors, high training. |

### Global Shell

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| MainLayout / Drawer | Global navigation. | Drawer has too many module groups for daily users. Users must know system structure. | Top: role workspace, command palette, current branch/warehouse. Drawer: My Work, Sales, Inventory, Finance, Reports, Admin. Bottom: favorites/recent. | Full nav list -> role-aware nav + favorites + recent. Rare settings -> admin drawer. | 3-8 clicks/day, 5-15 min/day, medium errors, high training. |
| QuickSearch | Search records/pages. | Strong base, but search is not yet a complete command surface. | Command palette layout: search input, command results, entity results, recent actions. Default result action visible. | Search dialog -> command palette. Actions -> keyboard-first list. | 2-6 clicks/task, 5-15 min/day, low errors, medium training. |
| BranchWarehouseSelector | Context switcher. | Context can be missed; wrong branch/warehouse causes severe mistakes. | App-bar pill with branch/warehouse. Click opens compact context popover with defaults, recent, and "why this matters". | Selects -> context popover. Wrong-context warnings -> inline banner. | 1-3 clicks/task, 5-10 min/day, high errors, medium training. |
| Notifications | Notification list. | Notifications are likely passive messages. | Work inbox: Critical, Needs action, Later, Done. Group by type and entity. | List -> task inbox. Dismiss -> resolve/snooze. | 3-6 clicks/issue, 5-20 min/day, high errors, medium training. |
| Forbidden | Permission denied. | Dead end unless user knows who can grant access. | Explain blocked action, required role, and "request access" or "ask manager" action. | Static error -> access request screen. | 1-3 clicks, 1-5 min, low errors, high training. |
| Profile | Personal user information. | Mostly informational. Missing personal productivity defaults. | Sections: profile, role, default branch/warehouse/cashbox/printer, table density, shortcuts. | Profile card -> personal preferences panel. | 1-3 clicks/day, small time, medium errors, medium training. |
| About | Product/support info. | Useful but should support real support workflows. | Support workspace: version, license, update, diagnostics export, contact, changelog. | Static about -> support center. | 2-5 clicks/support case, 5-15 min, medium errors, low training. |

### Dashboard And Role Centers

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Dashboard | General operational overview. | One dashboard cannot serve all roles. Many panels compete for attention. | Role-specific dashboards: Cashier, Manager, Warehouse, Accountant, Owner, Admin. Header: today's context. Center: top tasks. Right: alerts. Bottom: KPIs/recent. | Static dashboard -> role center. Cards -> task cards. Alerts -> work queue. | 4-10 clicks/day, 10-30 min/day, medium errors, high training. |
| WorkHub | Quick actions and info cards. | Excellent idea, but should dominate the dashboard. | Primary action grid per role. Recent/pinned actions. "Resume last task". | Action tiles -> configurable smart grid. | 2-5 clicks/task, 5-20 min/day, low errors, high training. |
| QuickQuestionsPanel | Business question shortcuts. | Likely report launch only; should answer before navigation. | Question card shows answer preview, trend, and "open details". | Report link -> insight card. | 2-4 clicks/question, 30-90 sec, low errors, medium training. |
| AlertsCenter | Alerts. | Alerts should not be passive. | Action queue with severity, owner, due date, next action, snooze. | Cards -> task queue. | 3-8 clicks/alert, 1-5 min/alert, high errors, medium training. |
| RecentActivity | Recent events. | Activity can be noise if not tied to decisions. | Filtered timeline by user/entity; show business impact. | Feed -> timeline with filters. | 2-4 clicks/investigation, 1-3 min, medium errors, low training. |

### Sales And POS

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| PosScreen | Fast checkout. | 32 buttons, multiple dense regions, product/cart/payment/drafts all visible. New cashiers see too much. | Three-zone layout: product/search left, cart center, payment/actions right. App bar: mode, branch, cashier, printer. Bottom sticky: total, exact cash, complete. | Line edit dialog -> inline cart editor. Drafts dialog -> side panel. Empty cart -> instructional drop zone. Manager controls -> overflow. | 4-8 clicks/sale, 20-45 sec/sale, medium errors, high training. |
| Sales | Invoice list. | Table may act as archive, not action queue. | Header summary: today, unpaid, returned. Tabs: Today, Unpaid, Returned, All. Table has action rail. | Filters -> quick chips. Row buttons -> context menu + primary inline action. | 3-6 clicks/task, 1-3 min, medium errors, medium training. |
| NewSale | Installment sale. | Separate sale path may confuse users; 16 fields. | Merge installment as payment mode unless a separate workflow is legally needed. If separate, use stepper: customer, items, payment plan, review. | Full form -> wizard. Product table -> scan/add row inline. | 5-9 clicks, 2-5 min, high errors, high training. |
| SaleDetails | Invoice detail/action hub. | 5 tables and many actions create visual overload. | Header: invoice state and next best action. Left: invoice summary. Center: items and payments. Right: action panel. Tabs only for detailed audit/history. | Actions -> right action rail. Return/payment -> side panels. Tables -> expandable sections. | 4-8 clicks, 2-6 min, high errors, medium training. |
| Collections | Collect customer debt. | Looks like a table with filters; collection should be a task workflow. | Search/phone field at top. Debt queue below. Selected customer opens payment side panel. | Payment action -> side panel. Table -> debt work queue. | 3-6 clicks/payment, 30-60 sec, medium errors, high training. |

### Customers

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Customers | Manage customers. | Table is useful but not segmented enough for collections/service. | Views: All, Debtors, Overdue, Top buyers, New, Inactive. Row primary action changes by view. | Export -> overflow. Delete -> overflow/destructive. Quick add -> side panel. | 3-6 clicks/customer task, 1-3 min, medium errors, medium training. |
| CustomerForm | Create/edit customer. | Full page for small customer creation. Duplicate dialog interrupts after entry. | Quick add side panel by default: name, phone. Full form as "More details". Duplicate detection live. | Full page -> side panel for create, full page for advanced edit. Duplicate dialog -> inline warning. | 4-7 clicks, 30-90 sec, high errors, high training. |
| CustomerProfile | Customer 360. | 8 tables, 9 tabs, 3 dialogs. Too much detail at once. | Header: balance, risk, phone, WhatsApp, collect. Center: timeline. Right: customer facts and next actions. Tabs: Invoices, Payments, Installments, Notes, Audit. | WhatsApp dialog -> side panel. Action dialog -> side panel. Phone dialog -> quick popover. Tables -> timeline-first. | 5-12 clicks, 3-8 min, high errors, high training. |

### Catalog And Products

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Products | Product list/catalog. | Data table needs operational saved views. | Header summary: products, low stock, no barcode, no category. Views: Active, Low stock, No barcode, Services, Price issues. | Advanced filters -> filter drawer. Row actions -> context menu. Quick edit -> inline cells. | 3-7 clicks/task, 1-4 min, medium errors, medium training. |
| ProductForm | Create/edit product. | 29 fields, 2 dialogs, admin verify. High chance of wrong or skipped data. | Stepper: type/template, basics, pricing, inventory, review. Advanced sections collapsed. Sticky save. | Opening stock dialog -> inline inventory section. Admin verify -> manager approval side panel. Units -> expandable table. | 6-12 clicks/product, 2-6 min, high errors, high training. |
| Categories | Category list. | Category creation should often happen in product context. | Simple table with inline add row. Drag/drop order. Merge/delete safeguards. | Dialog -> inline editor. Delete confirm -> inline destructive popover. | 2-4 clicks/category, 20-60 sec, medium errors, medium training. |

### Inventory And Warehouse

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Inventory | Stock overview and adjustments. | 9 fields, 8 buttons, adjustment dialog. Could overwhelm warehouse users. | Warehouse workspace: stock list, scan/search, selected product side panel with adjust/transfer/count. | Adjustment dialog -> side panel. Filters -> chips/drawer. | 4-8 clicks/task, 2-5 min, high errors, high training. |
| StockMovements | Stock audit history. | Useful but primarily investigative. | Timeline/table hybrid. Default grouped by product/source. Row expands to source document. | Static table -> expandable audit rows. | 2-5 clicks/investigation, 1-3 min, medium errors, low training. |
| StockTransfer | Create warehouse transfer. | Transfer should be scanner-first and step-based. | Stepper: source/destination, scan items, review, submit. Sticky source/destination context. | Form -> wizard. Product fields -> scanner line editor. | 4-8 clicks/transfer, 2-5 min, high errors, high training. |
| TransferRequests | Approve/reject transfer. | Table with reject dialog. Needs "waiting for me" ownership. | Inbox tabs: Waiting for me, Sent by me, Completed. Row expands to items. Approve inline. Reject reason bottom sheet. | Reject dialog -> bottom sheet. Approve -> inline primary button. | 3-6 clicks/request, 1-3 min, medium errors, medium training. |
| LowStock | Low stock table. | No direct buying workflow visible. | Group by supplier/category. Primary action: create purchase draft. Secondary: adjust min stock, ignore. | Table -> grouped reorder queue. | 5-10 clicks/order, 5-15 min/order, high errors, high training. |
| ExpiryAlerts | Expiring stock. | Passive alert table. | Urgency lanes: Expired, 7 days, 30 days. Actions: discount, transfer, return, write off, mark reviewed. | Table -> action queue. | 4-8 clicks/item, 2-6 min, high errors, medium training. |
| BranchesWarehouses | Admin branch/warehouse setup. | 3 dialogs, separate branch/warehouse management. | Split view: branches left, warehouses right. Inline add/edit. Delete in overflow with impact preview. | Dialogs -> inline editor/side panel. Delete dialog -> impact popover. | 4-8 clicks/setup task, 2-6 min, high errors, medium training. |

### Purchasing And Suppliers

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Suppliers | Supplier list. | Table should expose payables and actions. | Views: All, Payable, Overdue, Recent. Row primary action: pay or create purchase. | Supplier form dialog -> side panel. Delete -> overflow. | 3-6 clicks/task, 1-3 min, medium errors, medium training. |
| SupplierProfile | Supplier 360. | 3 tables, 4 tabs; good but should be timeline-first. | Header: payable, last purchase, phone. Timeline center. Right action panel. Tabs for purchases, returns, payments, products. | Tables -> timeline + expandable tabs. | 4-8 clicks/investigation, 2-5 min, medium errors, medium training. |
| Purchases | Purchase invoice list. | Should be AP/receiving queue. | Views: Draft, Unpaid, Received, Returned, By supplier. Header payables summary. | Filters -> saved views. Row click -> details. | 3-6 clicks, 1-3 min, medium errors, medium training. |
| NewPurchase | Receive goods/create purchase. | 15 fields and item table; high typing. | Receiving wizard: supplier, scan items, payment, review. Product lines are scanner-first. | Full form -> wizard. Product add -> inline scan line. | 5-10 clicks, 3-8 min, high errors, high training. |
| PurchaseDetails | Purchase detail/action hub. | 3 dialogs and 4 tables create interruptions. | Header status/payable. Main: items and totals. Right action panel: pay, return, cancel, duplicate. History collapsed. | Payment/return/cancel dialogs -> side panels/wizard. | 4-8 clicks, 2-6 min, high errors, medium training. |

### Online Orders And Shipping

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| SalesChannels | Manage online order sources. | Admin configuration appears near daily commerce. | Move under Integrations/Admin. Daily channel health appears on online orders dashboard. | Form dialog -> side panel. Delete -> overflow. | 2-4 clicks/setup, 1-2 min, medium errors, low training. |
| OnlineOrders | Receive/process online orders. | 4 dialogs, 3 tables, 17 buttons, 20 fields. Too dense for fulfillment work. | Kanban/status lanes plus table toggle. Selected order opens split-view side panel: customer, items, status, shipment. | Edit/history/return/delete dialogs -> side panel tabs. Status history -> expandable timeline. Confirm -> inline impact step. | 6-12 clicks/order, 2-6 min, high errors, high training. |
| DeliveryShipments | Manage shipments. | Table is operational but should be exception-first. | Views: Delayed, Failed, Returned, Awaiting pickup, Delivered today, All. Row action: track/sync/call. | Cancel confirm -> side panel with impact. Tracking -> inline event drawer. | 4-8 clicks/shipment, 1-4 min, medium errors, medium training. |
| DeliveryTracking | Legacy shipment tracking. | Overlaps with shipments. | Remove as separate screen; redirect to unified shipments with Tracking view. | Screen -> saved view. Detail dialog -> side panel. | 2-5 clicks, 1-3 min, medium errors, medium training. |
| ShipmentDetails | Shipment detail and event history. | Detail page can isolate the user from order/customer context. | Split view: shipment state timeline left, customer/order cards right, next action pinned. | Tabs -> timeline + cards. Cancel action -> side panel. | 3-6 clicks, 1-3 min, medium errors, medium training. |
| DeliveryProviders | Manage providers. | Setup belongs in admin; daily users need provider health only. | Provider cards with health, enabled state, setup progress, logs link. | Static cards -> setup checklist cards. | 2-4 clicks/setup, 1-3 min, medium errors, low training. |
| BoxySettings | Configure Boxy provider. | Integration configuration can be technical. | Wizard: credentials, test connection, defaults, webhook status. | Full form -> stepper. Advanced fields -> accordion. | 3-6 clicks/setup, 3-10 min, high errors, high training. |
| GenericProviderSettings | Configure provider. | Similar risk to Boxy settings. | Same provider setup template for every provider. | Form -> stepper/accordion. | 3-6 clicks/setup, 3-10 min, high errors, high training. |
| BoxyWebhookLogs | Debug provider webhooks. | Diagnostic screen should not appear in daily navigation. | Move under Support/Diagnostics. Daily delivery exception center shows failures only. | Payload dialog -> expandable row. | 2-4 clicks/debug, 1-5 min, medium errors, low training. |

### Finance, Treasury, Accounting

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Expenses | Manage expenses. | Expense entry should be extremely quick; 11 fields can slow it. | Header quick expense. Table below. Side panel form with amount first. Templates visible. | Dialog -> side panel. Recurring action -> convert template. | 4-7 clicks/expense, 30-90 sec, medium errors, high training. |
| RecurringExpenses | Manage recurring expenses. | 13 fields and repeat logic add cognitive load. | Calendar/list split. Preset templates: rent, salary, internet, delivery. Form side panel. | Dialog -> side panel. Generate button -> background action with result toast. | 4-8 clicks/template, 1-3 min, medium errors, medium training. |
| Cashboxes | Manage cashboxes. | Cashboxes should show operational cash status, not only setup. | Cards for each cashbox: expected balance, counted, difference, last close. Detail side panel. | Form dialog -> side panel. | 3-6 clicks, 1-5 min, high errors, medium training. |
| CashboxLedger | Cash movement history. | Table should support reconciliation. | Sticky summary, running balance chart, filter chips, source links. | Static table -> reconciliation ledger. | 3-6 clicks/investigation, 2-5 min, medium errors, medium training. |
| Vouchers | Receipts/payments. | Manual voucher screen can cause wrong party/type. | Segmented action: Receive, Pay, Transfer. Context-aware party selector. | Row cancel -> overflow. New voucher -> side panel. | 4-8 clicks/voucher, 1-3 min, high errors, high training. |
| TreasuryTransfers | Move money between cashboxes/banks. | 9 fields for a common but sensitive task. | Stepper: from, to, amount, reason, review. | Dialog -> wizard side panel. | 4-7 clicks, 1-3 min, high errors, medium training. |
| BankAccounts | Manage bank accounts. | Setup screen; operations need reconciliation. | Account cards, status, last reconciliation, transactions. Add/edit side panel. | Form -> side panel. | 2-5 clicks, 1-3 min, medium errors, low training. |
| AccountingPeriods | Open/close periods. | 3 dialogs; period close is too important for table-first UX. | Current period status card, close checklist, history table below. Closing opens full-screen wizard. | Open dialog -> compact side panel. Close dialog -> wizard. Detail dialog -> page/side panel. | 5-10 clicks/close, 5-20 min, high errors, high training. |
| ChartOfAccounts | Manage accounts. | Accountant-only tree; buttons for add/edit/delete. | Tree left, account details right. Inline account editing. Add child contextual. | Dialog -> split-view editor. Delete -> impact preview. | 3-6 clicks/account, 1-3 min, high errors, medium training. |
| JournalEntries | View/create journal entries. | Manual journal should be guided and accountant-specific. | Tabs: Posted, Draft, Templates. Journal form side panel/full page. | Manual form dialog -> full-screen journal editor. | 4-8 clicks/entry, 2-6 min, high errors, medium training. |
| ManualJournalForm | Manual journal creation. | High-risk accounting form. | Full-screen two-column: header/context top, journal lines table, balance status sticky footer. | Dialog -> full-screen editor. | 4-8 clicks, 3-8 min, high errors, medium training. |
| SystemAccounts | Accounting mappings. | Technical configuration. | Checklist by module: Sales, Inventory, Purchases, Treasury. Each mapping shows status. | Table/form -> setup checklist. | 4-8 clicks/setup, 5-15 min, high errors, high training. |
| PostingFailures | Repair failed postings. | Should be a work queue. | Group by cause. Each group has suggested fix and retry. Row expands to documents. | Table -> repair inbox. | 4-10 clicks/failure, 2-10 min, high errors, high training. |
| OpeningBalances | Initial accounting setup. | High-risk one-time setup. | Wizard: customers, suppliers, cash, inventory, review, create opening entry. | Static form -> guided setup/import wizard. | 5-12 clicks/setup, 20-60 min, high errors, high training. |

### Reports

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Reports | Detailed reports launcher. | Report users want answers, not report taxonomy. | Question-first report hub: sales, profit, debt, cash, inventory, expenses. Saved report packs. | Cards -> insight cards with preview. | 3-6 clicks/report, 1-3 min, low errors, medium training. |
| SimpleReports | Quick questions. | Good concept; should become the default owner report UX. | Owner questions with answer preview, trend, and next action. | Link cards -> live answer cards. | 2-4 clicks/question, 30-90 sec, low errors, high training. |
| ReportWindow | Standalone report window. | 17 buttons and 8 fields can overwhelm. | Header: question, date preset, export. Left filter drawer. Main insights summary, then chart/table. | Filters -> drawer. Export actions -> overflow. | 3-6 clicks/report, 1-3 min, medium errors, medium training. |
| SalesReportPage | Sales report. | Needs interpretation. | Summary: sales, average ticket, unpaid, returns, best hour. Then chart/table. | Raw numbers -> insight story. | 2-4 clicks/report, 30-90 sec, low errors, medium training. |
| ProfitReportPage | Profit report. | Profit needs caveats and drivers. | Show net profit, margin, cost drivers, low-margin products, trend. | Table -> insight + drilldown. | 2-4 clicks/report, 1-3 min, medium errors, medium training. |
| TopProductsReportPage | Best products. | Needs action: reorder, promote, investigate margin. | Cards: top revenue, top quantity, low margin winners, declining products. | Static report -> action report. | 2-4 clicks/report, 1-3 min, medium errors, medium training. |
| DebtsReportPage | Debt report. | Should drive collection action. | Debtors ranked by amount/overdue. Actions: collect, message, print statement. | Report -> collection queue. | 4-8 clicks/collection, 5-20 min, high errors, medium training. |
| CashBoxReportPage | Cashbox report. | Needs reconciliation framing. | Expected vs actual, inflows/outflows, exceptions, by user. | Report -> close/reconcile view. | 3-6 clicks, 2-10 min, high errors, medium training. |
| ExpensesReportPage | Expenses report. | Needs budget/comparison. | Expenses by category, recurring vs one-time, unusual spend, recommendations. | Table -> insight + anomaly. | 2-4 clicks, 1-3 min, medium errors, medium training. |
| FinancialReports | Financial statements. | 6 tables, 11 tabs: accountant-heavy. | Accountant mode: statements tabs. Owner mode: plain summary. Sticky period/date filters. | Tabs -> role switch + sections. | 4-8 clicks, 3-10 min, medium errors, high training. |
| InventoryValuation | Inventory value. | Needs risk analysis. | Value by warehouse/category, aging, dead stock, overstock, stockout risk. | Table -> risk dashboard. | 3-6 clicks, 2-5 min, medium errors, medium training. |
| OnlineCommerceReports | Online commerce report. | Dense channel metrics. | Channel scorecards, conversion, return rate, delivery success, next actions. | Tables -> scorecards + drilldown. | 3-6 clicks, 2-5 min, medium errors, medium training. |
| OnlineCommerceShippingReports | Unified commerce/shipping reports. | 7 tables and filters; high information load. | Executive summary top; tabs by problem: sales, returns, shipping failures, carrier performance. | Tables -> grouped insight sections. | 4-8 clicks, 3-8 min, medium errors, high training. |
| DeliveryReports | Delivery reports. | Needs exception and provider comparison. | Provider performance scorecard, late shipments, failed reasons, action list. | Static tables -> operator scorecard. | 3-6 clicks, 2-5 min, medium errors, medium training. |

### Administration

| Screen | Current Purpose | Problems And Frustrations | Proposed Layout And Component Moves | Component Transformations | Expected Reduction |
| --- | --- | --- | --- | --- | --- |
| Users | Manage employees. | 14 fields, reset password dialog, delete confirm. Admins need role templates. | Employee table with role/branch views. Add user side panel: template first, personal info, branch/cashbox. | Form dialog -> side panel. Password reset -> quick popover. Delete -> deactivate default. | 5-10 clicks/user, 2-5 min, high errors, high training. |
| Roles | Manage roles/permissions. | Permission complexity is high. | Role templates plus business task toggles. Preview "this role can..." in plain language. | Raw permission UI -> task matrix. Dialogs -> side panel. | 6-12 clicks/role, 10-30 min, high errors, high training. |
| Settings | System settings hub. | 8 tabs can hide settings. | Settings home with search. Categories: Business, Sales, Inventory, Finance, Integrations, Backup, Support. | Tabs -> searchable settings categories. | 3-8 clicks/setting, 1-5 min, medium errors, high training. |
| FeatureFlags | Enable modules. | "Feature flags" is technical. | Rename to Enabled Modules. Cards show business impact, required setup, dependencies. | Toggle list -> module cards. Upgrade/downgrade dialogs -> impact wizard. | 4-8 clicks/setup, 5-15 min, high errors, high training. |
| DeliveryProviders | Provider admin. | Covered above; belongs under integrations. | Provider cards with setup health. | Cards + setup wizard. | 2-4 clicks/setup, 1-3 min, medium errors, low training. |
| MessagingSettings | Configure messaging and logs. | Dense settings plus logs. | Split: Provider setup, Templates, Delivery log, Failures. | Tabs -> task sections. Preview dialog -> inline preview panel. | 3-6 clicks/config, 5-15 min, high errors, medium training. |
| CompanyInfoForm | Company profile. | Standard settings form. | Inline settings card with save-on-change or sticky save. | Form -> settings card. | 1-3 clicks, 30-90 sec, low errors, low training. |
| CurrencySettings | Currency setup. | Rate/currency decisions can affect reports. | Currency card with preview examples and warnings. | Form -> settings card + preview. | 1-3 clicks, 1-3 min, medium errors, medium training. |
| ConnectionSettings | Client/server connection. | Technical network language. | Store server card, connection health, reconnect/test buttons. Advanced manual accordion. | Form -> connection status card. | 2-5 clicks, 1-5 min, high errors, medium training. |
| RemoteAccessSettings | Remote access setup. | Technical and sensitive. | Wizard: enable, URL, access rules, test, share. Status banner always visible. | Form -> wizard/status card. | 3-6 clicks, 3-10 min, high errors, medium training. |
| DataBackupRestore | Backup/restore. | Multiple dialogs and selection decisions. | Backup center: health status, schedule, manual backup, restore wizard. | Menus/dialogs -> backup center + restore wizard. | 4-8 clicks, 2-10 min, high errors, high training. |
| BackupManager | Backup list/actions. | Actions in menu/table; destructive tasks need clearer hierarchy. | Latest backup card, backup table, row actions in overflow, restore wizard. | Menu -> action toolbar. Restore -> wizard. | 3-6 clicks, 1-5 min, high errors, medium training. |
| LicenseStatus | License info. | Can be too technical. | License health card, expiry, support action, copy machine ID. | Raw table -> status card. | 1-3 clicks, 30-90 sec, low errors, low training. |
| ServerConnectionInfo | Connection details. | Technical details should support troubleshooting. | Health card plus "copy support bundle". Details collapsed. | Table -> health card. | 2-5 clicks/support case, 3-10 min, medium errors, low training. |
| UpdateNotification | App update flow. | Update dialogs can interrupt work. | Non-blocking banner unless critical. Update center shows progress. | Dialog -> banner/progress notification. | 1-3 clicks, less interruption, medium errors, low training. |

## Report 2: Button And Action Audit

### Global Action Hierarchy

Every screen should use this action order:

1. One primary action, visible and emphasized.
2. Up to three secondary actions in the toolbar.
3. Row-level action menu for record-specific actions.
4. Bulk actions visible only after selecting rows.
5. Destructive actions in overflow, never beside the primary action.
6. Rare/admin actions in advanced overflow or settings.
7. Repetitive actions available through keyboard shortcuts and command palette.

### Button Decisions By Type

| Button Type | Current Risk | New Pattern |
| --- | --- | --- |
| Create/Add | Repeated across pages, sometimes full navigation | Primary page action or floating action on mobile. Opens side panel for quick entity creation. |
| Edit | Often row button | Inline edit for safe fields; side panel for complex fields; full page for high-risk records. |
| Delete | Too visible in some row actions | Move to overflow. Prefer deactivate/archive. Require impact preview for business records. |
| Refresh | Appears often | Keep as toolbar icon; auto-refresh critical queues. Manual refresh in overflow unless important. |
| Export | Visible on many screens | Toolbar secondary or overflow. Remember format. |
| Print | Contextual | Keep inline for invoices/receipts; add keyboard shortcut F9. |
| Reprint | Contextual | Row context menu; audit-friendly confirmation only if needed. |
| Return | High-risk | Side panel/wizard from invoice/order details. |
| Collect/Pay | High-frequency | Primary action on debtor/payable views. |
| Cancel | High-risk | Overflow + impact confirmation. |
| Save | Forms | Sticky footer. Ctrl+S. Show save state. |
| Save and add another | Repetitive entry forms | Secondary sticky footer action for products/customers/purchases/expenses. |
| Test connection | Settings | Inline inside setup step, not global toolbar. |
| Sync status | Delivery | Row action for one shipment; bulk action for selected shipments. |
| Open details | Tables | Row click. No separate eye button unless row click is not possible. |

### Screen Action Redesign

| Screen | Keep Visible | Move To Overflow | Convert To Inline/Context | Convert To Keyboard/Automatic |
| --- | --- | --- | --- | --- |
| POS | Complete sale, exact cash, customer, hold cart | Draft management, clear cart, manager tools | Line discount/note/remove inside cart row | Barcode add, Enter complete, F9 print |
| Sales | New sale, unpaid filter | export, old filters | collect, return, reprint in row menu | Ctrl+K invoice search |
| Customers | New customer, debtor view | export, delete | collect/call/WhatsApp row menu | phone search focus |
| CustomerProfile | Collect, WhatsApp, edit | delete/merge | invoice/payment actions in timeline | copy phone, send template |
| Products | New product, saved views | export, delete | price/stock quick edit | scan barcode search |
| ProductForm | Save, save and add another | admin verify details | category/unit quick add | barcode fill, defaults |
| Inventory | Adjust, transfer, count | export, advanced filters | product row actions | scanner focus |
| TransferRequests | Approve/receive | reject/cancel | expand row items | notify receiver |
| LowStock | Create purchase draft | ignore, export | set min stock inline | group by supplier |
| Expenses | Add expense | export/delete | duplicate/convert recurring | recurring generation |
| Purchases | New purchase | export | pay/return in row menu | supplier filter memory |
| PurchaseDetails | Pay, return | cancel/delete | item details expandable | duplicate purchase |
| OnlineOrders | Prepare/ship selected order | delete | status/customer actions in row menu | auto-provider suggestion |
| DeliveryShipments | Track/sync | cancel | call/customer in row menu | background sync |
| AccountingPeriods | Close current period | older period actions | detail expand | readiness checks |
| Reports | Export, save view | advanced filters | drilldown links | default date presets |
| Users | Add employee | delete | reset password/PIN row menu | role template defaults |
| Roles | New role/template | delete | permission group expand | task-based defaults |
| Settings | Search settings | raw advanced settings | inline setting cards | auto-save safe toggles |

### Actions To Remove Or Merge

- Separate "view details" eye buttons where row click already opens details.
- Repeated refresh buttons in screens that can refresh on return/focus.
- Delete buttons directly beside edit buttons on daily operational tables.
- Standalone provider log navigation for non-admin users; surface failures in task queues.
- Separate payment/collection entry paths when the user is already in a customer/supplier/invoice context.
- Separate tracking screen when shipment table and details can carry tracking.

## Report 3: Field Audit

### Field Decision Rules

| Field Kind | Decision |
| --- | --- |
| Branch, warehouse, cashbox, currency | Remembered per user and auto-filled. Visible as context, not repeated in every form. |
| Date | Default today. Date picker only when changed. |
| Customer phone | Primary customer identifier. Normalize and duplicate-check live. |
| Customer name | Required only when saving customer. Optional for anonymous cash sale. |
| Product barcode | First field for physical products. Scan-focused. |
| Product category | Autocomplete with inline create. Default from previous product. |
| Unit | Dropdown/chip selector. Default by product template. |
| Quantity | Numeric stepper/keypad; scan increments quantity. |
| Price | Calculated/defaulted from product. Inline margin warning if edited. |
| Discount | Hidden until user chooses discount. Requires approval above threshold. |
| Notes | Collapsed optional field unless required by action reason. |
| Supplier | Autocomplete with recent suppliers and inline create. |
| Payment method | Segmented button: cash, debt, partial, card/bank if enabled. |
| Cashbox | Auto-filled from user. Change only through advanced context selector. |
| Delivery provider | Suggested by province/channel; selectable dropdown. |
| Address | Structured fields where shipping is used; free text secondary. |
| Accounting account | Hidden for non-accountants. Autocomplete/tree selector for accountants. |
| Role/permission | Role template first; advanced permissions behind accordion. |

### Form-Level Field Redesign

| Form | Required Visible Fields | Auto-Filled/Remembered | Advanced/Hidden Fields | Better Control Type |
| --- | --- | --- | --- | --- |
| Customer quick add | phone, name | branch, type | address, notes, credit limit | phone input + duplicate chips |
| Full customer | phone, name, type | city/area from recent | notes, tags, credit settings | sections/accordion |
| Product template | product type, name, barcode, category, price | unit, currency, branch, warehouse | units, expiry, stock opening, supplier | template cards + autocomplete |
| Service product | name, received price mode | currency | stock fields disappear completely | segmented product type |
| Inventory product | barcode/name/category/price/unit | warehouse/currency | opening stock, min stock, expiry | stepper + accordions |
| POS payment | amount received/payment type | exact amount, cashbox | notes, split payment | numeric keypad + segmented buttons |
| Sale return | item, qty, reason | original payment, stock destination | notes | stepper + chip reason |
| Expense | amount, category | date, cashbox, currency | notes, attachment, recurring | amount-first side panel |
| Recurring expense | template, amount, schedule | cashbox/currency | end date, notes | preset templates + date picker |
| Voucher | direction, party, amount | cashbox, currency, date | account mapping | segmented direction + autocomplete |
| Purchase | supplier, product lines, payment state | warehouse, currency, date | notes, extra costs | receiving wizard |
| Purchase line | product/barcode, qty, cost | unit, previous cost | expiry, batch | scan line editor |
| Stock transfer | destination, items, qty | source warehouse | notes, requested by | wizard + scanner |
| Online order | channel, customer, products | branch, date, status | internal notes | split form/side panel |
| Shipment | provider, address/phone | customer/order data, COD | package advanced fields | provider cards + autocomplete |
| User | name, username/PIN, role template | branch/warehouse defaults | granular permissions | stepper + templates |
| Role | template/name | common permissions | raw permission tree | task matrix |
| Settings | only the setting being changed | existing value | advanced/system details | searchable setting cards |

### Fields That Should Disappear From Basic Mode

- Accounting fields outside accountant/admin contexts.
- Advanced stock/batch/expiry fields for services.
- Provider webhook/log fields for daily users.
- Password fields when cashier PIN mode is used.
- Manual cashbox selection when a user has one assigned cashbox.
- Branch/warehouse fields when the user has one assignment.

## Report 4: Dialog And Modal Audit

### Modal Rule

Dialogs should be reserved for:

- Short confirmation with serious consequence.
- Blocking setup step.
- Urgent system problem.
- Very small form under 4 fields.

Everything else should become a side panel, inline edit, bottom sheet, wizard, or expandable row.

### Dialog Redesign Inventory

| Current Dialog Area | Current Problem | New Pattern |
| --- | --- | --- |
| POS line edit | Interrupts checkout | Inline cart editor or small popover anchored to line. |
| POS drafts | Drafts are secondary but useful | Right side panel. |
| POS open-period required | Blocking system requirement | Persistent banner with "Open period" action, not surprise modal if avoidable. |
| Product opening stock | Interrupts product creation | Inline inventory section in product wizard. |
| Product admin verify | Security/approval interruption | Manager approval side panel or approval request. |
| Customer duplicate warning | Appears late | Inline live duplicate detection. |
| Customer WhatsApp | Communication workflow | Side panel with templates and preview. |
| Customer action dialog | Action on profile | Side panel/action drawer. |
| Customer phone display | Too small for modal | Popover or copyable phone row. |
| Expense form | Common quick entry | Side panel. |
| Recurring expense form | Multi-field form | Side panel with schedule preview. |
| Accounting open period | Short setup | Side panel. |
| Accounting close period | High-risk process | Full-screen wizard. |
| Accounting period details | Information review | Side panel or detail page. |
| Online order edit | Large form | Side panel split view. |
| Online order history | Timeline | Expandable row/side panel tab. |
| Online order return | High-risk workflow | Side panel wizard. |
| Online order delete/cancel | Confirmation | Keep confirmation, but include impact summary. |
| Purchase payment | Common action | Side panel from purchase details. |
| Purchase return | High-risk workflow | Wizard side panel. |
| Purchase cancel | Confirmation | Keep, with impact summary. |
| Transfer reject | Short reason | Bottom sheet/popover. |
| Branch/warehouse forms | Admin setup | Split-view inline editor. |
| User form | Multi-field form | Side panel wizard. |
| Reset password | Short action | Popover or side panel. |
| Role dialogs | Complex permissions | Full side panel/task matrix. |
| Feature upgrade/downgrade | Business impact | Impact wizard. |
| Backup restore | High-risk | Full restore wizard. |
| Update notification | Interrupts work | Banner/progress notification unless critical. |
| Payload viewer | Diagnostic detail | Expandable row with formatted JSON. |

## Report 5: Table Redesign

### Universal Table Specification

Every major table uses:

- Sticky header.
- Sticky summary/footer when totals matter.
- Pinned primary entity column.
- Row click opens details.
- Row context menu.
- Bulk action toolbar appears on selection.
- Quick filters above table.
- Saved views.
- Column presets by role.
- Density toggle.
- Expandable row for details/history.
- Empty state with next action.

### Table Specifications By Screen

| Table | Default Columns | Hidden Optional Columns | Pinned Columns | Grouping | Saved Views | Inline Editing | Bulk Actions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sales | invoice, customer, total, paid, status, date, cashier | branch, warehouse, margin, channel | invoice/customer | status/date/cashier | Today, Unpaid, Returned, Cancelled | status notes only | print, export, message |
| Customers | name, phone, debt, last sale, status | address, type, branch, created | name/phone | debt status/type | Debtors, Overdue, Top buyers, New | phone/tags | message, tag, export |
| Customer profile invoices | invoice, date, total, paid, remaining, status | branch, cashier, margin | invoice | status/month | Open, Paid, Returned | none | print/message |
| Customer payments | date, amount, method, invoice, cashier | cashbox, notes | date | method/month | This month, By invoice | notes | export |
| Products | name, barcode, category, stock, price, margin | supplier, unit, min stock, created | name/barcode | category/supplier | Low stock, No barcode, Low margin | price, min stock | price update, category, export |
| Inventory stock | product, warehouse, available, reserved, min, expiry | cost, value, branch | product | warehouse/category | Negative, Low, Expiring | min stock | transfer, count, adjust |
| Stock movements | date, product, qty, type, source, user | branch, warehouse, cost | product/date | product/source | Today, Adjustments, Transfers | none | export |
| Transfer requests | number, from, to, items, status, requested by, date | notes | number | status/destination | Waiting for me, Sent, Overdue | none | approve, receive, reject |
| Low stock | product, current, min, suggested qty, supplier | category, last sale | product | supplier/category | By supplier, Critical | suggested qty | create purchase draft |
| Expiry alerts | product, batch, qty, expiry date, warehouse | supplier, cost | product | urgency/warehouse | Expired, 7 days, 30 days | action note | discount, write off, transfer |
| Suppliers | name, phone, payable, last purchase | address, notes, branch | name | payable status | Payable, Overdue, Active | phone/tags | message/export |
| Purchases | invoice, supplier, total, paid, status, date | warehouse, user, notes | invoice/supplier | status/supplier | Unpaid, Recent, Returned | none | pay/export/print |
| Purchase details items | product, qty, unit cost, total, returned | warehouse, batch, expiry | product | none | none | return qty in return mode | return selected |
| Online orders | order no, customer, phone, channel, total, status, shipment | address, created by, branch | order/customer | status/channel | New, Ready, Problem, Shipped | status/notes | assign provider, status, ship |
| Delivery shipments | shipment, customer, provider, status, tracking, date | province, COD, attempt count | shipment/customer | status/provider | Delayed, Failed, Returned | notes | sync/cancel/export |
| Expenses | date, category, amount, cashbox, note | branch, created by, recurring | date/category | category/month | This month, Recurring, High value | category/note | export, convert recurring |
| Recurring expenses | name, amount, schedule, next date, active | end date, notes | name | active/category | Active, Due soon, Paused | amount/next date | activate/pause |
| Vouchers | number, type, party, amount, cashbox, date | source, notes, user | number/party | type/cashbox | Today, Receipts, Payments | notes | print/export |
| Cashbox ledger | date, source, in, out, balance, user | notes, branch | date/source | day/source | Today, By source | none | export |
| Treasury transfers | date, from, to, amount, status | notes, created by | date | status | This month, Cancelled | none | cancel/export |
| Accounting periods | period, dates, status, close readiness, closed by | notes, snapshot status | period | status/year | Current, Closed, Needs action | none | close/export |
| Chart of accounts | code, name, type, balance, active | parent, system flag | code/name | type/parent | Active, System, Inactive | name where safe | export |
| Journal entries | date, number, memo, debit, credit, status | source, user | number/date | status/source | Draft, Posted, Manual | draft lines | post/export |
| Posting failures | source, reason, date, amount, retry status | payload, stack, user | source | reason/module | Needs fix, Retried | none | retry selected |
| Users | name, role, branch, warehouse, active, last login | username, created | name | role/branch | Active, Inactive, Cashiers | branch/warehouse | deactivate/assign |
| Roles | role, users, permissions summary, active | raw permissions | role | template | System, Custom | task toggles | duplicate/export |
| Webhook logs | date, provider, event, status, order/shipment | payload | date/provider | status | Failed, Recent | none | retry/export |
| Financial reports | account, current, previous, variance | notes, formula | account | section | Owner, Accountant | none | export |
| Online commerce reports | channel, orders, revenue, returns, margin | branch, provider | channel | channel/status | Channel, Returns, Shipping | none | export |

## Report 6: Visual Design Audit

### Current Visual Risks

| Area | Risk | Recommendation |
| --- | --- | --- |
| Spacing | Dense screens likely mix card padding, table density, and form spacing | Adopt 4/8px spacing system with fixed page and panel rhythm. |
| Typography | Many headings/cards compete in dense screens | Define role: page title, section title, table label, metadata, numeric KPI. |
| Alignment | RTL screens need consistent right-edge alignment and numeric alignment | Right-align labels/text, align numeric columns by decimal edge, keep action columns left in RTL tables. |
| Visual hierarchy | Too many buttons/cards can equalize importance | One primary action, semantic secondary, quiet tertiary. |
| Icon consistency | MDI icons are available but may vary in metaphor | Create approved icon map per domain/action. |
| Button hierarchy | Row buttons can overload tables | Use row context menu and show only one inline primary action. |
| Card usage | Cards can become nested and noisy | Use cards for entity summaries and repeated items only; page sections should be bands/panels. |
| Borders/elevation | Too much elevation reduces professionalism | Prefer subtle borders and low elevation. Reserve shadows for overlays. |
| Corner radius | Inconsistent large radii can feel consumer-like | Use 8px default, 12px for overlays, 4px for table chips/inputs. |
| White space | Operational UI needs dense but breathable spacing | Use compact density for tables, comfortable density for forms. |
| Color palette | Purple-heavy UI can feel one-note | Use neutral base with semantic domain colors. |
| Contrast | Dense dark mode needs accessible contrast | Define text/line/surface contrast tokens. |
| Scanning speed | Too many equal cards slow scanning | Use status chips, grouped queues, sticky summaries, and visual anchors. |

### Design Language

Design direction: "Calm Arabic retail command center."

Attributes:

- Professional, not playful.
- Dense where users scan data.
- Spacious where users make decisions.
- Strong semantic color usage, restrained brand color.
- RTL-native, not mirrored LTR.
- Fast keyboard/scanner workflows.
- Clear financial/inventory status cues.

Visual hierarchy:

1. Context: role, branch, warehouse, date.
2. Current task: page title and primary action.
3. Operational summary: KPIs/alerts.
4. Work queue: table/lane/list.
5. Detail/action panel.
6. Secondary history/audit.

## Report 7: Design System Specification

### Typography

| Token | Size | Weight | Use |
| --- | ---: | ---: | --- |
| Display | 32 | 700 | Owner dashboard headline only. |
| H1 | 24 | 700 | Page title. |
| H2 | 20 | 700 | Major section. |
| H3 | 18 | 600 | Panel title. |
| Body | 14 | 400 | Normal UI text. |
| Body Strong | 14 | 600 | Labels, table primary text. |
| Meta | 12 | 400 | Subtitles, helper text. |
| Caption | 11 | 500 | Chips, badges, timestamps. |
| Numeric KPI | 24/28 | 700 | Metric cards. |

Rules:

- Arabic UI text uses a legible Arabic-first font.
- Numbers in tables use tabular numerals.
- No negative letter spacing.
- Do not use giant type inside dense panels.

### Spacing

| Token | Value | Use |
| --- | ---: | --- |
| 0 | 0 | reset |
| 1 | 4px | tight icon/text gap |
| 2 | 8px | control gap |
| 3 | 12px | compact card padding |
| 4 | 16px | default card/panel padding |
| 5 | 20px | form section gap |
| 6 | 24px | page section gap |
| 8 | 32px | major page rhythm |

### Layout Grid

- Desktop page max content: 1440px for admin/report pages; full width for POS.
- Form grid: 12 columns; fields usually 6/6, 4/4/4, or full-width.
- Table pages: header, toolbar, table, sticky footer.
- Split view: 35/65 or 40/60.
- Side panel width: 420px small, 560px standard, 720px complex.
- Full-screen wizard for accounting close, restore, opening balances, journal entry.

### Containers

| Container | Radius | Border | Elevation | Use |
| --- | ---: | --- | --- | --- |
| Page band | 0 | none | none | Main page zones. |
| Card | 8px | 1px neutral | none | Entity summary/repeated item. |
| Panel | 8px | 1px neutral | none | Side panel sections. |
| Overlay | 12px | none | medium | Dialogs/menus. |
| Table | 8px | 1px neutral | none | Data grid. |

### Buttons

| Type | Visual | Use |
| --- | --- | --- |
| Primary | filled semantic/primary | one per screen/panel. |
| Secondary | tonal/outlined | related supporting action. |
| Tertiary | text/icon | low emphasis. |
| Destructive | danger text or danger filled only in confirm | delete/cancel/void. |
| Icon | square 36-40px | toolbar row action. |
| FAB | one per mobile workspace | create/scan/add. |

### Inputs

- Label always visible.
- Helper text only for decision fields.
- Errors inline below field.
- Prefix/suffix for money and units.
- Autocomplete for customer/product/supplier/account.
- Segmented controls for small option sets.
- Toggles for on/off.
- Stepper/keypad for quantity and money in POS/warehouse.
- Date presets plus picker.

### Tables

- Sticky header.
- Compact density default for power users.
- Comfortable density available.
- Row height 44 compact, 56 comfortable.
- Selection checkbox only when bulk actions available.
- Right-aligned Arabic text, decimal-aligned numbers.
- Status column uses chips.
- Action column uses context menu plus one primary action.

### Status Chips

Use consistent shape:

- Radius 999px.
- Label + optional icon.
- Color by semantic state.
- No custom random chip colors outside token set.

### Empty States

Every empty state includes:

- Clear title.
- One-sentence explanation.
- Primary next action.
- Optional import/demo/sample action.

### Loading States

- Skeleton for page/table/card layouts.
- Progress notification for long tasks.
- Preserve stale data when refreshing.
- Use optimistic update for low-risk status changes.

### Charts

- Use semantic palette.
- Always include plain-language headline.
- Show comparison period.
- Show "what changed" and "why it matters".
- Click chart segment filters the table below.

### Motion

- 120ms hover.
- 160ms button press.
- 180ms side panel open.
- 220ms dialog open.
- 250ms page transitions max.
- No decorative motion in operational screens.

### Responsive Behavior

- Desktop: split views and dense tables.
- Tablet: POS/warehouse touch modes, side panel becomes full-height drawer.
- Phone: task queues/cards, scanner mode, bottom action bars.

### RTL Rules

- Primary reading starts top-right.
- Main actions align top-left only if consistent with app bar; otherwise sticky bottom/right in panels.
- Numeric columns use stable decimal alignment.
- Icons that imply direction must be mirrored where needed.
- Timeline flows top-to-bottom; document flows right-to-left.

## Report 8: Semantic Color System

### Base Palette

| Token | Hex | Use |
| --- | --- | --- |
| Brand Primary | `#2563EB` | primary actions, selected states |
| Brand Secondary | `#475569` | secondary UI |
| Surface | `#FFFFFF` | light surface |
| Surface Muted | `#F8FAFC` | page background |
| Surface Raised | `#FFFFFF` | cards/panels |
| Border | `#E2E8F0` | dividers |
| Text Strong | `#0F172A` | headings |
| Text Default | `#334155` | body |
| Text Muted | `#64748B` | metadata |
| Dark Surface | `#111827` | dark mode surface |
| Dark Raised | `#1F2937` | dark cards |
| Dark Border | `#374151` | dark borders |

### Semantic And Domain Colors

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Success | `#16A34A` | `#22C55E` | paid, completed, stock healthy |
| Warning | `#D97706` | `#F59E0B` | low stock, due soon, needs review |
| Danger | `#DC2626` | `#F87171` | errors, delete, overdue, loss |
| Info | `#0284C7` | `#38BDF8` | neutral system info |
| Sales | `#2563EB` | `#60A5FA` | sales/revenue |
| Profit | `#059669` | `#34D399` | profit/margin |
| Loss | `#DC2626` | `#F87171` | loss/negative margin |
| Expenses | `#EA580C` | `#FB923C` | expenses/outflow |
| Debt | `#B45309` | `#FBBF24` | customer debt/payables |
| Paid | `#16A34A` | `#22C55E` | paid/settled |
| Pending | `#7C3AED` | `#A78BFA` | waiting/processing |
| Cancelled | `#64748B` | `#94A3B8` | cancelled/inactive |
| Returned | `#BE123C` | `#FB7185` | returns/refunds |
| Inventory | `#0D9488` | `#2DD4BF` | stock/products |
| Warehouse | `#0891B2` | `#22D3EE` | warehouses/transfers |
| Shipping | `#4F46E5` | `#818CF8` | shipments/delivery |
| Online Orders | `#9333EA` | `#C084FC` | ecommerce/channel |
| Accounting | `#334155` | `#CBD5E1` | GL/accounting |
| Manager Approval | `#DB2777` | `#F472B6` | approval needed |
| Disabled | `#CBD5E1` | `#475569` | disabled |
| Read-only | `#E2E8F0` | `#374151` | read-only surfaces |
| Focus | `#2563EB` | `#60A5FA` | focus ring |
| Hover | `#EFF6FF` | `#1E3A8A` | hover |
| Pressed | `#DBEAFE` | `#1D4ED8` | pressed |
| Selection | `#BFDBFE` | `#1E40AF` | selected rows |

Rules:

- Do not use color alone; pair with label/icon.
- Reserve danger red for actual risk.
- Purple is only online orders/pending, not the whole app identity.
- Financial colors must be consistent: inflow/profit green, outflow/loss red/orange, debt amber.

## Report 9: Notification UX

### Notification Types

| Event | UX Pattern | Persistence |
| --- | --- | --- |
| Save success | Snackbar/toast | auto dismiss 3 sec |
| Save failure | Inline error + snackbar | persistent until fixed |
| Long task started | Progress notification | persistent while running |
| Backup complete | Snackbar + notification center item | auto + history |
| Backup overdue | Banner + notification center | persistent |
| Low stock | Badge/task inbox | persistent until resolved |
| Expiry alert | Task inbox grouped by urgency | persistent |
| Failed posting | Critical banner/accountant inbox | persistent |
| Delivery failure | Delivery exception inbox | persistent |
| New online order | Badge + queue item | persistent until processed |
| Permission denied | Inline explanation/request access | persistent on action |
| Update available | Non-blocking banner | dismissable |
| Critical update required | Dialog/banner | persistent |
| Restore/import progress | Full progress wizard | persistent |
| Manager approval needed | Approval request notification | persistent until approved/rejected |

### Priority Levels

| Level | Examples | UI |
| --- | --- | --- |
| Critical | restore failure, failed accounting close, backup failure | red persistent banner + inbox |
| High | low stock critical, failed shipment, overdue debt task | inbox + badge |
| Medium | due recurring expense, sync warning | notification center |
| Low | save success, export complete | snackbar |
| Background | report refreshed, sync complete | quiet notification history |

Grouping rules:

- Group repeated low stock by supplier/category.
- Group delivery failures by provider/status.
- Group accounting issues by cause.
- Group backup notifications into one backup health card.

## Report 10: Permission UX

### Permission States

| State | When To Use | UX |
| --- | --- | --- |
| Hide | User has no business reason to know feature exists | Cashier should not see GL setup. |
| Disable | User can see record but cannot perform action | Show disabled button with reason tooltip. |
| Read-only | User needs visibility but not control | Reports, invoices, audit records. |
| Request access | User reasonably may need action | "Request manager approval" or "Ask admin". |
| Manager approval | Action is allowed with override | Discount, return, delete, cash difference. |
| Temporary unlock | Time-limited override | Manager PIN unlocks one transaction. |
| Audit trail | Sensitive action | Require reason and show logged status. |

### Restricted Action UX

| Action | Recommended UX |
| --- | --- |
| Discount over limit | Show disabled/locked discount; manager approval inline. |
| Return/refund | Visible if user handles returns; requires approval above threshold. |
| Delete/cancel invoice | Hide for cashiers; manager/admin sees overflow with impact. |
| Close accounting period | Accountant/owner only; visible as read-only status to managers. |
| Restore backup | Admin only; hidden except backup center. |
| Change feature modules | Admin only; hidden from operations. |
| Edit product cost | Manager/inventory/accounting only; cashier read-only. |
| Stock adjustment | Warehouse/manager only; cashier hidden. |
| Pay supplier | Manager/accountant only; warehouse read-only. |
| View profit | Owner/manager/accountant; cashier hidden. |
| Change roles | Admin only; hidden. |

Every disabled action should explain:

- Why unavailable.
- Who can do it.
- What to do next.
- Option to request approval if appropriate.

## Report 11: Reporting UX

### Report Structure

Every report should use:

1. Plain-language headline.
2. Date/range context.
3. Key metrics.
4. Comparison with previous period.
5. Insight summary.
6. Warnings/anomalies.
7. Recommended next actions.
8. Charts.
9. Detail table.
10. Export/schedule/save.

### Report Redesigns

| Report | Add Insights | Add Warnings | Add Next Actions |
| --- | --- | --- | --- |
| Sales | best hour/day, average ticket, branch/cashier comparison | drop vs previous period, high returns | open low sales branch, message customers, review cashier |
| Profit | margin drivers, COGS movement, top profit products | products below margin, loss-making sales | update prices, inspect discounts |
| Top Products | top by quantity/revenue/profit | fast sellers near stockout, dead stock | reorder, promote, discount |
| Debts | overdue by customer/age, risk ranking | customers exceeding limit, aging worsening | collect, send statement, block debt sales |
| Cashbox | expected vs actual, inflows/outflows | cash difference, unusual manual vouchers | reconcile, review cashier, deposit |
| Expenses | category trend, recurring vs one-time | unusual expense, overspend | review category, create recurring rule |
| Financial | owner summary + accountant detail | imbalance, missing mappings | fix posting, close period |
| Inventory valuation | value by warehouse/category, aging | overstock, dead stock, negative stock | transfer, discount, count |
| Online commerce | channel performance, return rate | high return channel, unfulfilled orders | pause channel, fix provider |
| Shipping | provider success rate, delays | late/failed spike | reassign provider, contact customers |

### Role Summaries

| Role | Report Language |
| --- | --- |
| Owner | "You made X today, profit is up/down, these 3 things need attention." |
| Manager | "Branch A has low stock and high returns; approve these actions." |
| Accountant | "These postings failed; these periods are ready/not ready." |
| Warehouse | "These products need count/transfer/reorder." |

## Report 12: Owner Experience

### Owner Home Screen

Owner must answer in under 5 minutes:

| Question | UI Element |
| --- | --- |
| How much money today? | Today's cash/revenue card with previous-day comparison. |
| Profit today? | Profit card with margin and caveat if data incomplete. |
| Profit this month? | Month profit trend card. |
| Who owes me? | Top debtors card with collect/message action. |
| Who do I owe? | Supplier payables card. |
| What products are running out? | Low-stock risk card grouped by supplier. |
| What needs my attention? | Critical task inbox. |
| What mistakes happened? | Exceptions card: returns, voids, failed postings, cash differences. |
| Which employee performed best? | Staff performance scorecard. |
| Which branch is underperforming? | Branch comparison card. |
| What should I do today? | AI/simple rule-based recommendation list. |

### Owner Layout

```text
Header: Business name, date range, branch selector, export summary

Row 1: Cash Today | Profit Today | Month Profit | Debt Risk
Row 2: Attention Inbox | Low Stock Risk | Branch Performance
Row 3: Sales Trend | Top Products | Staff Performance
Right Rail: What should I do today?
Bottom: Scheduled reports and last backup health
```

Owner interaction rules:

- No raw accounting terms by default.
- Show "explain this" on every metric.
- Every problem card has an action.
- Owner can switch to accountant detail, but it is not default.

## Report 13: Micro-Interactions

| Interaction | Specification |
| --- | --- |
| Hover | Surface color changes subtly; show tooltip for icon-only actions after 500ms. |
| Click | Button depresses 80-120ms; prevent duplicate submits. |
| Focus | 2px focus ring using focus token; visible in dark/light mode. |
| Success | Inline check + snackbar; keep user in context. |
| Error | Field-level message, scroll/focus first invalid field, summary only for long forms. |
| Loading | Skeleton where layout is known; spinner only inside small buttons. |
| Saving | Button shows saving state; form footer shows "saving..." then "saved". |
| Undo | Snackbar with undo for non-financial edits, filters, dismissals. |
| Delete | Impact preview; type/confirm only for high-risk records. |
| Restore | Full progress with phases and no ambiguous spinner. |
| Drag | Highlight valid drop zones; ghost preview. |
| Drop | Confirm placement visually; show undo if safe. |
| Scan | Audible/visual success; duplicate scan increments qty; error tone for unknown barcode. |
| Search | Debounced results, keyboard highlight, recent searches before typing. |
| Selection | Row selected state; bulk toolbar slides in. |
| Completion | Task disappears from active queue and appears in done/recent. |
| Side panel open | Slide from left in RTL context where actions live; preserve table behind. |
| Table row expand | Smooth 160ms height transition; no layout jump. |
| Payment complete | Strong success state, receipt action, next sale focus. |
| Return complete | Show refund/stock/debt impact summary. |

## Report 14: Onboarding Experience

### Guided Setup

```text
Step 1: Owner account
Step 2: Company and currency
Step 3: Business mode/modules
Step 4: Branches and warehouses
Step 5: Cashboxes and printers
Step 6: Products import or first product
Step 7: Customers/suppliers import optional
Step 8: Users and roles
Step 9: Backup schedule and restore test
Step 10: First sale practice
```

### Interactive Tours

| Role | Tutorial |
| --- | --- |
| Cashier | first sale, return, collect debt, reprint receipt |
| Manager | daily dashboard, approve return, check low stock, end-of-day |
| Warehouse | receive stock, transfer, count, expiry handling |
| Accountant | expense, voucher, close period, repair posting |
| Owner | owner dashboard, reports, debt, branch comparison |
| Admin | users, roles, modules, backup, support |

### Coach Marks

Use coach marks only on first use:

- Command palette.
- Branch/warehouse context.
- POS scan field.
- Table saved views.
- Bulk selection.
- Side panel action area.
- Backup health card.

### Practice Mode

- Demo data.
- Resettable tasks.
- Progress checklist.
- No real financial impact.
- Completion badges are optional and should be subtle.

### Context Help

- "Why this matters" for accounting/backup/restore.
- "Recommended" tags for setup choices.
- "Ask manager" for permission locks.
- "Common mistake" hints on dangerous fields.

## Report 15: Usability Analysis

| Principle | Current Risk | Redesign Application |
| --- | --- | --- |
| Jakob's Law | Users expect POS/ERP patterns from Square/Odoo/Shopify/Business Central | Use familiar POS grid/cart/payment, ERP work queues, report dashboards. |
| Hick's Law | Too many visible choices slow decisions | One primary action, role dashboards, progressive disclosure. |
| Fitts's Law | Frequent actions may be small or far from task focus | Sticky payment buttons, large scan/touch targets, row action menus near row. |
| Miller's Law | Too many groups/buttons/fields exceed memory | 5-7 actions per workspace; collapse advanced settings. |
| Tesler's Law | ERP complexity cannot disappear entirely | Move complexity into guided wizards and expert modes. |
| Aesthetic Usability Effect | Cleaner UI will feel easier and more trustworthy | Calm spacing, consistent tokens, semantic colors. |
| Progressive Disclosure | Advanced options are visible too early | Hide advanced fields, modes, and settings until needed. |
| Recognition Over Recall | Users must remember where features live | Command palette, saved views, role dashboards, recent records. |
| Error Prevention | Wrong branch/product/customer/payment causes real damage | Context defaults, live duplicate detection, impact previews. |
| Consistency | Different screens use different action layouts | Unified table/form/dialog/action patterns. |
| Feedback | Long tasks and saves need clearer status | Progress notifications, optimistic updates, inline save state. |
| Visibility Of System Status | Backup, sync, printer, accounting period status should be visible | Status cards/banners in role dashboards. |

## Report 16: HCI Analysis

### Mouse Travel

Current risk:

- Dense tables and far-away row actions cause cursor travel.
- POS product selection and payment may be far apart.
- Filters at top and actions in row/footer create repeated movement.

Redesign:

- Keep primary action in sticky footer/right rail.
- Put row context menu on row hover/keyboard.
- Use side panels so pointer stays near selected row.
- POS: product/cart/payment zones in stable positions.

### Eye Movement

Current risk:

- Users scan page title, filters, table, cards, buttons, and dialogs with no fixed rhythm.

Redesign reading path:

```text
Top-right: page context
Top-left/toolbar: primary action
Below header: summary/status
Main: work queue/table
Side: selected record/action panel
Bottom: sticky totals/save
```

### Target Size

- Minimum desktop button target: 36px.
- Frequent POS/touch target: 56px.
- Mobile target: 48px minimum.
- Table row action menu: 36px icon with tooltip.
- Scanner workflows: do not require tiny controls.

### Decision Fatigue

Reduce decisions by:

- Smart defaults.
- Role-based views.
- Recommended actions.
- Saved filters.
- Templates.
- Segmented controls instead of long dropdowns.
- Hide rare actions in overflow.

### Cognitive Friction

High-friction screens:

1. POS.
2. Product form.
3. Online orders.
4. Customer profile.
5. Sale details.
6. Purchase details.
7. Accounting periods.
8. Users/roles.
9. Financial reports.

For each, use:

- Clear next action.
- Summary first.
- Details second.
- History last.
- Advanced controls hidden.

## Report 17: Information Architecture

### New Top-Level IA

```text
My Work
  Dashboard
  Tasks
  Recent
  Favorites

Sales
  POS
  Invoices
  Returns
  Collections

Customers
  Customers
  Debtors
  Messages

Catalog & Inventory
  Products
  Stock
  Receive/Transfer/Count
  Low Stock
  Expiry

Purchasing
  Purchases
  Suppliers
  Payables

Online & Delivery
  Orders
  Shipments
  Delivery Exceptions
  Channels

Finance
  Expenses
  Cashboxes
  Vouchers
  Bank
  Period Close

Reports
  Owner Summary
  Sales
  Profit
  Debt
  Inventory
  Financial

Admin
  Setup
  Users
  Roles
  Branches/Warehouses
  Modules
  Integrations
  Backup
  Support
```

### Entity Relationships In UI

Every major entity page should expose related documents:

| Entity | Related UI |
| --- | --- |
| Customer | invoices, payments, returns, messages, debt, notes |
| Product | stock, movements, purchases, sales, price history, suppliers |
| Supplier | purchases, returns, payments, payable, products |
| Sale | customer, items, payments, returns, cashbox, accounting entry |
| Purchase | supplier, items, payments, returns, stock entries |
| Online order | customer, channel, sale, shipment, payment |
| Shipment | order, customer, provider, tracking events |
| Cashbox | vouchers, payments, expenses, transfers, ledger |
| Accounting period | documents, postings, reports, close checklist |

### Discoverability Rules

- Anything daily appears in My Work or role dashboard.
- Anything rare appears in Admin/Settings.
- Anything diagnostic appears in Support.
- Every entity can be found via command palette.
- Every table has saved views.
- Every hidden feature is discoverable through settings search if user has permission.

## Report 18: Screen Mockup Specifications

### POS Screen

```text
Top Bar:
  Branch/Warehouse | Cashier | Printer | Period status | Manager mode

Left Panel:
  Search/barcode field
  Category chips
  Product grid/list
  Recent/pinned products

Center Panel:
  Cart lines
  Inline qty/discount/note
  Empty cart scan prompt

Right Panel:
  Customer selector
  Debt/credit summary if selected
  Payment mode
  Totals
  Exact cash / partial / debt

Sticky Footer:
  Total | Complete sale | Print behavior
```

### Product Form

```text
Header:
  Product new/edit | Save | Save and add another

Step 1:
  Product template cards

Step 2:
  Barcode | Name | Category | Unit

Step 3:
  Cost | Price | Margin preview

Step 4:
  Inventory section if physical product
  Warehouse | Opening qty | Min stock | Expiry optional

Step 5:
  Review warnings

Right Rail:
  Duplicate warnings
  Similar products
  Suggested values
```

### Online Orders

```text
Header:
  Orders | New order | Import/sync | Saved views

Toolbar:
  Search phone/order | Status chips | Channel | Date

Main:
  Kanban lanes or table toggle
  New / Confirmed / Ready / Shipped / Problem / Returned

Side Panel:
  Customer card
  Items
  Stock readiness
  Shipment status
  Next action
  Timeline
```

### Customer Profile

```text
Header:
  Customer name | phone | debt | risk | WhatsApp | Collect | Edit

Left/Main:
  Timeline of sales/payments/returns/messages/notes

Right:
  Customer facts
  Debt summary
  Recommended next action

Tabs:
  Invoices | Payments | Installments | Notes | Audit
```

### Inventory Workspace

```text
Header:
  Warehouse context | Scan/search | Adjust | Transfer | Count

Summary:
  Total SKUs | Low stock | Expiring | Negative | Value

Main:
  Stock table with saved views

Side Panel:
  Selected product stock by warehouse
  Quick actions
  Recent movements
```

### Purchase Receiving

```text
Header:
  New purchase/receive stock | Supplier | Warehouse

Left:
  Supplier and invoice info

Center:
  Scan/add product lines
  Previous cost and margin impact

Right:
  Totals
  Payment state
  Pay now / credit

Footer:
  Save draft | Receive stock | Print
```

### Accounting Close

```text
Header:
  Current period | Date range | readiness status

Checklist:
  Sales posted
  Cashboxes reconciled
  Expenses reviewed
  Failed postings fixed
  Backup complete
  Reports previewed

Main:
  Blockers grouped by type with direct fix links

Footer:
  Preview close report | Close period
```

### Owner Dashboard

```text
Header:
  Business | date range | branch selector | export/send summary

KPI Row:
  Cash today | Profit today | Month profit | Debts | Payables

Attention:
  Critical tasks and mistakes

Performance:
  Branches | Employees | Top products | Low-stock risk

Right Rail:
  What should I do today?
```

### Settings Home

```text
Header:
  Settings | Search settings

Cards:
  Business info
  Sales and POS
  Inventory
  Finance
  Users and roles
  Integrations
  Backup and restore
  License and support

Each card:
  Status | last changed | open
```

## Report 19: Complete Product Redesign: NuqtaPlus 2.0

### Version 2 Philosophy

NuqtaPlus 2.0 should not feel like many modules connected by a sidebar. It should feel like a role-aware operating system for a retail business.

Core idea:

```text
Every user starts in "My Work".
Every record has a timeline and next actions.
Every table is a queue or saved view.
Every form asks only what is missing.
Every report explains what happened and what to do.
```

### New Navigation

- My Work
- Sales
- Customers
- Inventory
- Purchasing
- Online & Delivery
- Finance
- Reports
- Admin

Navigation features:

- Favorites.
- Recent screens.
- Recent records.
- Command palette.
- Role mode switch for authorized users.
- Search settings from anywhere.

### New Layout System

Use four page types:

1. Workspace page: dashboard/task queue.
2. Table page: saved views + data grid + side panel.
3. Detail page: summary header + timeline + action rail.
4. Wizard page: high-risk/multi-step workflow.

### New Workflows

| Workflow | Version 2 Pattern |
| --- | --- |
| Sell | POS scanner-first workspace. |
| Return | Invoice scan -> return side panel. |
| Collect debt | Debt queue -> payment side panel. |
| Add product | Template wizard. |
| Receive stock | Scanner receiving workspace. |
| Transfer stock | Transfer wizard and inbox. |
| Online order | Status lanes + side panel. |
| Ship order | Order side panel prefilled shipment. |
| Pay supplier | Payables queue -> payment panel. |
| Expense | Quick expense side panel. |
| Close period | Full checklist wizard. |
| Backup | Backup health center. |
| Admin setup | Guided setup checklist. |

### New Dashboard

Dashboards are not pages with widgets. They are role command centers:

- Cashier: sell/return/collect/reprint.
- Manager: exceptions/approvals/performance.
- Warehouse: receive/transfer/count/expiry.
- Accountant: close/reconcile/fix/export.
- Owner: cash/profit/debt/attention/recommendations.
- Admin: setup/users/backup/integrations/support.

### New Forms

Forms become:

- Quick side panels for small tasks.
- Steppers for multi-step setup.
- Full-screen editors for financial/accounting risk.
- Inline editors for safe table fields.
- Autocomplete-first for entities.
- Defaults and templates everywhere.

### New Reports

Reports become answer pages:

```text
Headline: What happened?
Context: Compared to what?
Warning: What is wrong?
Reason: Why likely happened?
Action: What should I do?
Evidence: Chart/table details
Export/Schedule: Share it
```

### New Interactions

- Ctrl+K executes commands.
- Scan always works in POS/warehouse/product search.
- Row click opens side panel.
- Right-click row shows context menu.
- Bulk toolbar appears only when rows selected.
- Saved views reduce repeated filters.
- Undo available for safe operations.
- Approval flow replaces hard dead ends.

### New Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+K | Command palette |
| F2 | POS |
| F3 | Product search |
| F4 | Customer search |
| F5 | Refresh |
| F6 | Collect payment |
| F7 | Add expense |
| F8 | Complete payment |
| F9 | Print/reprint |
| Ctrl+N | New record |
| Ctrl+S | Save |
| Ctrl+Enter | Save and close |
| / | Focus table search |

### Implementation Difficulty Summary

| Redesign Area | Difficulty | Business Impact | UX Impact |
| --- | --- | --- | --- |
| Design tokens/color system | Medium | Medium | High |
| Unified table shell | Hard | High | High |
| Side panel framework | Medium/Hard | High | High |
| Command palette actions | Medium | High | High |
| Role dashboards | Hard | High | Critical |
| POS cashier mode | Hard | Critical | Critical |
| Product template wizard | Medium/Hard | High | High |
| Online order lanes | Hard | High | High |
| Accounting close wizard | Hard | High | High |
| Owner dashboard | Medium/Hard | High | High |
| Onboarding/practice mode | Medium/Hard | Medium/High | High |

## Final Redesign Priority

Do these first:

1. Define design tokens, color system, and component rules.
2. Build reusable side panel and table shell patterns.
3. Redesign POS cashier mode.
4. Redesign product form as template wizard.
5. Redesign online orders as status lanes plus side panel.
6. Redesign owner dashboard.
7. Redesign accounting close as checklist wizard.
8. Add command palette actions.
9. Add onboarding/practice mode.

This sequence changes the feel of the product fastest while creating reusable UI foundations for the rest of the application.
