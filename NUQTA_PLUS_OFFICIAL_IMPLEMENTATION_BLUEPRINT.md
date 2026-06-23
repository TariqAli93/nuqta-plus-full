# Nuqta Plus Official Product Specification And Implementation Blueprint

Version: 1.0  
Date: 2026-06-23  
Scope: Functional product specification, implementation contract, operational readiness, QA plan, and future extensibility blueprint for Nuqta Plus.

This document is the handover-grade product specification for continuing development without requiring the original developers. It intentionally avoids repeating engineering audit, architecture audit, security audit, business rules audit, database audit, UX audit, performance audit, deployment audit, or strategic roadmap findings. It defines what the product must do, how its behavior is contracted, and how future teams should verify and extend it.

## 1. Complete Functional Specification

### 1.1 Product Scope

Nuqta Plus is a multi-branch retail, inventory, treasury, accounting, purchasing, installment, delivery, online-order, reporting, notification, and backup system. It supports Arabic-first operational workflows for stores that need product stock control, customer debt tracking, supplier purchasing, cash and bank movements, accounting periods, delivery integrations, role-based permissions, and recoverable business records.

### 1.2 User Roles And Permission Model

| Role class | Purpose | Typical permissions |
|---|---|---|
| System owner | Owns initial setup, global configuration, license, backup, reset, and role design. | Full access to all modules and branches. |
| Admin | Operates all business modules and manages users, roles, reports, settings, branches, warehouses, accounting, and treasury. | Broad business access except destructive platform actions when restricted. |
| Branch manager | Runs branch-level sales, purchases, treasury, warehouse, reports, customers, and staff activity. | Scoped to assigned branch and warehouses unless granted cross-branch permissions. |
| Cashier | Creates sales, payments, returns, customer lookup, and cashbox activity. | Sales and payment permissions, usually no configuration or accounting edits. |
| Inventory operator | Maintains products, stock, adjustments, warehouse transfer requests, and stock reports. | Product and inventory permissions scoped by warehouse. |
| Accountant | Owns accounting periods, vouchers, GL accounts, journal entries, supplier debt, treasury reconciliation, and financial reports. | Financial permissions, branch scope as configured. |
| Delivery operator | Creates, syncs, cancels, labels, and reviews shipments. | Delivery provider and shipment permissions. |
| Online commerce operator | Receives, edits, converts, and returns online orders. | Online order and sales channel permissions. |
| Auditor | Reviews audit logs, reports, and immutable business records. | Read-only permissions plus export where authorized. |

All protected actions must check: authenticated session, active user, assigned branch or warehouse scope when applicable, role permissions, object ownership/scope, accounting-period status, and destructive-action privilege where applicable.

### 1.3 Global Functional Rules

| Rule ID | Rule |
|---|---|
| GF-001 | Every financial or inventory-changing operation must be attributable to a user and timestamp. |
| GF-002 | Business documents use generated sequence numbers scoped by document type, branch, and year where applicable. |
| GF-003 | A closed accounting period blocks new operational changes inside that period unless a controlled reversal or correction process exists. |
| GF-004 | Soft-deleted or inactive reference records must not be used for new transactions but remain available for historical reads. |
| GF-005 | Amounts, currencies, exchange rates, rounding, and payment status must be calculated consistently across sales, purchases, vouchers, and reports. |
| GF-006 | Stock cannot silently go negative unless an explicit future business decision enables negative inventory with audit controls. |
| GF-007 | Idempotent write APIs must return the stored first response for duplicate idempotency keys in the same scope. |
| GF-008 | Audit logs must capture create, update, delete, cancellation, restoration, approval, rejection, payment, return, backup, restore, and permission-sensitive operations. |
| GF-009 | External delivery and notification integrations must store provider request and response logs without exposing secrets. |
| GF-010 | Reports must state the filters and timestamp used so exported files can be reconciled later. |

### 1.4 Feature Specification Matrix

Each feature below includes purpose, user story, business goal, requirements, preconditions, workflow, success state, failure handling, edge cases, validation, rules, permissions, dependencies, and related features.

#### Platform, Setup, Auth, And Configuration

| Feature | Specification |
|---|---|
| Initial setup and first user | Purpose: bootstrap a new installation. User story: as the owner, I create the first administrative user and confirm the system can operate. Business goal: prevent unusable deployments and unsecured defaults. Requirements: expose setup status, diagnostics, first-user creation, company defaults, base currency, initial permissions, default branch and warehouse where needed. Preconditions: database reachable, no existing active admin for first-user flow. Workflow: check setup status -> create first user -> seed roles and permissions -> confirm profile and company settings -> enter app. Success: active admin exists and setup is complete. Failure: duplicate first user, invalid password, missing seed data, database migration issue. Edge cases: interrupted setup, partially seeded permissions, duplicate username, inactive first user. Validation: username unique, password policy, required full name, base currency valid. Rules: GF-001, GF-008. Permissions: unauthenticated only for setup status and first-user when no admin exists; authenticated admin afterward. Dependencies: users, roles, permissions, settings, branches, warehouses. Related: RBAC, settings, audit. |
| Authentication and session management | Purpose: secure user access. User story: as a staff user, I log in and continue work under my assigned permissions. Business goal: accountable operations and data protection. Requirements: login, logout, profile, session check, password change, active-user enforcement. Preconditions: active user exists and credentials are valid. Workflow: submit credentials -> verify password -> issue session/token -> load profile and permissions -> operate. Success: authenticated requests include user identity and scope. Failure: invalid credentials, inactive user, expired session, password mismatch. Edge cases: user deactivated mid-session, branch removed, role changed while active. Validation: username/password required, password change requires current password and confirmation. Rules: GF-001, GF-008. Permissions: profile/session require login; password change requires self or admin reset. Dependencies: users, roles, userBranches. Related: RBAC, audit. |
| User management | Purpose: create and maintain staff accounts. User story: as an admin, I add users and assign them branch, warehouse, and role access. Business goal: controlled delegation. Requirements: list, create, update, detail, reset password, delete/deactivate, first-user check. Preconditions: admin permission and available roles/scopes. Workflow: admin enters user details -> assigns role and scope -> saves -> user can log in. Success: user appears in list and permission checks reflect assignments. Failure: duplicate username, invalid role, invalid branch, password reset conflict. Edge cases: deleting current user, deactivating last admin, user assigned to inactive branch. Validation: username unique, role required, active branch/warehouse ids, phone optional format. Rules: cannot remove last effective admin without recovery path. Permissions: user.manage, user.view, user.reset_password, user.delete. Dependencies: users, branches, warehouses, roles, audit. Related: auth, RBAC, branches. |
| RBAC roles and permissions | Purpose: govern module access. User story: as an owner, I define roles matching staff responsibility. Business goal: reduce operational risk and fraud. Requirements: list permissions, list roles, detail role, create/update/delete role, assign permissions, protect system roles. Preconditions: authenticated admin with RBAC permissions. Workflow: review permissions -> create role -> select permissions -> assign to users. Success: access checks reflect role permissions immediately or on next session refresh. Failure: deleting assigned role, removing all admin rights, invalid permission key. Edge cases: allPermissions system role, role scope mismatch, stale session permission cache. Validation: unique role code, active permissions only, protected system roles immutable where marked. Rules: permission changes audited. Permissions: rbac.manage. Dependencies: roles, permissions, rolePermissions, users. Related: auth, user management, audit. |
| Company, settings, and feature flags | Purpose: configure business identity and optional modules. User story: as an admin, I configure company info, app mode, feature switches, and operational settings. Business goal: adapt the product to different businesses without code changes. Requirements: get/set settings, company settings, currency settings, bulk update, feature flag setup, app-mode update. Preconditions: admin access. Workflow: retrieve current settings -> edit -> validate -> persist -> affected modules reload configuration. Success: settings persist and appear in UI/API responses. Failure: invalid JSON value, unsupported key, locked key, feature dependency missing. Edge cases: settings reset, concurrent updates, disabled module with existing data. Validation: key format, value type, required fields per setting. Rules: sensitive settings must be encrypted or masked. Permissions: settings.view, settings.manage, feature_flags.manage. Dependencies: settings, feature flags, currency_settings. Related: currency, notifications, delivery providers, backup. |
| Currency management | Purpose: support base and foreign currency operations. User story: as an accountant, I maintain exchange rates and active currencies. Business goal: accurate pricing, debt, and reporting for multi-currency stores. Requirements: list currencies, active/base lookup, update currency, update exchange rate. Preconditions: active base currency exists. Workflow: choose currency -> update rate/status -> use in sales, purchases, payments, reports. Success: exchange rate stored and new documents use the current rate. Failure: base currency disabled, zero/negative exchange rate, invalid code. Edge cases: historical documents after rate change, currency deactivation while balances exist. Validation: ISO-like code, rate positive, one base currency. Rules: existing transactions keep their document exchange rate. Permissions: currency.view, currency.manage. Dependencies: currency_settings, sales, purchases, payments, vouchers. Related: settings, reports. |
| Audit log | Purpose: preserve operational accountability. User story: as an auditor, I review who performed sensitive operations and when. Business goal: fraud detection, compliance, and incident investigation. Requirements: list logs, filter actions, purge under controlled permission. Preconditions: audit logging enabled and database available. Workflow: user action occurs -> audit record stored -> auditor filters by user/action/resource/date. Success: complete trace for sensitive actions. Failure: log write fails, purge unauthorized, malformed filter. Edge cases: huge log volume, deleted users, restored backups. Validation: valid date ranges, action names, resource ids. Rules: purge must be restricted and itself audited. Permissions: audit.view, audit.purge. Dependencies: audit_log, users. Related: all modules. |
| License and activation | Purpose: control entitlement and installation validity. User story: as the owner, I activate and maintain a valid installation. Business goal: commercial control and predictable support. Requirements: license status, activation data, expiration/grace handling, feature entitlement, offline tolerance policy. Preconditions: installation id and license key where required. Workflow: enter license -> validate locally or remotely -> store signed entitlement -> enforce status. Success: licensed features available. Failure: invalid key, expired license, clock drift, activation server unavailable. Edge cases: offline grace, machine replacement, backup restore to new machine. Validation: signed license, installation binding, expiration date. Rules: read-only grace should avoid data loss. Permissions: owner/admin license.manage. Dependencies: settings, remote access optionally. Related: backup, feature flags. |

#### Organization, Inventory, And Catalog

| Feature | Specification |
|---|---|
| Branch management | Purpose: represent business locations. User story: as an admin, I create branches and assign warehouses and users. Business goal: branch-level stock, sales, accounting, and reports. Requirements: list/detail/create/update/delete branch, active warehouse lookup. Preconditions: admin permission. Workflow: create branch -> assign default warehouse -> assign users -> transact. Success: branch is selectable for scoped operations. Failure: delete branch with transactions, missing default warehouse, duplicate name. Edge cases: inactive branch, branch without active warehouse, reassignment after sales. Validation: name required, default warehouse belongs to branch. Rules: historical branch records stay readable. Permissions: branch.view, branch.manage. Dependencies: branches, warehouses, users, sales, purchases, accounting periods. Related: warehouses, users, reports. |
| Warehouse management | Purpose: manage physical inventory locations. User story: as an inventory manager, I create warehouses and move stock between them. Business goal: accurate stock visibility and transfer control. Requirements: list, detail, create, update, delete, ensure default, list transfer targets. Preconditions: branch exists. Workflow: create warehouse -> stock products -> transfer/adjust -> report. Success: warehouse can hold stock and receive movements. Failure: delete warehouse with stock, invalid branch, missing default. Edge cases: default warehouse deletion, inactive warehouse with pending transfer. Validation: unique name per branch, active branch, cannot delete with open transfer. Rules: warehouse scope enforced. Permissions: warehouse.view, warehouse.manage. Dependencies: warehouses, branches, product_stock, transfers. Related: inventory, products, sales, purchases. |
| Category management | Purpose: classify products. User story: as a catalog manager, I organize products by category. Business goal: searchable product catalog and reporting segmentation. Requirements: list/detail/create/update/delete category. Preconditions: authenticated permission. Workflow: create category -> assign products -> use in sales and reports. Success: products can reference active category. Failure: duplicate name, delete category in use. Edge cases: inactive category, uncategorized product. Validation: name required and unique enough for UI. Rules: in-use categories should be deactivated rather than hard-deleted. Permissions: category.view, category.manage. Dependencies: categories, products. Related: products, reports. |
| Product and unit management | Purpose: maintain sellable and purchasable items. User story: as a catalog manager, I create products with prices, stock rules, barcodes, and units. Business goal: reliable POS, purchasing, inventory valuation, and margin reporting. Requirements: create/list/detail/update/delete product, low-stock query, SKU/barcode lookup, units with conversion factors, cost and selling price. Preconditions: category and currency active where used. Workflow: enter product -> define unit(s) -> set min stock and prices -> transact. Success: product appears in sales, purchases, inventory, and reports. Failure: duplicate SKU/barcode, invalid price, invalid unit conversion, delete product with history. Edge cases: product without barcode, service/non-stock product, multiple units, inactive product in historical sale. Validation: non-negative prices, positive conversion factor, unique SKU/barcode when present. Rules: product history immutable in sale items through denormalized name/price fields. Permissions: product.view, product.manage. Dependencies: products, product_units, categories, currency_settings. Related: inventory, sales, purchases. |
| Stock availability and inventory balances | Purpose: show current stock by warehouse and product. User story: as staff, I know whether an item is available before selling or transferring it. Business goal: prevent overselling and lost inventory. Requirements: warehouse stock, low stock, product totals, product warehouse detail, movement history, expiry alerts. Preconditions: products and warehouses exist. Workflow: query stock -> inspect movements -> act on low or expiring stock. Success: stock equals sum of entries and movements. Failure: missing stock row, negative quantity, stale calculated stock. Edge cases: concurrent sale and transfer, return into stock, expired stock entries. Validation: valid product and warehouse ids, date filters. Rules: FIFO/stock-entry consumption must remain reconcilable. Permissions: inventory.view. Dependencies: product_stock, product_stock_entries, stock_movements. Related: sales, purchases, returns, transfers. |
| Stock adjustments | Purpose: correct inventory discrepancies. User story: as an inventory operator, I adjust stock after counting. Business goal: keep system inventory aligned with physical stock. Requirements: create adjustment with reason, quantity change, warehouse/product, audit. Preconditions: open accounting period if adjustment affects accounting; active product and warehouse. Workflow: count item -> submit adjustment -> stock row and movement created -> optional GL posting. Success: stock quantity updated and movement logged. Failure: adjustment would make stock negative, invalid reason, period closed. Edge cases: zero adjustment, batch/expiry stock entry adjustment, concurrent movement. Validation: non-zero quantity, reason required, active product/warehouse. Rules: adjustments always audited. Permissions: inventory.adjust. Dependencies: product_stock, stock_movements, accounting period. Related: GL, audit, reports. |
| Warehouse transfer | Purpose: move stock between warehouses with approval control. User story: as a warehouse user, I request transfer and a manager approves or rejects it. Business goal: controlled inter-location stock movement. Requirements: create/list/detail transfer, approve, reject, transfer-target lookup. Preconditions: source and target warehouses active, source stock available, requester authorized. Workflow: request transfer -> reserve or validate stock -> manager approves/rejects -> stock movements posted. Success: approved transfer decreases source and increases target; rejected transfer leaves stock unchanged. Failure: insufficient stock, same warehouse, inactive target, closed period. Edge cases: stock changed before approval, partial approval not supported unless added later, branch scope mismatch. Validation: quantity positive, different warehouses, active product. Rules: only pending transfers can be approved/rejected. Permissions: transfer.request, transfer.approve, transfer.reject, transfer.view. Dependencies: warehouse_transfers, stock_movements, product_stock. Related: inventory, branches, audit. |

#### Customers, Sales, Debt, And Collections

| Feature | Specification |
|---|---|
| Customer management | Purpose: maintain customer identity and contact/debt context. User story: as a cashier, I search or create a customer before credit or installment sales. Business goal: accurate receivables and service history. Requirements: create/list/detail/profile/update/delete, credit lookup, debt aging, credit score. Preconditions: permission and valid phone/name data. Workflow: create/update customer -> transact -> profile aggregates sales, payments, debts. Success: customer profile and debt values match transactions. Failure: duplicate normalized phone, invalid credit limit, delete customer with active debt. Edge cases: walk-in cash customer, multiple customers sharing phone, inactive customer historical visibility. Validation: name required, phone normalization, non-negative credit limit. Rules: debt totals derived from sales/installments/payments where possible. Permissions: customer.view, customer.manage, customer.delete, customer.credit.view. Dependencies: customers, sales, payments, installments, credit events/snapshots. Related: sales, collections, notifications. |
| Customer credit and scoring | Purpose: assess credit risk before installment or debt sales. User story: as a seller, I check whether a customer can take another installment. Business goal: reduce default risk and improve collections. Requirements: recalculate credit, get credit score, check installment eligibility, aging report. Preconditions: customer exists, scoring inputs available. Workflow: request credit check -> evaluate debt, payment history, overdue days, credit limit -> return risk and decision. Success: staff receives allow/warn/block recommendation. Failure: missing customer, stale score, scoring job failure. Edge cases: new customer with no history, paid but unreconciled installment, manual override. Validation: sale amount positive, customer active. Rules: high-risk decisions need permissioned override if implemented. Permissions: customer.credit.view, customer.credit.recalculate, sale.credit_override. Dependencies: creditEvents, creditSnapshots, creditScores, installments. Related: sales, collections, notifications. |
| Sale creation | Purpose: create invoices for cash, debt, and installment sales. User story: as a cashier, I sell products from a warehouse and collect payment. Business goal: record revenue, update stock, create receivables, and support receipts. Requirements: create sale with items, customer, branch, warehouse, discount, payment, currency, sale type, installments when needed. Preconditions: user can sell in branch/warehouse; products active; stock available; period open; currency valid. Workflow: build cart -> validate stock/prices/customer -> submit -> generate invoice number -> create sale/items/payments/installments -> consume stock entries -> post GL/audit. Success: sale status active/completed, stock reduced, payment/debt recorded. Failure: insufficient stock, invalid customer, closed period, payment mismatch, idempotency conflict. Edge cases: mixed units, foreign currency, zero discount, draft completion, service products, concurrent stock consumption. Validation: item quantity positive, price non-negative, total math, paid amount not above total unless allowed. Rules: invoice numbers immutable; sale items denormalize product data. Permissions: sale.create. Dependencies: sales, sale_items, payments, installments, product_stock_entries, accounting periods. Related: customers, inventory, GL, reports. |
| Sale listing, detail, and analytics | Purpose: review sales and performance. User story: as a manager, I inspect invoices, reports, and top products. Business goal: operational visibility and reconciliation. Requirements: list/filter sales, detail sale, report, top-products, exchange conversion endpoints. Preconditions: read permission and branch scope. Workflow: set filters -> retrieve sales/report -> export if needed. Success: filtered data matches records. Failure: invalid filter, unauthorized branch, huge export. Edge cases: canceled/restored sales, returns, multi-currency totals. Validation: date range, branch/customer/product ids, pagination. Rules: reports include canceled/returned handling explicitly. Permissions: sale.view, report.sales.view. Dependencies: sales, sale_items, payments, returns. Related: reports, products, customers. |
| Sale drafts | Purpose: save incomplete sale carts. User story: as a cashier, I hold a cart and finish it later. Business goal: faster counter operations and fewer lost carts. Requirements: create draft, complete draft, delete old drafts. Preconditions: active user and cart data. Workflow: save draft -> retrieve/complete -> final validation at completion. Success: draft becomes sale or remains draft until expiration. Failure: stock no longer available, product inactive, draft expired. Edge cases: price changed since draft, customer deleted, user scope changed. Validation: draft item structure, active branch/warehouse at completion. Rules: draft does not reserve stock unless explicitly designed. Permissions: sale.draft.create, sale.create. Dependencies: sales/draft storage, products, stock. Related: sale creation. |
| Sale payment management | Purpose: record payment against a sale. User story: as a cashier/accountant, I collect partial or full payment after sale. Business goal: keep receivables accurate and cashboxes reconciled. Requirements: add payment, delete payment when authorized, payment method, cashbox/ref, currency conversion. Preconditions: active sale not canceled; period open or correction allowed; cashbox active. Workflow: choose sale -> enter amount/method -> save -> update paid/remaining/payment status -> treasury/GL update. Success: payment recorded and balances updated. Failure: overpayment, invalid cashbox, closed period, deleted sale. Edge cases: multi-currency payment, payment reversal, concurrent payment. Validation: amount positive, method allowed, required ref for bank/electronic methods. Rules: deleting payment is reversal-sensitive and audited. Permissions: payment.create, payment.delete. Dependencies: payments, sales, cashboxes, vouchers/GL. Related: customers, collections, treasury. |
| Sale cancellation, deletion, restoration | Purpose: correct invalid sales while preserving traceability. User story: as an authorized manager, I cancel a mistaken invoice and restore stock. Business goal: operational correction without silent data loss. Requirements: cancel sale, delete sale where allowed, restore deleted/canceled sale. Preconditions: sale exists; status allows transition; period open; stock restoration possible. Workflow: locate sale -> provide reason -> reverse stock/payment/GL effects -> mark canceled/deleted/restored. Success: sale status updated, stock/debt adjusted, audit logged. Failure: already returned/canceled, period closed, reversal conflict. Edge cases: partial payments, linked shipment, installment actions, restored product inactive. Validation: reason required, permission required. Rules: cancellation preferred over hard delete. Permissions: sale.cancel, sale.delete, sale.restore. Dependencies: sales, stock movements, payments, installments, GL. Related: returns, audit. |
| Sale returns | Purpose: process customer product returns and refunds. User story: as a cashier, I return sold items and refund or reduce debt. Business goal: customer service and accurate stock/revenue. Requirements: create return with items, quantities, refund method, reason; update sale return totals; restore stock if stock item. Preconditions: original sale active, items returnable, period open, quantities not previously returned. Workflow: select sale -> choose items -> validate quantities -> create return -> update stock/payment/debt/GL. Success: return recorded and sale financials adjusted. Failure: over-return quantity, canceled sale, invalid refund method. Edge cases: installment sale return, damaged item not restocked, foreign currency. Validation: quantity positive <= remaining returnable, reason required. Rules: returns cannot exceed original sale quantities. Permissions: sale.return. Dependencies: sale_returns, sale_return_items, sale_items, stock. Related: payments, customers, GL. |
| Installment management | Purpose: manage scheduled customer payments. User story: as an accountant, I track due, paid, overdue, rescheduled, and written-off installments. Business goal: collect receivables predictably. Requirements: generate installments from sale, view installment actions, perform actions. Preconditions: installment sale exists. Workflow: sale creates schedule -> due dates mature -> collect/reschedule/write off/action log. Success: installment status and sale remaining amount stay consistent. Failure: action invalid for status, amount mismatch, unauthorized write-off. Edge cases: partial payment, early payoff, overdue notification, sale return affects schedule. Validation: due amount positive, due date valid, action type allowed. Rules: status transitions are controlled by state machine. Permissions: installment.view, installment.action, installment.writeoff. Dependencies: installments, installment_actions, payments, notifications. Related: collections, customers. |
| Collections and overdue debt | Purpose: prioritize debt collection. User story: as a collector, I see overdue accounts and customer debt history. Business goal: improve cash recovery. Requirements: overdue list, customer collection view, aging buckets. Preconditions: debt and due dates exist. Workflow: open overdue list -> contact customer -> record payment/action -> notify. Success: overdue balance reduces and action trail exists. Failure: stale data, customer inactive, notification failure. Edge cases: disputed debt, partial payments, debt in foreign currency. Validation: date filters and customer ids. Rules: collection actions should not mutate historical invoices except via payments or approved adjustments. Permissions: collections.view, payment.create, notification.send. Dependencies: installments, customers, payments, notifications. Related: credit scoring, reports. |

#### Expenses, Suppliers, Purchases, Treasury, And Accounting

| Feature | Specification |
|---|---|
| Expense management | Purpose: record business expenses. User story: as an accountant, I enter branch expenses paid from a cashbox. Business goal: complete profit and cash reporting. Requirements: create/list/detail/update/delete expense, summary. Preconditions: branch, cashbox, open period, valid category. Workflow: enter expense -> save -> update treasury/GL -> report. Success: expense appears in summary and financial reports. Failure: invalid cashbox, closed period, negative amount. Edge cases: foreign currency, deleted category label, recurring source. Validation: amount positive, date valid, category required. Rules: deletion must reverse treasury/GL effects. Permissions: expense.create, expense.view, expense.update, expense.delete. Dependencies: expenses, cashboxes, accounting periods, GL. Related: recurring expenses, reports. |
| Recurring expenses | Purpose: automate periodic expense creation. User story: as an accountant, I schedule rent or salary expenses. Business goal: reduce manual recurring work and missed costs. Requirements: create/list/detail/update/toggle/delete recurring expense, run job. Preconditions: active schedule, cashbox/branch valid. Workflow: create schedule -> due date arrives -> run job -> expense created -> nextRunAt advanced. Success: exactly one expense per due period. Failure: duplicate run, invalid schedule, cashbox inactive. Edge cases: missed runs, paused schedule, end-of-month dates. Validation: frequency, amount, nextRunAt. Rules: idempotent job execution by schedule period. Permissions: recurring_expense.manage, expense.create. Dependencies: recurring_expenses, expenses, jobs. Related: expenses, accounting periods. |
| Supplier management | Purpose: maintain suppliers and payable context. User story: as a purchaser, I create suppliers and track purchase debt. Business goal: accurate payables and supplier history. Requirements: create/list/detail/update/delete, debts, statement, supplier products. Preconditions: permission. Workflow: create supplier -> record purchases/payments/returns -> review statement. Success: supplier debt equals purchase balances. Failure: duplicate phone, delete supplier with debt, invalid contact. Edge cases: inactive supplier with historical purchases, unnamed cash supplier. Validation: name required, normalized phone unique where enforced. Rules: debt should be transaction-derived. Permissions: supplier.view, supplier.manage, supplier.delete. Dependencies: suppliers, purchase_invoices, vouchers. Related: purchases, treasury, reports. |
| Purchase invoices | Purpose: record stock acquisition and supplier debt/payment. User story: as a purchaser, I enter a supplier invoice and receive stock into a warehouse. Business goal: replenish inventory and track cost/payables. Requirements: create/list/detail purchase, items, supplier, branch, warehouse, totals, paid amount. Preconditions: supplier active, products active, warehouse active, period open. Workflow: enter invoice -> validate totals -> create invoice/items -> create stock entries -> payment/debt/GL update. Success: stock increases, payable/payment recorded. Failure: invalid supplier, invalid cost, closed period, duplicate invoice number. Edge cases: foreign currency, new product cost, partial payment. Validation: positive quantities/costs, total math, valid warehouse. Rules: stock entries preserve unit cost and source. Permissions: purchase.create, purchase.view. Dependencies: purchase_invoices, purchase_items, product_stock_entries, suppliers. Related: inventory, suppliers, GL. |
| Purchase payments | Purpose: pay supplier invoices. User story: as an accountant, I pay outstanding supplier debt. Business goal: accurate cash and payables. Requirements: add payment to purchase. Preconditions: purchase active with remaining amount; cashbox or bank account active. Workflow: choose purchase -> enter payment -> save voucher/payment effect -> update remaining. Success: supplier debt and treasury reduce correctly. Failure: overpayment, invalid treasury source, closed period. Edge cases: multi-currency payment, partial payment, payment correction. Validation: amount positive <= remaining unless advance supported. Rules: payment must be traceable to source document. Permissions: purchase.payment.create, voucher.create. Dependencies: purchase_invoices, vouchers, treasury, GL. Related: suppliers, treasury. |
| Purchase returns and cancellation | Purpose: return goods to supplier or void purchase. User story: as a purchaser, I return damaged or mistaken purchase items. Business goal: correct inventory and supplier payables. Requirements: create purchase return, cancel purchase. Preconditions: original purchase active, returnable quantity available, period open. Workflow: select purchase -> choose items -> validate quantities -> reduce stock/payable or refund -> record return. Success: stock and supplier balance corrected. Failure: insufficient stock to return, already canceled, invalid quantity. Edge cases: sold stock from purchase already consumed, partial returns, supplier refund method. Validation: quantity <= available/received less prior returns. Rules: cannot cancel after dependent stock consumed unless reversal policy handles it. Permissions: purchase.return, purchase.cancel. Dependencies: purchase_returns, purchase_return_items, stock entries. Related: inventory, GL. |
| Cashboxes and bank accounts | Purpose: represent cash and bank treasury containers. User story: as an accountant, I manage where cash and bank balances live. Business goal: reconcile money movements and reports. Requirements: list/detail/create/update cashboxes, set default, ledger; list/create/update bank accounts. Preconditions: branch exists, GL accounts configured where accounting enabled. Workflow: configure cashbox/account -> receive/pay/transfer -> reconcile ledger. Success: balances match vouchers, payments, expenses, transfers. Failure: duplicate default, inactive account used, invalid opening balance. Edge cases: multi-currency balances, branch closure, deleted GL account. Validation: name required, currency/balances valid, one default per branch. Rules: default cashbox used only when explicitly configured. Permissions: treasury.view, treasury.manage. Dependencies: cashboxes, bank_accounts, vouchers, treasury_transfers. Related: sales, expenses, purchases, GL. |
| Vouchers | Purpose: record receipt and payment documents independent of sales/purchases when needed. User story: as an accountant, I create receipt/payment vouchers tied to customers, suppliers, or other parties. Business goal: controlled cash/bank movement documentation. Requirements: create receipt voucher, create payment voucher, list/detail/cancel. Preconditions: active treasury account, branch, party/source, period open. Workflow: enter voucher -> validate party/source -> update balances -> post GL -> issue document number. Success: voucher posted and visible in ledger. Failure: invalid party, insufficient cash if enforced, duplicate document sequence, closed period. Edge cases: canceled voucher, mixed source references, foreign currency. Validation: amount positive, voucher type allowed, source valid. Rules: only posted vouchers affect treasury; canceled vouchers reverse effects. Permissions: voucher.create, voucher.view, voucher.cancel. Dependencies: vouchers, cashboxes, bank_accounts, document_sequences, GL. Related: payments, expenses, purchases. |
| Treasury transfers | Purpose: move funds between cashboxes and bank accounts. User story: as an accountant, I transfer money from one treasury container to another. Business goal: controlled internal cash movement. Requirements: list/create/cancel transfers. Preconditions: source and destination active and different. Workflow: select source/destination -> enter amount -> save -> debit source/credit destination -> cancel if needed. Success: transfer appears in both ledgers. Failure: same account, insufficient balance, unsupported currency conversion. Edge cases: cashbox to bank, bank to cashbox, cross-branch transfer. Validation: amount positive, source/destination specified, no same endpoint. Rules: canceled transfer must reverse both sides. Permissions: treasury.transfer.create, treasury.transfer.cancel. Dependencies: treasury_transfers, cashboxes, bank_accounts, GL. Related: vouchers, reports. |
| Accounting periods | Purpose: define controlled operational windows. User story: as an accountant, I open and close accounting periods to lock historical transactions. Business goal: reliable reporting and month-end controls. Requirements: list/current/detail/create period, close period with snapshot. Preconditions: branch/scope valid; no conflicting open period for scope. Workflow: open period -> transact -> review reports -> close -> snapshot. Success: period status closed and changes blocked. Failure: open period conflict, unresolved posting failures, unbalanced treasury. Edge cases: branch-specific vs global period, late transactions, restore backup to closed period. Validation: dates valid, scope valid, no overlap. Rules: closed period is immutable except controlled reversal process. Permissions: accounting_period.view, accounting_period.create, accounting_period.close. Dependencies: accounting_periods, snapshots, sales/purchases/expenses/GL. Related: reports, GL, backup. |
| General ledger | Purpose: provide accounting chart, journals, templates, system mappings, and posting failure recovery. User story: as an accountant, I maintain chart of accounts and review journals. Business goal: produce financial statements and reconcile operational postings. Requirements: accounts CRUD, templates seed, system accounts get/update, journal list/detail/create/reverse, posting failures list/repost/ignore. Preconditions: accounting enabled and accounts configured. Workflow: seed accounts -> map system accounts -> operational posting creates journals -> accountant reviews/reverses/fixes failures. Success: balanced journal entries and financial reports. Failure: missing system account, unbalanced journal, closed period, invalid account type. Edge cases: manual journal correction, inactive account with historical lines, repost failure. Validation: debit equals credit, postable accounts only for lines, dates in open period. Rules: reversal entries preserve original journal. Permissions: gl.account.manage, gl.journal.view, gl.journal.create, gl.journal.reverse, gl.posting_failure.manage. Dependencies: accounts, system_accounts, journal_entries, journal_entry_lines, gl_posting_failures. Related: sales, purchases, treasury, reports. |
| Opening balances | Purpose: initialize customer, supplier, treasury, and GL starting positions. User story: as an accountant, I load balances when migrating from another system. Business goal: accurate go-live without recreating all history. Requirements: status, customer opening balance, supplier opening balance, generate opening entry. Preconditions: setup or open initial period. Workflow: enter opening balances -> validate totals -> generate journal entry -> lock when complete. Success: beginning balances reflect in reports. Failure: duplicate opening balance, unbalanced entry, closed setup window. Edge cases: partial migration, later correction, multi-currency opening balance. Validation: amount non-negative/valid sign by party type, one opening record per entity unless adjusted. Rules: opening balances must be clearly tagged as opening source. Permissions: opening_balance.manage. Dependencies: customers, suppliers, GL, accounting periods. Related: setup, reports. |

#### Online Commerce, Delivery, Notifications, Reporting, Backup, And Operations

| Feature | Specification |
|---|---|
| Sales channels | Purpose: define online/order sources. User story: as an online commerce operator, I tag orders by channel. Business goal: channel performance reporting and workflow segmentation. Requirements: create/list/detail/update/delete channels with code, color, icon, active status. Preconditions: permission. Workflow: create channel -> assign online orders -> report by channel. Success: active channels selectable. Failure: duplicate code, delete channel with orders. Edge cases: inactive channel with open orders. Validation: code unique, name required. Rules: historical orders retain channel. Permissions: sales_channel.view, sales_channel.manage. Dependencies: sales_channels, online_orders. Related: online orders, reports. |
| Online orders | Purpose: manage customer orders before fulfillment or sale conversion. User story: as an operator, I receive online orders, update status, convert them to sales, and handle returns. Business goal: centralize order intake and fulfillment. Requirements: create/list/detail/update/delete order, status patch, return, convert to sale. Preconditions: channel active, items valid, customer/contact data present. Workflow: create order -> confirm/prepare/ship/deliver/cancel/return -> optionally convert to sale and shipment. Success: order state and history are updated; sale/shipment links created where applicable. Failure: invalid status transition, out-of-stock conversion, duplicate order number. Edge cases: guest customer, partial return, edit after shipment, delivery failure. Validation: item quantities positive, contact phone/address required for delivery, status allowed. Rules: status history must record every transition. Permissions: online_order.create, online_order.view, online_order.update, online_order.convert, online_order.return, online_order.delete. Dependencies: online_orders, order_items, status_history, products, customers, sales, delivery. Related: delivery, sales channels, notifications. |
| Delivery providers | Purpose: configure external shipment integrations. User story: as an admin, I enable a provider and test its credentials. Business goal: reduce manual delivery work and track shipments. Requirements: list/active/detail/update providers, test provider, set default. Preconditions: provider adapter available; credentials configured securely. Workflow: configure provider -> test -> set default -> create shipments. Success: provider is usable for quotes/shipments/webhooks. Failure: invalid credentials, provider offline, adapter missing. Edge cases: multiple active providers, provider deactivation with open shipments. Validation: provider code, credential fields, default uniqueness. Rules: credentials encrypted/masked; provider logs retained. Permissions: delivery_provider.view, delivery_provider.manage. Dependencies: delivery_providers, settings. Related: shipments, notifications. |
| Delivery shipments and webhooks | Purpose: create and track shipments linked to orders or sales. User story: as a delivery operator, I create a shipment, sync tracking, cancel when needed, and print labels. Business goal: reliable fulfillment and customer updates. Requirements: create shipment, resend, quote, list/detail, sync, cancel, label, webhook logs, action logs, webhooks per provider. Preconditions: provider active, recipient info valid, source order/sale valid. Workflow: create shipment -> provider call -> store tracking -> receive webhook/sync -> update status -> label/report. Success: shipment has provider tracking and current status. Failure: provider error, invalid address, duplicate shipment, cancel rejected. Edge cases: webhook before local shipment exists, repeated webhook, provider status unknown, COD mismatch. Validation: recipient phone/address, source link, provider code, idempotent webhook handling. Rules: external calls logged and retryable. Permissions: delivery.shipment.create, delivery.shipment.view, delivery.shipment.sync, delivery.shipment.cancel, delivery.webhook.admin. Dependencies: delivery_shipments, delivery_events, webhook/action logs, providers. Related: online orders, sales, notifications. |
| Notifications | Purpose: send operational SMS/WhatsApp/customer messages and overdue reminders. User story: as a collector or operator, I send customer notifications and review delivery logs. Business goal: improve communication, collections, and order updates. Requirements: get/update settings, test settings, send customer, send bulk, list notifications, logs, retry, process-now, scan-overdue. Preconditions: provider configured, recipient phone valid, template/channel enabled. Workflow: create notification -> process -> provider sends -> log response -> retry if failed. Success: sent/delivered or tracked failure. Failure: invalid phone, provider error, rate limit, disabled channel. Edge cases: duplicate notification, opt-out, customer with no phone, Arabic encoding. Validation: phone normalization, channel enabled, message length/template variables. Rules: failed provider calls must not lose notification record. Permissions: notification.view, notification.manage, notification.send, notification.retry. Dependencies: notification_settings, notifications, notification_logs, customers, installments. Related: collections, delivery, online orders. |
| Reporting and exports | Purpose: provide operational and financial visibility. User story: as a manager/accountant, I filter reports, inspect KPIs, and export Excel/PDF. Business goal: decision making, compliance, and reconciliation. Requirements: dashboard, dynamic report configs, export Excel/PDF, aging, profit, inventory valuation, online commerce widgets/overview/profit, delivery reports, financial reports. Preconditions: data exists and user has report permissions. Workflow: choose report -> set filters -> view -> export. Success: report totals reconcile with source modules. Failure: invalid filters, huge export timeout, unauthorized branch. Edge cases: canceled/returned transactions, multi-currency totals, closed period snapshots. Validation: date range, branch/scope, pagination/export caps. Rules: exports include filters and generated timestamp. Permissions: report.view plus module-specific report permissions. Dependencies: all transactional tables. Related: sales, inventory, accounting, delivery, online orders. |
| Backup and restore | Purpose: protect business data and support recovery. User story: as an admin, I create backups and restore when needed. Business goal: prevent data loss and support migration. Requirements: list/create/restore/delete backups, grouped data backup, preview, restore, backup settings. Preconditions: admin permission, storage path available, compatible database version. Workflow: create backup -> verify file -> restore or delete -> audit. Success: backup artifact exists and restore completes with verification. Failure: file missing, incompatible version, restore conflict, insufficient disk. Edge cases: restore over active session, partial restore, encrypted secrets, license binding. Validation: filename/path safety, backup integrity, version metadata. Rules: restore is destructive and requires explicit authorization workflow. Permissions: backup.view, backup.create, backup.restore, backup.delete. Dependencies: all database tables, settings, audit. Related: license, setup, disaster recovery. |
| Remote access and tunnel | Purpose: expose controlled remote access when needed. User story: as an admin, I enable or disable remote access for support or remote usage. Business goal: controlled connectivity without permanent exposure. Requirements: status, enable, disable. Preconditions: network service available and admin permission. Workflow: check status -> enable -> receive tunnel info -> disable when complete. Success: status reflects active/inactive remote access. Failure: tunnel service unavailable, port conflict, unauthorized action. Edge cases: process crash, stale tunnel status, restart. Validation: enable options, auth, timeout where configured. Rules: remote access actions audited. Permissions: remote_access.manage. Dependencies: server runtime, settings, audit. Related: support, backup. |
| Operational jobs | Purpose: run scheduled or manual maintenance tasks. User story: as an admin, I run credit scoring or notification scans. Business goal: keep derived data and scheduled tasks current. Requirements: credit-scoring run, recurring-expense run, process notifications, scan overdue. Preconditions: job permission and available dependencies. Workflow: trigger job -> lock/idempotency -> process records -> return summary. Success: job summary shows processed/skipped/failed counts. Failure: lock conflict, partial failure, long-running timeout. Edge cases: retry after partial job, stale derived data, duplicate notifications. Validation: job name and optional scope. Rules: jobs should be idempotent or track processed scope. Permissions: jobs.run or module-specific manage. Dependencies: credit tables, notifications, recurring expenses. Related: collections, reports. |
| Data reset and diagnostics | Purpose: support development or controlled operational reset. User story: as an owner, I run diagnostics or reset database only in authorized context. Business goal: troubleshooting and environment management. Requirements: setup diagnostics, database reset, health/version/server-info. Preconditions: high privilege; production reset disabled or gated. Workflow: inspect diagnostics -> perform reset only when allowed -> verify setup status. Success: reset/diagnostic output is explicit. Failure: unauthorized, production guard, migration error. Edge cases: reset while users active, backup before reset. Validation: confirmation token/phrase if implemented, environment guard. Rules: reset is destructive and must be audited. Permissions: owner/system reset permission. Dependencies: database, migrations, audit. Related: backup, setup. |

## 2. Non-Functional Requirements With Measurable KPIs

| Category | Requirement | KPI / acceptance target |
|---|---|---|
| Availability | Core local/server app must support daily store operations during business hours. | 99.5% monthly uptime for deployed server excluding planned maintenance. |
| Recovery point | Business data must be recoverable from backups. | RPO <= 24 hours for scheduled backups; manual backup available before risky operations. |
| Recovery time | Restore process must be operationally predictable. | RTO <= 60 minutes for standard single-store backup restore after backup file is available. |
| POS latency | Sale creation must feel immediate for cashier workflow. | P95 sale creation <= 1.5 seconds for carts up to 30 items on recommended hardware. |
| Read latency | Common list/detail endpoints must respond quickly. | P95 <= 500 ms for paginated lists and <= 300 ms for detail endpoints on 100k-row datasets with indexes. |
| Report latency | Reports must be usable for daily management. | P95 dashboard <= 2 seconds; P95 standard report <= 5 seconds; large exports async or capped. |
| Concurrency | Multiple users must operate without corrupting stock or financial totals. | Support at least 25 concurrent active users per installation; zero lost updates in concurrent stock/payment tests. |
| Data integrity | Financial and inventory totals must reconcile with source records. | Daily reconciliation variance must be 0 for stock movement totals, sale balances, purchase balances, and journal debits/credits. |
| Auditability | Sensitive actions must be traceable. | 100% coverage for create/update/delete/cancel/restore/approve/reject/payment/return/backup/restore/RBAC changes. |
| Security | Authenticated modules must be inaccessible without valid session and permission. | 100% protected endpoint authorization tests pass; no known critical/high vulnerabilities at release. |
| Privacy | Secrets and provider credentials must not leak. | 0 plaintext secrets in API responses, logs, exports, and backups unless explicitly encrypted and access-controlled. |
| Usability | Arabic-first operators must complete daily workflows with minimal friction. | Cash sale in <= 45 seconds for trained cashier; return in <= 90 seconds; purchase in <= 3 minutes for 10 items. |
| Accessibility | UI must be usable by keyboard and common assistive technologies. | WCAG 2.1 AA for core forms, navigation, contrast, focus indicators, and error messages. |
| Browser support | Web app must run on supported desktop browsers. | Latest two stable versions of Chrome, Edge, and Firefox; tablet viewport smoke tests. |
| Offline tolerance | If running locally, network loss must not break local operations. | Core local sales/inventory work without public internet; integrations show degraded status. |
| Observability | Operators and support need diagnostics. | Health/version/server-info endpoints available; structured errors logged with correlation id where implemented. |
| Backup integrity | Backup artifacts must be verifiable. | 100% backup files include app/database version and integrity checksum; restore dry-run/preview available for grouped backup. |
| Maintainability | New team can extend modules consistently. | Endpoint, table, event, error, and test specifications updated in same PR as functional change. |
| Localization | Arabic labels, RTL layout, and local business terms must be preserved. | 100% core operational screens reviewed in Arabic; no mixed-direction layout defects in release smoke tests. |
| Scalability | Data growth must not degrade common workflows. | With 1M sales rows and 5M sale item rows, indexed list queries remain under targets with pagination. |
| Idempotency | Duplicate submissions must not duplicate financial or stock effects. | 100% idempotent create tests for sale, purchase, payment, voucher, transfer, shipment, notification where key supplied. |

## 3. State Machines For Important Entities

### 3.1 Sale

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Draft | Draft -> Active, Draft -> Expired, Draft -> Deleted | Complete draft, cleanup job, delete draft | Items still valid, stock available, user scope valid | Draft completion failure leaves draft unchanged. |
| Active | Active -> PartiallyPaid, Active -> Paid, Active -> PartiallyReturned, Active -> Canceled, Active -> Deleted | Payment, return, cancel, delete | Open period, valid payment/return reason, no conflicting status | Failed stock/payment reversal aborts transition. |
| PartiallyPaid | PartiallyPaid -> Paid, PartiallyPaid -> PartiallyReturned, PartiallyPaid -> Canceled | Payment, return, cancel | Paid amount <= total adjusted amount | Recalculate paid/remaining from payments. |
| Paid | Paid -> PartiallyReturned, Paid -> Returned, Paid -> Canceled if policy allows | Return, cancel | Refund/debt reduction valid | Reversal journal and stock movement restore. |
| PartiallyReturned | PartiallyReturned -> Returned, PartiallyReturned -> Paid/PartiallyPaid after recalculation | Additional return, payment update | Returnable quantity remains | Rebuild sale status from return and payment aggregates. |
| Returned | Returned -> Restored only through controlled correction | Return completion/correction | All quantities returned | Correction requires manager permission and audit. |
| Canceled | Canceled -> Restored | Restore sale | Stock and period allow reactivation | Restore re-applies stock and financial effects. |
| Deleted | Deleted -> Restored | Restore sale | Same as canceled plus delete policy | Soft-delete restore audited. |

### 3.2 Purchase

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Draft/Prepared | Prepared -> Posted, Prepared -> Canceled | Save/post purchase, cancel | Supplier, items, totals, period | Failure leaves no stock entries. |
| Posted | Posted -> PartiallyPaid, Posted -> Paid, Posted -> PartiallyReturned, Posted -> Canceled if no consumed stock | Payment, return, cancel | Payment <= remaining; stock available for return | Recalculate payable from invoices/payments/returns. |
| PartiallyPaid | PartiallyPaid -> Paid, PartiallyPaid -> PartiallyReturned | Payment/return | Valid payment source | Reverse voucher if payment deleted. |
| Paid | Paid -> PartiallyReturned/Returned | Supplier return | Refund/payment handling valid | Supplier balance recalculated. |
| PartiallyReturned | PartiallyReturned -> Returned | Return remaining quantities | Quantity constraints | Rebuild status from return rows. |
| Returned | Terminal unless corrected | Full return | All items returned | Manager correction only. |
| Canceled | Terminal unless restored policy exists | Cancel | No irreversible downstream effects | Repost purchase via new document if restore unavailable. |

### 3.3 Shipment

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Draft | Draft -> Created, Draft -> Canceled | Create shipment or cancel local draft | Provider, recipient, source document | Provider failure keeps draft/error. |
| Created | Created -> Submitted, Created -> Canceled, Created -> Failed | Provider API call | Provider active, idempotency | Retry create/resend with same source. |
| Submitted | Submitted -> InTransit, Submitted -> Delivered, Submitted -> Failed, Submitted -> Canceled | Webhook/sync/cancel | Provider status mapping | Duplicate webhook ignored using provider event id or status timestamp. |
| InTransit | InTransit -> OutForDelivery, Delivered, Failed, Returned | Webhook/sync | Valid provider transition | Manual sync can recover stale status. |
| OutForDelivery | OutForDelivery -> Delivered, Failed, Returned | Webhook/sync | Provider evidence | Log event and notify customer. |
| Delivered | Terminal except correction | Provider delivery | Source order can be completed | Correction requires audit. |
| Failed | Failed -> Resubmitted, Returned, Canceled | Resend/manual action | Failure reason and provider support | New shipment may link to same source. |
| Returned | Terminal or return workflow | Provider return | Source order/sale return policy | Create online order return if needed. |
| Canceled | Terminal | Cancel accepted | Provider/local cancellation | If provider cancel fails, state remains previous with error log. |

### 3.4 Transfer

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Pending | Pending -> Approved, Pending -> Rejected, Pending -> Canceled | Manager decision/requester cancel | Source stock available, warehouses active | Approval is atomic stock debit/credit. |
| Approved | Terminal or correction-only | Approval | Quantity applied exactly once | Reversal transfer required for correction. |
| Rejected | Terminal | Reject with reason | Reason required | New request can be created. |
| Canceled | Terminal | Requester/admin cancel | Not already approved/rejected | No stock effect. |

### 3.5 Customer Debt

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Clear | Clear -> CurrentDebt | Credit sale/installment sale | Credit terms allowed | Recalculate debt from open sales/installments. |
| CurrentDebt | CurrentDebt -> Overdue, CurrentDebt -> Clear, CurrentDebt -> Disputed | Due date passes, payment, dispute flag | Payment valid | Aging job can rebuild status. |
| Overdue | Overdue -> CurrentDebt, Overdue -> Clear, Overdue -> BadDebt, Overdue -> Disputed | Payment/reschedule/write-off/dispute | Permission for write-off | Collection actions remain historical. |
| Disputed | Disputed -> CurrentDebt, Disputed -> Clear, Disputed -> BadDebt | Resolution | Resolution note required | Audit status change. |
| BadDebt | BadDebt -> Clear/Recovered | Recovery payment | Manager/accounting permission | Reversal journal if written off. |

### 3.6 Installment

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Scheduled | Scheduled -> Due, Scheduled -> Paid, Scheduled -> Canceled | Date arrives, early payment, sale cancel | Sale active | Job can mark due idempotently. |
| Due | Due -> PartiallyPaid, Paid, Overdue, Rescheduled, WrittenOff | Payment/date/action | Amount valid | Recalculate from payments/actions. |
| PartiallyPaid | PartiallyPaid -> Paid, Overdue, Rescheduled, WrittenOff | Payment/date/action | Remaining > 0 | Payment deletion reopens status. |
| Overdue | Overdue -> PartiallyPaid, Paid, Rescheduled, WrittenOff | Payment/action | Notification rules | Scan overdue can recover missed status. |
| Rescheduled | Rescheduled -> Due, Paid, Canceled | New due date/payment/cancel | New due date valid | Keep action history. |
| Paid | Terminal except correction | Full payment | Paid amount >= due amount | Correction requires payment reversal. |
| WrittenOff | Terminal except recovery | Write-off | Permission and reason | Recovery payment creates new action. |
| Canceled | Terminal | Sale cancel/return policy | Parent sale status | No collection actions after cancel. |

### 3.7 Accounting Period

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Planned | Planned -> Open, Planned -> Canceled | Open/cancel | No overlapping open period | Failure leaves planned. |
| Open | Open -> Closing, Open -> Suspended | Close request/admin suspend | User permission | Suspended blocks new postings. |
| Closing | Closing -> Closed, Closing -> Open | Snapshot/reconciliation success or failure | No posting failures, balanced GL, report snapshot created | On failure return to Open with close errors. |
| Closed | Terminal except controlled reopen if product policy adds it | Close complete | Snapshot persisted | Corrections through reversal in new period. |
| Suspended | Suspended -> Open, Suspended -> Closed | Admin action | Reason and validation | Audit required. |

### 3.8 Cash Session

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| NotOpened | NotOpened -> Open | Cashier opens session | Assigned cashbox, opening amount | Failed open creates no session. |
| Open | Open -> Counting, Open -> Suspended | Close request/admin action | User/cashbox active | Transactions continue only while Open. |
| Counting | Counting -> Closed, Counting -> Open | Submit count or cancel close | Count variance recorded | Return to Open if count rejected. |
| Closed | Terminal | Manager close | No unresolved required fields | Reopen only through audited correction if implemented. |
| Suspended | Suspended -> Open, Suspended -> Closed | Admin action | Reason required | Audit required. |

Cash session is not currently represented by a dedicated table in the discovered schema. If implemented, it should bind user, cashbox, opening/closing balance, counted balance, variance, and session transaction range.

### 3.9 Payment

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Pending | Pending -> Posted, Pending -> Failed, Pending -> Canceled | Save/external confirmation/cancel | Source document active | No financial effect until Posted if async. |
| Posted | Posted -> Reversed | Delete/reversal/cancel source | Period and permission | Reversal entry and source recalculation. |
| Failed | Failed -> Pending, Canceled | Retry/cancel | Provider or validation error resolved | Retry idempotently. |
| Canceled | Terminal | Cancel before posting | No posted effect | New payment required. |
| Reversed | Terminal | Reversal complete | Reversal equals original amount/currency | Recreate payment if needed. |

### 3.10 Expense

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Draft | Draft -> Posted, Draft -> Canceled | Save/cancel | Required fields valid | No treasury effect until posted. |
| Posted | Posted -> Updated, Posted -> Reversed, Posted -> Deleted | Edit/delete | Period open; reversal possible | Recalculate treasury/GL. |
| Updated | Updated -> Posted, Reversed | Save correction/delete | Delta valid | Store audit diff. |
| Reversed | Terminal | Delete/cancel | Reversal complete | Recreate expense if needed. |
| Deleted | Terminal/soft-deleted | Delete | Permission | Restore policy must reapply effects. |

### 3.11 Online Order

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| New | New -> Confirmed, New -> Canceled, New -> Deleted | Manual update/delete | Contact/items valid | Status history records transition. |
| Confirmed | Confirmed -> Preparing, Confirmed -> Canceled | Confirm/prepare/cancel | Stock check if reservation policy | Cancel releases reservation if used. |
| Preparing | Preparing -> ReadyToShip, Preparing -> Canceled | Fulfillment action | Items available | Manual correction with reason. |
| ReadyToShip | ReadyToShip -> Shipped, ReadyToShip -> Canceled | Shipment creation/cancel | Delivery info/provider | If shipment fails, remain ReadyToShip. |
| Shipped | Shipped -> Delivered, FailedDelivery, Returned | Webhook/sync/manual | Shipment status mapped | Manual sync recovers stale status. |
| Delivered | Delivered -> Returned, ConvertedToSale | Return/convert | Conversion rules | Sale conversion idempotent. |
| FailedDelivery | FailedDelivery -> ReadyToShip, Returned, Canceled | Retry/return/cancel | Reason required | New shipment may be created. |
| Returned | Terminal or refund workflow | Return | Return quantities valid | Link to return record. |
| ConvertedToSale | Terminal for sales conversion | Convert | Sale created exactly once | Store saleId and idempotency key. |
| Canceled | Terminal | Cancel | Reason required | Reopen only if policy adds it. |
| Deleted | Terminal/soft-deleted | Delete | Permission | Historical reporting excludes by default. |

### 3.12 Return

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Requested | Requested -> Approved, Rejected, Canceled | Return review | Source sale/order exists | No stock/financial effect before approval if review workflow used. |
| Approved | Approved -> Posted, Rejected | Post/reject before posting | Quantities valid | Failure leaves approved. |
| Posted | Posted -> Reversed | Correction | Period open, reversal valid | Reversal adjusts stock/debt/refund. |
| Rejected | Terminal | Reject | Reason required | New return request needed. |
| Canceled | Terminal | Cancel | Permission | No financial effect. |
| Reversed | Terminal | Correction complete | Full reversal | New return if needed. |

### 3.13 Notification

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Queued | Queued -> Processing, Canceled | Scheduler/manual cancel | Channel enabled, phone valid | Retry remains queued. |
| Processing | Processing -> Sent, Failed, Queued | Provider result/timeout | Provider response parsed | Timeout returns to queued with retry count. |
| Sent | Sent -> Delivered, FailedDelivery | Provider callback/status | Provider event valid | Duplicate callbacks ignored. |
| Delivered | Terminal | Delivery callback | Recipient match | None. |
| Failed | Failed -> Queued, Canceled | Retry/cancel | Retry count below limit | Retry creates log record. |
| FailedDelivery | FailedDelivery -> Queued, Canceled | Retry/cancel | Provider retry supported | Manual retry. |
| Canceled | Terminal | Cancel | Not sent/delivered | None. |

### 3.14 Backup

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Requested | Requested -> Running, Failed | Create/restore request | Permission, disk/path safe | No artifact yet. |
| Running | Running -> Completed, Failed | Backup/restore process | File integrity, database lock | Failed restore must leave recoverable pre-restore backup when possible. |
| Completed | Completed -> Verified, Deleted, Restoring | Verify/delete/restore | Checksum/version | Restore requires explicit confirmation. |
| Verified | Verified -> Restoring, Deleted | Restore/delete | Compatible version | Keep verification metadata. |
| Restoring | Restoring -> Restored, Failed | Restore process | Schema compatible | On failure restore from pre-restore backup. |
| Restored | Terminal | Restore complete | Health check passed | Audit restored backup id. |
| Failed | Failed -> Requested | Retry | Failure reason resolved | Logs retained. |
| Deleted | Terminal | Delete | Permission | Deletion audited. |

### 3.15 License

| State | Allowed transitions | Trigger | Validation | Rollback / recovery |
|---|---|---|---|---|
| Unlicensed | Unlicensed -> Trial, Active, Grace | Trial start/activation/offline policy | Signed license or trial eligibility | Read-only mode if blocked. |
| Trial | Trial -> Active, Expired, Grace | Activation/expiration/offline | Date and installation id | Trial expiry clear to user. |
| Active | Active -> Grace, Expired, Suspended | Validation failure/expiration/admin | Signature, date, entitlement | Cache last valid license. |
| Grace | Grace -> Active, Expired | Validation restored/grace elapsed | Grace window valid | Restrict risky features after grace. |
| Expired | Expired -> Active | Renewal | Valid renewed license | Preserve data access. |
| Suspended | Suspended -> Active, Expired | Support/admin action | Signed status | Audit state change. |

## 4. Domain Model

### 4.1 Aggregate Boundaries

| Aggregate | Root | Owned entities | External references | Invariants |
|---|---|---|---|---|
| User access | User / Role | UserBranch, RolePermission | Branch, Warehouse | Active users must have valid role; protected roles cannot be corrupted. |
| Organization | Branch | Warehouse | Users, accounting periods | Default warehouse belongs to branch. |
| Catalog | Product | ProductUnit | Category, Currency | SKU/barcode uniqueness; unit conversion positive. |
| Inventory | ProductStock | ProductStockEntry, StockMovement | Product, Warehouse, SaleItem, PurchaseItem, Transfer | Stock totals reconcile with movements and remaining entries. |
| Transfer | WarehouseTransfer | Transfer state/history fields | Product, Warehouse, User | Pending transfer can be approved/rejected once. |
| Customer | Customer | CreditEvent, CreditSnapshot, CreditScore | Sale, Installment, Notification | Debt and score derive from transactional history. |
| Sale | Sale | SaleItem, SaleItemStockEntry, Payment, Installment, SaleReturn | Customer, Branch, Warehouse, AccountingPeriod | Totals, paid amount, remaining amount, stock effects, and invoice number are consistent. |
| Sale return | SaleReturn | SaleReturnItem | Sale, SaleItem, Product | Returned quantity never exceeds sold quantity. |
| Supplier | Supplier | Supplier statement/debt projections | PurchaseInvoice, Voucher | Supplier debt reconciles with purchases/payments/returns. |
| Purchase | PurchaseInvoice | PurchaseItem, PurchaseReturn, PurchaseReturnItem | Supplier, Product, Warehouse | Received quantities and costs produce stock entries. |
| Treasury | Cashbox / BankAccount | Voucher, TreasuryTransfer ledger projections | Branch, Party, GL Account | Money movement has exactly one source and destination/effect. |
| GL | Account / JournalEntry | JournalEntryLine, SystemAccount, GLPostingFailure | Operational source documents | Journal entries are balanced and source-linked. |
| Accounting period | AccountingPeriod | ReportSnapshot | Branch, transactional documents | Closed periods block new operational mutations. |
| Online commerce | OnlineOrder | OnlineOrderItem, StatusHistory | SalesChannel, Customer, Sale, Shipment | Status transitions recorded exactly once. |
| Delivery | DeliveryShipment | DeliveryEvent, WebhookLog, ActionLog | Provider, OnlineOrder, Sale | Provider status maps to internal shipment state. |
| Notification | Notification | NotificationLog | Customer, Sale, Installment, Provider settings | Notification retry count and final status are consistent. |
| Backup | Backup artifact metadata | Restore/preview result | Database, storage, license settings | Backup integrity and compatibility are verified before restore. |

### 4.2 Entity Relationship Summary

| Entity | Relationships |
|---|---|
| users | belongs to role concept; optionally assigned to branch and warehouse; many user_branches; creates audit, sales, purchases, vouchers, journals. |
| roles | many role_permissions; assigned to users by role code/id depending implementation. |
| permissions | many role_permissions; grouped for UI. |
| branches | many warehouses, users, sales, purchases, expenses, cashboxes, vouchers, accounting periods, reports. |
| warehouses | belongs to branch; many product_stock, stock_movements, sales, purchases, transfers. |
| categories | many products. |
| products | many units, stock rows, stock entries, sale items, purchase items, order items. |
| customers | many sales, payments, installments, credit events/scores, notifications, online orders. |
| sales | many sale_items, payments, installments, returns; belongs to customer/branch/warehouse/accounting period. |
| purchases | many purchase_items, purchase_returns; belongs to supplier/branch/warehouse/accounting period. |
| suppliers | many purchases and payable vouchers. |
| cashboxes/bank_accounts | many vouchers and treasury transfers. |
| accounts | parent/child tree; many journal lines; referenced by system_accounts, cashboxes, bank accounts. |
| online_orders | many order items and status history; may link to customer, sale, shipment, channel. |
| delivery_shipments | belongs to provider; may link to online order or sale; many events/logs. |
| notifications | many notification logs; may link to customer/sale/installment. |

### 4.3 Commands

| Domain | Commands |
|---|---|
| Access | RegisterUser, Login, Logout, ChangePassword, CreateUser, UpdateUser, ResetPassword, DeleteUser, CreateRole, UpdateRole, AssignPermissions. |
| Configuration | UpdateCompanySettings, UpdateCurrency, UpdateExchangeRate, UpdateFeatureFlags, UpdateAppMode. |
| Catalog | CreateCategory, UpdateCategory, DeleteCategory, CreateProduct, UpdateProduct, DeleteProduct, AddProductUnit, UpdateProductUnit. |
| Inventory | AdjustStock, RequestTransfer, ApproveTransfer, RejectTransfer, RecalculateStock, ConsumeStockForSale, ReceiveStockFromPurchase. |
| Customer | CreateCustomer, UpdateCustomer, RecalculateCredit, CheckInstallmentEligibility, RecordCollectionAction. |
| Sales | CreateSale, SaveDraft, CompleteDraft, AddPayment, DeletePayment, CancelSale, RestoreSale, ReturnSaleItems. |
| Purchases | CreatePurchase, AddPurchasePayment, ReturnPurchaseItems, CancelPurchase. |
| Treasury | CreateCashbox, UpdateCashbox, SetDefaultCashbox, CreateBankAccount, CreateVoucher, CancelVoucher, CreateTreasuryTransfer, CancelTreasuryTransfer. |
| Accounting | OpenPeriod, ClosePeriod, CreateAccount, UpdateAccount, SeedTemplates, MapSystemAccount, CreateJournalEntry, ReverseJournalEntry, RepostGLFailure, IgnoreGLFailure. |
| Online commerce | CreateOrder, UpdateOrder, ChangeOrderStatus, ConvertOrderToSale, ReturnOrder, DeleteOrder. |
| Delivery | UpdateProvider, TestProvider, SetDefaultProvider, QuoteShipment, CreateShipment, ResendShipment, SyncShipment, CancelShipment, ProcessWebhook. |
| Notifications | UpdateNotificationSettings, SendCustomerNotification, SendBulkNotification, RetryNotification, ProcessNotificationQueue, ScanOverdue. |
| Backup | CreateBackup, RestoreBackup, DeleteBackup, PreviewDataRestore, RestoreDataGroup. |
| Operations | RunCreditScoringJob, RunRecurringExpenseJob, EnableRemoteAccess, DisableRemoteAccess, ResetDatabase. |

### 4.4 Queries

| Domain | Queries |
|---|---|
| Access | GetProfile, GetSession, ListUsers, GetUser, ListRoles, GetRole, ListPermissions. |
| Configuration | GetSettings, GetCompanySettings, GetCurrencySettings, ListCurrencies, GetBaseCurrency, ListFeatureFlags. |
| Catalog | ListCategories, GetCategory, ListProducts, GetProduct, GetLowStockProducts. |
| Inventory | GetWarehouseStock, GetProductTotals, GetProductWarehouseStock, ListMovements, ListExpiryAlerts, ListTransfers, GetTransfer. |
| Customer | ListCustomers, GetCustomer, GetCustomerProfile, GetCustomerCredit, GetCreditScore, GetAging, ListOverdueCollections. |
| Sales | ListSales, GetSale, GetSalesReport, GetTopProducts, ConvertCurrency. |
| Purchases | ListPurchases, GetPurchase, ListSuppliers, GetSupplier, GetSupplierDebts, GetSupplierStatement, GetSupplierProducts. |
| Treasury | ListCashboxes, GetCashboxLedger, ListBankAccounts, ListVouchers, GetVoucher, ListTreasuryTransfers. |
| Accounting | ListPeriods, GetCurrentPeriod, GetPeriod, ListAccounts, ListJournals, GetJournal, ListPostingFailures, FinancialReports. |
| Online commerce | ListChannels, GetChannel, ListOrders, GetOrder, OnlineCommerceReports. |
| Delivery | ListProviders, GetProvider, ListShipments, GetShipment, GetLabel, ListWebhookLogs, ListActionLogs, DeliveryReports. |
| Notifications | GetNotificationSettings, ListNotifications, GetNotificationLogs. |
| Backup | ListBackups, ListBackupGroups, PreviewRestore. |
| Operations | Health, Version, ServerInfo, SetupStatus, Diagnostics, RemoteAccessStatus. |

### 4.5 Value Objects

| Value object | Fields / notes |
|---|---|
| Money | amount, currencyCode, exchangeRate, baseAmount, roundingMode. |
| PhoneNumber | raw, normalized, country/default region, validation status. |
| Address | city, street/address lines, notes, delivery coordinates if added. |
| DocumentNumber | docType, branchId, year, sequence, formatted number. |
| DateRange | from, to, timezone, inclusive/exclusive policy. |
| Quantity | value, unitId, conversionFactor, baseQuantity. |
| StockSource | sourceType, sourceId, sourceLineId. |
| PartyRef | partyType, partyId, displayName snapshot. |
| PaymentMethod | method code, reference, treasury target. |
| IntegrationPayload | provider, action, request payload, response payload, redaction status. |
| AuditActor | userId, username, ipAddress, userAgent/session id if available. |
| IdempotencyScope | key, scope, userId, route, request hash, expiry. |

### 4.6 Enums And Reference Data

| Enum | Values |
|---|---|
| Sale status | draft, active, partially_paid, paid, partially_returned, returned, canceled, deleted. |
| Sale type | cash, credit, installment, online_converted. |
| Payment status | unpaid, partially_paid, paid, overpaid, refunded, canceled. |
| Installment status | scheduled, due, partially_paid, overdue, paid, rescheduled, written_off, canceled. |
| Purchase status | posted, partially_paid, paid, partially_returned, returned, canceled. |
| Transfer status | pending, approved, rejected, canceled. |
| Accounting period status | planned, open, closing, closed, suspended, canceled. |
| Voucher type | receipt, payment. |
| Treasury transfer status | posted, canceled. |
| Journal status | draft, posted, reversed, canceled. |
| GL account type | asset, liability, equity, revenue, expense, contra_asset, contra_revenue. |
| Online order status | new, confirmed, preparing, ready_to_ship, shipped, delivered, failed_delivery, returned, converted_to_sale, canceled, deleted. |
| Shipment status | draft, created, submitted, in_transit, out_for_delivery, delivered, failed, returned, canceled. |
| Notification status | queued, processing, sent, delivered, failed, failed_delivery, canceled. |
| Backup status | requested, running, completed, verified, restoring, restored, failed, deleted. |
| License status | unlicensed, trial, active, grace, expired, suspended. |
| Movement type | adjustment, sale, sale_return, purchase, purchase_return, transfer_out, transfer_in, correction. |
| Source type | sale, purchase, sale_return, purchase_return, voucher, expense, transfer, opening_balance, manual_journal, online_order, shipment. |

### 4.7 Domain Events

The full event catalog is in Section 7. At model level, every aggregate emits events after successful state changes and before external side effects where queueing is used. Events must include eventId, eventType, aggregateType, aggregateId, occurredAt, userId, branchId where applicable, correlationId, causationId, and schemaVersion.

## 5. API Contract Specification

### 5.1 Common API Rules

| Concern | Contract |
|---|---|
| Base path | All business APIs are under `/api/*`. Health/version endpoints are root-level. |
| Authentication | Protected endpoints require a valid session/token. Setup and selected health endpoints are public. |
| Authorization | Each endpoint checks role permission and branch/warehouse scope when relevant. |
| Request format | JSON body for creates/updates unless endpoint returns file/label/export. Query parameters for filters, pagination, sorting, search. |
| Response format | JSON envelope should be standardized as `{ "success": true, "data": ..., "meta": ... }` or `{ "success": false, "error": { ... } }`. Existing implementation should be normalized toward this contract. |
| Idempotency | Mutating endpoints that create financial, inventory, delivery, notification, or backup effects should accept `Idempotency-Key`. Duplicate key with same scope returns original response. |
| Pagination | List endpoints accept `page`, `limit`; response meta includes `page`, `limit`, `total`, `totalPages`. |
| Sorting | List endpoints accept `sortBy`, `sortOrder=asc|desc` where supported. Unsupported sort returns validation error. |
| Filtering | Date filters use ISO dates; branch/customer/supplier/product/status filters use ids or enum values. |
| Search | `search` performs safe text search on documented fields; never interpolated directly into SQL. |
| Rate limits | Auth/login/notification/webhook endpoints require stricter limits; business CRUD should be rate-limited by user/session to prevent accidental floods. Recommended defaults: login 10/min/IP, notifications 60/min/user, webhooks provider-specific, general writes 300/min/user. |
| Errors | Use Section 8 codes with HTTP status. Validation errors include field-level details. |
| Files | Export/label endpoints return binary stream or signed/local file metadata with content type. |
| Audit | Successful sensitive writes and denied high-risk actions are audited. |

### 5.2 Endpoint Contract Matrix

The matrix below enumerates the discovered routes. Permissions are named functionally; exact permission keys should map to the RBAC seed catalog.

| Method and path | Purpose | Input | Output | Validation, permission, errors, notes |
|---|---|---|---|---|
| GET `/` | Server landing/status message. | None. | Server info. | Public; no business data. |
| GET `/health` | Health probe. | None. | Health status/version/db status where available. | Public or ops-limited; must not expose secrets. |
| GET `/version` | Version metadata. | None. | App version/build metadata. | Public-safe. |
| GET `/server-info` | Server runtime info. | None. | Safe server metadata. | Redact environment/secrets. |
| POST `/__shutdown__` | Controlled server shutdown. | Confirmation payload. | Shutdown accepted. | Authenticated admin/owner only; audit; disabled in production unless explicitly allowed. |
| GET `/api/auth/initial-setup` | Check setup state. | None. | Whether first setup is required. | Public but no sensitive user list. |
| POST `/api/auth/register` | Register user where allowed. | username, password, profile, role/scope. | User/session or user record. | Validate uniqueness/password; permission depends on setup policy. |
| POST `/api/auth/login` | Authenticate user. | username, password. | Session/profile/permissions. | Rate-limited; errors AUTH_INVALID_CREDENTIALS, AUTH_INACTIVE_USER. |
| POST `/api/auth/first-user` | Create first admin. | admin profile/password. | User/session/setup status. | Only when no admin exists; idempotency recommended. |
| GET `/api/auth/profile` | Current user profile. | None. | User profile and scope. | Auth required. |
| GET `/api/auth/session` | Validate current session. | None. | Session status/profile. | Auth required. |
| POST `/api/auth/logout` | End session. | None. | Success. | Auth required; idempotent. |
| PUT `/api/auth/change-password` | Change own password. | currentPassword, newPassword. | Success. | Password policy; audit. |
| GET `/api/users/check-first-user` | User setup check. | None. | First-user existence. | Public-safe. |
| GET `/api/users` | List users. | page, limit, search, role, active. | Paginated users. | `user.view`. |
| GET `/api/users/:id` | User detail. | id path. | User. | `user.view`; 404 if not found. |
| POST `/api/users` | Create user. | profile, role, branch/warehouse assignments, password. | Created user. | `user.manage`; idempotent recommended. |
| PUT `/api/users/:id` | Update user. | profile/role/scope/status. | Updated user. | Prevent last admin removal. |
| POST `/api/users/:id/reset-password` | Reset password. | newPassword or generated flag. | Success/temp credential metadata. | `user.reset_password`; audit. |
| DELETE `/api/users/:id` | Delete/deactivate user. | id. | Success. | `user.delete`; protect self/last admin. |
| GET `/api/rbac/permissions` | List permissions. | group/search. | Permission list. | `rbac.view`. |
| GET `/api/rbac/roles` | List roles. | page, limit, active. | Roles. | `rbac.view`. |
| GET `/api/rbac/roles/:id` | Role detail. | id. | Role plus permissions. | `rbac.view`. |
| POST `/api/rbac/roles` | Create role. | code, name, scope, permissions. | Role. | `rbac.manage`; unique code. |
| PUT `/api/rbac/roles/:id` | Update role. | role fields. | Role. | `rbac.manage`; protect system roles. |
| PUT `/api/rbac/roles/:id/permissions` | Replace role permissions. | permission ids/keys. | Role permission set. | `rbac.manage`; audit. |
| DELETE `/api/rbac/roles/:id` | Delete role. | id. | Success. | `rbac.manage`; block assigned/system role. |
| GET `/api/settings` | List settings. | key prefix/filter. | Settings. | `settings.view`; mask secrets. |
| GET `/api/settings/company` | Company settings. | None. | Company profile/settings. | `settings.view`. |
| PUT `/api/settings/company` | Update company settings. | name, contact, address, tax, logo fields. | Settings. | `settings.manage`. |
| GET `/api/settings/currency` | Currency settings. | None. | Currency config. | `settings.view`. |
| PUT `/api/settings/currency` | Update currency settings. | base/default settings. | Settings. | `settings.manage`; one base currency. |
| PUT `/api/settings/bulk` | Bulk update settings. | key-value array/object. | Updated settings. | `settings.manage`; per-key validation; transaction. |
| GET `/api/settings/:key` | Get setting by key. | key. | Setting. | `settings.view`; mask secrets. |
| POST `/api/settings` | Create setting. | key, value, description. | Setting. | `settings.manage`; unique key. |
| PUT `/api/settings/:key` | Update setting. | value, description. | Setting. | `settings.manage`. |
| DELETE `/api/settings/:key` | Delete setting. | key. | Success. | `settings.manage`; protect required keys. |
| GET `/api/feature-flags` | List feature flags. | None. | Flags. | `settings.view`. |
| PUT `/api/feature-flags` | Update feature flags. | flags object. | Flags. | `feature_flags.manage`; validate dependencies. |
| POST `/api/feature-flags/setup` | Initialize feature flags. | Optional defaults. | Setup result. | Admin/setup permission; idempotent. |
| PUT `/api/feature-flags/app-mode` | Set app mode. | mode. | Updated mode. | `feature_flags.manage`; audit. |
| GET `/api/currencies` | List currencies. | active/search. | Currencies. | `currency.view`. |
| GET `/api/currencies/active` | Active currencies. | None. | Active currencies. | `currency.view`. |
| GET `/api/currencies/base` | Base currency. | None. | Base currency. | `currency.view`. |
| GET `/api/currencies/:code` | Currency detail. | code. | Currency. | `currency.view`. |
| PATCH `/api/currencies/:code/exchange-rate` | Update exchange rate. | exchangeRate. | Currency. | `currency.manage`; positive rate; audit. |
| PUT `/api/currencies/:code` | Update currency. | name, symbol, active, rate. | Currency. | `currency.manage`; protect base. |
| GET `/api/branches` | List branches. | page, limit, active. | Branches. | `branch.view`. |
| GET `/api/branches/:id` | Branch detail. | id. | Branch. | `branch.view`; scope check. |
| GET `/api/branches/:id/active-warehouse` | Active/default warehouse. | branch id. | Warehouse. | `branch.view`/`warehouse.view`. |
| POST `/api/branches` | Create branch. | name, address, defaultWarehouseId. | Branch. | `branch.manage`; idempotent recommended. |
| PUT `/api/branches/:id` | Update branch. | branch fields. | Branch. | `branch.manage`. |
| DELETE `/api/branches/:id` | Delete/deactivate branch. | id. | Success. | `branch.delete`; block transactions/stock. |
| GET `/api/warehouses` | List warehouses. | branchId, active. | Warehouses. | `warehouse.view`; scope. |
| GET `/api/warehouses/transfer-targets` | Eligible transfer destinations. | fromWarehouseId, productId. | Warehouses. | `transfer.view`; excludes source/inactive. |
| GET `/api/warehouses/:id` | Warehouse detail. | id. | Warehouse. | `warehouse.view`; scope. |
| POST `/api/warehouses/ensure-default` | Ensure default warehouse exists. | branchId. | Warehouse. | Admin/setup; idempotent. |
| POST `/api/warehouses` | Create warehouse. | name, branchId. | Warehouse. | `warehouse.manage`. |
| PUT `/api/warehouses/:id` | Update warehouse. | fields. | Warehouse. | `warehouse.manage`. |
| DELETE `/api/warehouses/:id` | Delete/deactivate warehouse. | id. | Success. | `warehouse.delete`; block stock/open transfers. |
| POST `/api/categories` | Create category. | name, description. | Category. | `category.manage`; unique name. |
| GET `/api/categories` | List categories. | active/search. | Categories. | `category.view`. |
| GET `/api/categories/:id` | Category detail. | id. | Category. | `category.view`. |
| PUT `/api/categories/:id` | Update category. | fields. | Category. | `category.manage`. |
| DELETE `/api/categories/:id` | Delete/deactivate category. | id. | Success. | `category.delete`; block active products or deactivate. |
| POST `/api/products` | Create product. | product fields, units. | Product. | `product.manage`; SKU/barcode unique; idempotent. |
| GET `/api/products` | List/search products. | page, limit, search, categoryId, active, lowStock. | Products. | `product.view`; pagination. |
| GET `/api/products/low-stock` | Low stock products. | branch/warehouse filters. | Products. | `inventory.view`. |
| GET `/api/products/:id` | Product detail. | id. | Product with units/stock summary. | `product.view`. |
| PUT `/api/products/:id` | Update product. | fields/units. | Product. | `product.manage`; protect transaction history. |
| DELETE `/api/products/:id` | Delete/deactivate product. | id. | Success. | `product.delete`; block stock/history or deactivate. |
| GET `/api/inventory/warehouses/:warehouseId/stock` | Warehouse stock. | page, limit, search, categoryId. | Stock rows. | `inventory.view`; warehouse scope. |
| GET `/api/inventory/warehouses/:warehouseId/low-stock` | Warehouse low stock. | threshold/category. | Low stock rows. | `inventory.view`. |
| GET `/api/inventory/products/:productId/totals` | Product stock totals. | productId. | Totals across warehouses. | `inventory.view`. |
| GET `/api/inventory/products/:productId/warehouses/:warehouseId` | Product stock in warehouse. | ids. | Stock detail. | `inventory.view`; scope. |
| POST `/api/inventory/adjust` | Stock adjustment. | productId, warehouseId, quantityDelta/quantity, reason. | Movement and stock. | `inventory.adjust`; open period; idempotent. |
| POST `/api/inventory/transfer` | Direct stock transfer. | fromWarehouseId, toWarehouseId, productId, quantity. | Transfer/movements. | `inventory.transfer`; stock available; idempotent. |
| GET `/api/inventory/movements` | Stock movements. | filters/date/product/warehouse/page. | Movements. | `inventory.view`; pagination. |
| GET `/api/inventory/expiry-alerts` | Expiring stock entries. | days, warehouseId. | Entries. | `inventory.view`. |
| GET `/api/warehouse-transfers` | List transfer requests. | status, branch, warehouse, page. | Transfers. | `transfer.view`. |
| POST `/api/warehouse-transfers` | Create transfer request. | fromWarehouseId, toWarehouseId, productId, quantity. | Transfer. | `transfer.request`; idempotent. |
| GET `/api/warehouse-transfers/:id` | Transfer detail. | id. | Transfer. | `transfer.view`. |
| POST `/api/warehouse-transfers/:id/approve` | Approve transfer. | optional note. | Approved transfer. | `transfer.approve`; pending only; atomic stock move. |
| POST `/api/warehouse-transfers/:id/reject` | Reject transfer. | reason. | Rejected transfer. | `transfer.reject`; pending only. |
| POST `/api/customers` | Create customer. | name, phone, address, credit fields. | Customer. | `customer.manage`; phone normalization; idempotent. |
| GET `/api/customers` | List customers. | page, limit, search, active, debt filters. | Customers. | `customer.view`; pagination/search. |
| GET `/api/customers/:id` | Customer detail. | id. | Customer. | `customer.view`. |
| GET `/api/customers/:id/profile` | Customer profile. | id, date filters. | Profile, sales/debt metrics. | `customer.view`. |
| PUT `/api/customers/:id` | Update customer. | fields. | Customer. | `customer.manage`. |
| DELETE `/api/customers/:id` | Delete/deactivate customer. | id. | Success. | `customer.delete`; block active debt. |
| GET `/api/customers/:id/credit` | Customer credit state. | id. | Credit/debt summary. | `customer.credit.view`. |
| POST `/api/customers/:id/credit/recalculate` | Recalculate credit. | optional scope/date. | Credit summary. | `customer.credit.recalculate`; job/audit. |
| GET `/api/customers/:id/credit-score` | Get credit score. | id. | Score/risk/factors. | `customer.credit.view`; factors safe for UI. |
| POST `/api/customers/:id/credit/check-installment` | Check installment eligibility. | saleAmount, schedule. | Decision/risk. | `sale.create`; validation, no mutation unless stated. |
| GET `/api/customers/:id/aging` | Customer aging. | date/asOf. | Aging buckets. | `collections.view`. |
| POST `/api/sales` | Create sale. | sale header, items, payments, installments. | Sale invoice. | `sale.create`; stock/period/math; idempotent. |
| GET `/api/sales` | List sales. | filters, page, limit, sort. | Paginated sales. | `sale.view`; branch scope. |
| GET `/api/sales/report` | Sales report. | date/branch/customer filters. | Report totals/details. | `report.sales.view`. |
| GET `/api/sales/top-products` | Top products. | date/branch/limit. | Product ranking. | `report.sales.view`. |
| GET `/api/sales/currency/exchange-rates` | Sale exchange rates. | None or date/currency. | Rates. | `currency.view`. |
| POST `/api/sales/currency/convert` | Convert amount. | amount, from, to. | Converted amount. | Positive amount; valid currencies. |
| POST `/api/sales/draft` | Save sale draft. | draft cart. | Draft. | `sale.draft.create`; no stock effect. |
| DELETE `/api/sales/drafts/old` | Delete old drafts. | age/cutoff. | Cleanup result. | Admin/job permission. |
| POST `/api/sales/draft/:id/complete` | Complete draft. | payment/final fields. | Sale. | `sale.create`; full sale validation. |
| GET `/api/sales/:id` | Sale detail. | id. | Sale with items/payments/returns. | `sale.view`; branch scope. |
| POST `/api/sales/:id/cancel` | Cancel sale. | reason. | Canceled sale. | `sale.cancel`; reversals; idempotent with same reason. |
| DELETE `/api/sales/:id` | Delete/soft-delete sale. | reason. | Success. | `sale.delete`; prefer cancel; audit. |
| POST `/api/sales/:id/restore` | Restore sale. | reason. | Restored sale. | `sale.restore`; stock/period validation. |
| POST `/api/sales/:id/return` | Return sale items. | items, refundMethod, reason. | Return. | `sale.return`; quantities <= returnable; idempotent. |
| POST `/api/sales/:saleId/payment` | Add sale payment. | amount, currency, method, cashbox/ref. | Payment and updated sale. | `payment.create`; amount valid; idempotent. |
| DELETE `/api/sales/:saleId/payments/:paymentId` | Delete/reverse sale payment. | reason. | Updated sale. | `payment.delete`; period/permission. |
| GET `/api/installments/:id/actions` | Installment action history. | installment id. | Actions. | `installment.view`. |
| POST `/api/installments/:id/actions` | Perform installment action. | actionType, amount, dueDate, note. | Installment/action. | `installment.action`; state-machine validation. |
| GET `/api/collections/overdue` | Overdue collections. | date/asOf, page, branch. | Overdue list. | `collections.view`. |
| GET `/api/collections/customer/:customerId` | Customer collection view. | customer id. | Debt/installments/actions. | `collections.view`. |
| POST `/api/expenses` | Create expense. | branchId, category, amount, currency, date, cashboxId, note. | Expense. | `expense.create`; open period; idempotent. |
| GET `/api/expenses` | List expenses. | date/branch/category/page. | Expenses. | `expense.view`. |
| GET `/api/expenses/summary` | Expense summary. | date/branch/category. | Summary. | `expense.view`/report permission. |
| GET `/api/expenses/:id` | Expense detail. | id. | Expense. | `expense.view`. |
| PUT `/api/expenses/:id` | Update expense. | fields. | Expense. | `expense.update`; period and reversal delta. |
| DELETE `/api/expenses/:id` | Delete/reverse expense. | reason. | Success. | `expense.delete`; audit. |
| POST `/api/recurring-expenses` | Create recurring expense. | schedule, amount, category, cashbox. | Schedule. | `recurring_expense.manage`. |
| GET `/api/recurring-expenses` | List recurring expenses. | active/page. | Schedules. | `recurring_expense.view`. |
| POST `/api/recurring-expenses/run` | Run due recurring expenses. | optional asOf. | Job summary. | `recurring_expense.run`; idempotent by period. |
| GET `/api/recurring-expenses/:id` | Recurring expense detail. | id. | Schedule. | `recurring_expense.view`. |
| PUT `/api/recurring-expenses/:id` | Update recurring expense. | fields. | Schedule. | `recurring_expense.manage`. |
| PATCH `/api/recurring-expenses/:id/active` | Activate/deactivate schedule. | isActive. | Schedule. | `recurring_expense.manage`. |
| DELETE `/api/recurring-expenses/:id` | Delete schedule. | id. | Success. | `recurring_expense.manage`. |
| GET `/api/suppliers` | List suppliers. | page, limit, search, active. | Suppliers. | `supplier.view`. |
| GET `/api/suppliers/:id` | Supplier detail. | id. | Supplier. | `supplier.view`. |
| GET `/api/suppliers/:id/debts` | Supplier debt. | id. | Debt summary. | `supplier.debt.view`. |
| GET `/api/suppliers/:id/statement` | Supplier statement. | date filters. | Statement. | `supplier.statement.view`. |
| GET `/api/suppliers/:id/products` | Supplier products. | id, date. | Product purchase history. | `supplier.view`. |
| POST `/api/suppliers` | Create supplier. | name, phone, address. | Supplier. | `supplier.manage`; idempotent. |
| PUT `/api/suppliers/:id` | Update supplier. | fields. | Supplier. | `supplier.manage`. |
| DELETE `/api/suppliers/:id` | Delete/deactivate supplier. | id. | Success. | `supplier.delete`; block active debt. |
| GET `/api/purchases` | List purchases. | filters/page. | Purchases. | `purchase.view`. |
| GET `/api/purchases/:id` | Purchase detail. | id. | Purchase with items/payments/returns. | `purchase.view`. |
| POST `/api/purchases` | Create purchase. | invoice header/items/payment. | Purchase. | `purchase.create`; stock/period/math; idempotent. |
| POST `/api/purchases/:id/payments` | Add purchase payment. | amount, source, currency. | Updated purchase. | `purchase.payment.create`; amount <= remaining. |
| POST `/api/purchases/:id/returns` | Return purchase items. | items, reason/refund handling. | Purchase return. | `purchase.return`; stock availability. |
| POST `/api/purchases/:id/cancel` | Cancel purchase. | reason. | Canceled purchase. | `purchase.cancel`; no consumed stock unless handled. |
| GET `/api/treasury/cashboxes` | List cashboxes. | branch/active. | Cashboxes. | `treasury.view`. |
| GET `/api/treasury/cashboxes/:id` | Cashbox detail. | id. | Cashbox. | `treasury.view`. |
| GET `/api/treasury/cashboxes/:id/ledger` | Cashbox ledger. | date/page. | Ledger entries. | `treasury.view`. |
| POST `/api/treasury/cashboxes` | Create cashbox. | name, branchId, balances, glAccount. | Cashbox. | `treasury.manage`. |
| PUT `/api/treasury/cashboxes/:id` | Update cashbox. | fields. | Cashbox. | `treasury.manage`. |
| POST `/api/treasury/cashboxes/:id/set-default` | Set default cashbox. | branch scope. | Cashbox. | `treasury.manage`; one default. |
| GET `/api/treasury/bank-accounts` | List bank accounts. | active/currency. | Accounts. | `treasury.view`. |
| POST `/api/treasury/bank-accounts` | Create bank account. | bank/account fields. | Bank account. | `treasury.manage`. |
| PUT `/api/treasury/bank-accounts/:id` | Update bank account. | fields. | Bank account. | `treasury.manage`. |
| GET `/api/treasury/transfers` | List treasury transfers. | filters/page. | Transfers. | `treasury.view`. |
| POST `/api/treasury/transfers` | Create treasury transfer. | source, destination, amount, currency. | Transfer. | `treasury.transfer.create`; idempotent. |
| POST `/api/treasury/transfers/:id/cancel` | Cancel treasury transfer. | reason. | Transfer. | `treasury.transfer.cancel`; reversal. |
| GET `/api/vouchers` | List vouchers. | type/date/party/page. | Vouchers. | `voucher.view`. |
| GET `/api/vouchers/:id` | Voucher detail. | id. | Voucher. | `voucher.view`. |
| POST `/api/vouchers/receipt` | Create receipt voucher. | amount, party/source, cashbox/bank. | Voucher. | `voucher.create`; idempotent. |
| POST `/api/vouchers/payment` | Create payment voucher. | amount, party/source, cashbox/bank. | Voucher. | `voucher.create`; idempotent. |
| POST `/api/vouchers/:id/cancel` | Cancel voucher. | reason. | Voucher. | `voucher.cancel`; reversal. |
| GET `/api/accounting-periods` | List periods. | scope/date/status/page. | Periods. | `accounting_period.view`. |
| GET `/api/accounting-periods/current` | Current open period. | branch/scope. | Period. | `accounting_period.view`. |
| GET `/api/accounting-periods/:id` | Period detail. | id. | Period/snapshot metadata. | `accounting_period.view`. |
| POST `/api/accounting-periods` | Create/open period. | type, scope, dates. | Period. | `accounting_period.create`; no overlap. |
| POST `/api/accounting-periods/:id/close` | Close period. | close options. | Closed period/snapshot. | `accounting_period.close`; reconciliations. |
| GET `/api/gl/accounts` | List chart accounts. | active/type/search. | Accounts. | `gl.account.view`. |
| POST `/api/gl/accounts` | Create account. | code, name, type, parent, postable. | Account. | `gl.account.manage`; code unique. |
| PUT `/api/gl/accounts/:id` | Update account. | fields. | Account. | `gl.account.manage`; protect used account constraints. |
| DELETE `/api/gl/accounts/:id` | Delete/deactivate account. | id. | Success. | `gl.account.manage`; block journal usage. |
| GET `/api/gl/templates` | List GL templates. | None. | Templates. | `gl.account.view`. |
| POST `/api/gl/templates/seed` | Seed GL templates. | template key/options. | Seed result. | `gl.account.manage`; idempotent. |
| GET `/api/gl/system-accounts` | System account mappings. | None. | Mappings. | `gl.account.view`. |
| PUT `/api/gl/system-accounts` | Update system mappings. | key/accountId mappings. | Mappings. | `gl.account.manage`; accounts postable/active. |
| GET `/api/gl/journal` | List journals. | date/status/source/page. | Journal entries. | `gl.journal.view`. |
| GET `/api/gl/journal/:id` | Journal detail. | id. | Journal with lines. | `gl.journal.view`. |
| POST `/api/gl/journal` | Create manual journal. | date, lines, description. | Journal. | `gl.journal.create`; balanced debit/credit. |
| POST `/api/gl/journal/:id/reverse` | Reverse journal. | reason/date. | Reversal journal. | `gl.journal.reverse`; idempotent. |
| GET `/api/gl/posting-failures` | List GL posting failures. | status/source/page. | Failures. | `gl.posting_failure.view`. |
| POST `/api/gl/posting-failures/:id/repost` | Repost failure. | optional options. | Result. | `gl.posting_failure.manage`; source valid. |
| POST `/api/gl/posting-failures/:id/ignore` | Ignore failure. | reason. | Failure updated. | `gl.posting_failure.manage`; audit. |
| GET `/api/reports/financial/trial-balance` | Trial balance. | date/period/branch. | Report. | `financial_report.view`. |
| GET `/api/reports/financial/general-ledger` | General ledger report. | account/date/branch. | Report. | `financial_report.view`. |
| GET `/api/reports/financial/account-statement` | Account statement. | accountId/date. | Report. | `financial_report.view`. |
| GET `/api/reports/financial/income-statement` | Income statement. | period/date/branch. | Report. | `financial_report.view`. |
| GET `/api/reports/financial/balance-sheet` | Balance sheet. | asOf/branch. | Report. | `financial_report.view`. |
| GET `/api/opening-balances/status` | Opening balance status. | None/scope. | Status. | `opening_balance.view`. |
| POST `/api/opening-balances/customer` | Create customer opening balance. | customerId, amount, currency, date. | Result. | `opening_balance.manage`. |
| POST `/api/opening-balances/supplier` | Create supplier opening balance. | supplierId, amount, currency, date. | Result. | `opening_balance.manage`. |
| POST `/api/opening-balances/generate-entry` | Generate opening journal. | scope/options. | Journal/result. | `opening_balance.manage`; balanced. |
| GET `/api/sales-channels` | List sales channels. | active/search. | Channels. | `sales_channel.view`. |
| POST `/api/sales-channels` | Create sales channel. | code, name, color, icon. | Channel. | `sales_channel.manage`; code unique. |
| GET `/api/sales-channels/:id` | Channel detail. | id. | Channel. | `sales_channel.view`. |
| PUT `/api/sales-channels/:id` | Update channel. | fields. | Channel. | `sales_channel.manage`. |
| DELETE `/api/sales-channels/:id` | Delete/deactivate channel. | id. | Success. | `sales_channel.delete`; block orders or deactivate. |
| POST `/api/online-orders` | Create online order. | customer/contact, channel, items, totals. | Order. | `online_order.create`; idempotent. |
| GET `/api/online-orders` | List online orders. | status/channel/date/page/search. | Orders. | `online_order.view`. |
| GET `/api/online-orders/:id` | Order detail. | id. | Order with items/history. | `online_order.view`. |
| PUT `/api/online-orders/:id` | Update order. | fields/items. | Order. | `online_order.update`; state constraints. |
| PATCH `/api/online-orders/:id/status` | Change order status. | status, note. | Order/history. | `online_order.update`; state-machine validation. |
| POST `/api/online-orders/:id/return` | Return online order. | items/reason. | Return result. | `online_order.return`. |
| POST `/api/online-orders/:id/convert` | Convert order to sale. | sale options/payment. | Sale/order. | `online_order.convert`; stock/period; idempotent. |
| DELETE `/api/online-orders/:id` | Delete order. | reason. | Success. | `online_order.delete`; state constraints. |
| GET `/api/delivery/providers` | List providers. | active. | Providers. | `delivery_provider.view`; secrets masked. |
| GET `/api/delivery/providers/active` | Active providers. | None. | Providers. | `delivery_provider.view`. |
| GET `/api/delivery/providers/:id` | Provider detail. | id. | Provider. | `delivery_provider.view`; secrets masked. |
| PUT `/api/delivery/providers/:id` | Update provider. | config/credentials/status. | Provider. | `delivery_provider.manage`; encrypt credentials. |
| POST `/api/delivery/providers/:id/test` | Test provider. | optional test payload. | Test result. | `delivery_provider.manage`; logs safe. |
| POST `/api/delivery/providers/:id/default` | Set default provider. | None. | Provider. | `delivery_provider.manage`; one default. |
| POST `/api/delivery/shipments` | Create shipment. | source, provider, recipient, COD/options. | Shipment. | `delivery.shipment.create`; provider idempotency. |
| POST `/api/delivery/shipments/resend` | Resend shipment. | shipmentId or source. | Shipment/result. | `delivery.shipment.create`; state validation. |
| POST `/api/delivery/quote` | Get delivery quote. | address/provider/package. | Quote. | `delivery.shipment.view`; provider errors mapped. |
| GET `/api/delivery/shipments` | List shipments. | status/provider/date/page. | Shipments. | `delivery.shipment.view`. |
| GET `/api/delivery/shipments/:id` | Shipment detail. | id. | Shipment/events. | `delivery.shipment.view`. |
| POST `/api/delivery/shipments/:id/sync` | Sync shipment. | id. | Updated shipment. | `delivery.shipment.sync`; provider logs. |
| POST `/api/delivery/shipments/:id/cancel` | Cancel shipment. | reason. | Shipment. | `delivery.shipment.cancel`; provider state. |
| GET `/api/delivery/shipments/:id/label` | Get label. | id. | PDF/image/label metadata. | `delivery.shipment.view`; file response. |
| GET `/api/delivery/webhook-logs` | Webhook logs. | provider/date/status/page. | Logs. | `delivery.webhook.view`. |
| GET `/api/delivery/action-logs` | Provider action logs. | provider/action/date/page. | Logs. | `delivery.action_log.view`. |
| POST `/api/delivery/webhooks/:providerCode` | Provider webhook. | provider payload/signature. | Accepted/result. | Signature validation; rate limit; idempotent event processing. |
| GET `/api/notifications/settings` | Notification settings. | None. | Settings masked. | `notification.view`. |
| PUT `/api/notifications/settings` | Update notification settings. | provider/channel/template config. | Settings. | `notification.manage`; encrypt secrets. |
| POST `/api/notifications/settings/test` | Test notification settings. | recipient/channel/message. | Test result. | `notification.manage`; rate-limited. |
| POST `/api/notifications/send/customer` | Send customer notification. | customerId, template/message, channel. | Notification. | `notification.send`; idempotent. |
| POST `/api/notifications/send/bulk` | Send bulk notifications. | audience/filter/message/channel. | Batch result. | `notification.send_bulk`; caps/rate limit. |
| GET `/api/notifications` | List notifications. | status/channel/customer/date/page. | Notifications. | `notification.view`. |
| GET `/api/notifications/:id/logs` | Notification logs. | id. | Logs. | `notification.view`. |
| POST `/api/notifications/:id/retry` | Retry notification. | id. | Notification. | `notification.retry`; state validation. |
| POST `/api/notifications/process-now` | Process queue. | optional limit. | Job summary. | `notification.manage`; idempotent job. |
| POST `/api/notifications/scan-overdue` | Generate overdue notifications. | asOf/options. | Job summary. | `collections.manage`/`notification.manage`; dedupe. |
| GET `/api/reports/dashboard` | Dashboard metrics. | date/branch. | Dashboard. | `report.dashboard.view`. |
| GET `/api/reports/quick/sales` | Quick sales report window. | from, to, branchId, userId, page, limit, search. | Sales quick report. | `sales:read`; branch/user scoped. |
| GET `/api/reports/quick/profit` | Quick profit report window. | from, to, branchId, userId, page, limit, search. | Profit quick report. | `reports:read_profit`; branch/user scoped. |
| GET `/api/reports/quick/top-products` | Quick top-products report window. | from, to, branchId, userId, page, limit, search. | Top product ranking. | `reports:read_profit`; branch/user scoped. |
| GET `/api/reports/quick/debts` | Quick customer debts report window. | from, to, branchId, userId, page, limit, search. | Debt report. | `sales:read`; branch/user scoped. |
| GET `/api/reports/quick/cash-box` | Quick cashbox report window. | from, to, branchId, userId, page, limit, search. | Cashbox report. | `reports:read_financial`; branch/user scoped. |
| GET `/api/reports/quick/expenses` | Quick expenses report window. | from, to, branchId, userId, page, limit, search. | Expense report. | `view:expenses`; branch/user scoped. |
| GET `/api/reports/quick/cash-movement` | Quick cash movement report window. | from, to, branchId, userId, page, limit, search. | Cash movement report. | `reports:read_financial`; branch/user scoped. |
| GET `/api/reports/export/excel` | Excel export. | report type and filters. | XLSX file. | Report permission; export caps. |
| GET `/api/reports/export/pdf` | PDF export. | report type and filters. | PDF file. | Report permission; export caps. |
| GET `/api/reports/aging` | Aging report. | asOf/branch/customer. | Aging. | `report.aging.view`. |
| GET `/api/reports/profit` | Profit report. | date/branch/product. | Profit. | `report.profit.view`. |
| GET `/api/reports/inventory-valuation` | Inventory valuation. | asOf/warehouse/category. | Valuation. | `report.inventory.view`. |
| GET `/api/reports/online-commerce/widgets` | Online widgets. | date/channel. | Metrics. | `online_report.view`. |
| GET `/api/reports/online-commerce/overview` | Online overview. | filters. | Report. | `online_report.view`. |
| GET `/api/reports/online-commerce/profit` | Online profit. | filters. | Report. | `online_report.view`. |
| GET `/api/reports/delivery/overview` | Delivery overview. | filters. | Report. | `delivery_report.view`. |
| GET `/api/reports/delivery/by-provider` | Delivery by provider. | filters. | Report. | `delivery_report.view`. |
| GET `/api/reports/delivery/by-status` | Delivery by status. | filters. | Report. | `delivery_report.view`. |
| GET `/api/reports/delivery/by-date` | Delivery by date. | filters. | Report. | `delivery_report.view`. |
| GET `/api/reports/delivery/late` | Late shipments. | filters. | Report. | `delivery_report.view`. |
| GET `/api/reports/delivery/cost` | Delivery cost. | filters. | Report. | `delivery_report.view`. |
| GET `/api/audit` | List audit logs. | filters/page. | Audit logs. | `audit.view`; pagination required. |
| GET `/api/audit/actions` | List audit action types. | None. | Actions. | `audit.view`. |
| DELETE `/api/audit/purge` | Purge old audit logs. | cutoff/confirmation. | Purge result. | `audit.purge`; audit the purge. |
| GET `/api/backup` | List backups. | None/page. | Backups. | `backup.view`. |
| POST `/api/backup` | Create backup. | options. | Backup metadata. | `backup.create`; long-running safe; idempotent by request id. |
| POST `/api/backup/:filename/restore` | Restore backup. | confirmation/options. | Restore result. | `backup.restore`; destructive; validate filename safely. |
| DELETE `/api/backup/:filename` | Delete backup. | filename. | Success. | `backup.delete`; path traversal guard. |
| GET `/api/settings/backups/groups` | List backup data groups. | None. | Groups. | `backup.view`. |
| POST `/api/settings/backups/create` | Create grouped/data backup. | group/options. | Backup metadata. | `backup.create`. |
| POST `/api/settings/backups/preview` | Preview restore. | backup/group/options. | Preview diff. | `backup.restore`; no mutation. |
| POST `/api/settings/backups/restore` | Restore grouped data. | backup/group/options/confirmation. | Restore result. | `backup.restore`; destructive by scope. |
| POST `/api/jobs/credit-scoring/run` | Run credit scoring job. | optional `sync=1` query. | Job started message or sync job summary. | `settings:manage`; idempotent scope recommended. |
| GET `/api/setup/status` | Setup status. | None. | Status. | Public-safe or admin. |
| GET `/api/setup/diagnostics` | Setup diagnostics. | None. | Diagnostic checks. | Admin/setup; redact secrets. |
| POST `/api/reset/database` | Reset database. | confirmation. | Reset result. | Owner only; production guard; destructive. |
| GET `/api/tunnel/status` | Remote access status. | None. | Status. | `remote_access.view`. |
| POST `/api/tunnel/enable` | Enable remote access. | options. | Tunnel info. | `remote_access.manage`; audit. |
| POST `/api/tunnel/disable` | Disable remote access. | None. | Status. | `remote_access.manage`; audit. |
| GET `/api/alerts` | List alerts. | status/type/page. | Alerts. | `alert.view`. |
| GET `/api/alerts/ws` | Alert websocket. | auth/session. | Stream. | Auth required; heartbeat and reconnect contract. |
| GET `/debug/debug/health` | Dev debug health. | None. | Debug data. | Development only; must be disabled/protected in production. |
| GET `/debug/debug/stats` | Dev debug stats. | None. | Stats. | Development only. |
| GET `/debug/debug/queries` | Dev query logs. | filters. | Queries. | Development only; can expose sensitive data. |
| GET `/debug/debug/queries/print` | Print query logs. | None. | Debug output. | Development only. |
| POST `/debug/debug/queries/reset` | Reset debug query logs. | None. | Success. | Development only. |
| GET `/debug/debug/config` | Debug config. | None. | Config. | Development only; secrets redacted. |
| GET `/debug/debug/routes` | Debug route list. | None. | Routes. | Development only. |
| POST `/debug/debug/log` | Write debug log. | message/payload. | Success. | Development only. |
| GET `/debug/debug/error` | Trigger test error. | None. | Error. | Development only. |

### 5.3 Required API Examples

Every maintained endpoint must include at least one success and one failure example in the developer API reference. Minimum examples:

```json
{
  "request": {
    "method": "POST",
    "path": "/api/sales",
    "headers": {
      "Content-Type": "application/json",
      "Idempotency-Key": "sale-branch1-terminal2-20260623-00001"
    },
    "body": {
      "customerId": 12,
      "branchId": 1,
      "warehouseId": 1,
      "currency": "IQD",
      "items": [
        { "productId": 44, "quantity": 2, "unitPrice": 15000 }
      ],
      "payments": [
        { "amount": 30000, "paymentMethod": "cash", "cashboxId": 1 }
      ]
    }
  },
  "successResponse": {
    "success": true,
    "data": {
      "id": 901,
      "invoiceNumber": "S-2026-000901",
      "paymentStatus": "paid"
    }
  },
  "failureResponse": {
    "success": false,
    "error": {
      "code": "INV_INSUFFICIENT_STOCK",
      "message": "Insufficient stock for one or more items.",
      "fields": { "items[0].productId": "Available quantity is 1." }
    }
  }
}
```

## 6. Database Specification

### 6.1 Database-Wide Rules

| Concern | Specification |
|---|---|
| Primary keys | Every table uses stable primary key `id` unless a join/reference table explicitly defines otherwise. |
| Timestamps | Mutable business tables include `createdAt` and `updatedAt`; transactional history tables include at least `createdAt`. |
| Soft delete | Reference/master data should use `isActive` or status instead of hard delete when historical records exist. Transactional records use status/cancel/reversal instead of hard delete. |
| Audit | Sensitive writes create `audit_log` rows; tables also store createdBy/updatedBy where already modeled. |
| History | Status-changing entities store history tables where needed, for example online order status history and delivery events. |
| Archiving | High-growth logs and movements should be archived by date after operational retention while retaining reports/snapshots. |
| Indexing | Foreign keys, document numbers, normalized phone, SKU/barcode, status, createdAt, date filters, branchId, warehouseId, customerId, supplierId, productId require indexes. |
| Constraints | Financial values non-negative unless domain allows signed deltas; quantities positive for lines; journal debit/credit balanced at application and database where possible. |
| Growth | Sales, sale_items, stock_movements, audit_log, notifications, delivery logs, and journal lines are high-growth and need pagination and archiving strategy. |

### 6.2 Table Specification Matrix

| Table | Purpose | Key columns | Relationships | Indexes/constraints | Soft delete/audit/history/archive/growth |
|---|---|---|---|---|---|
| users | Staff accounts. | id, username, password, fullName, phone, role, assignedBranchId, assignedWarehouseId, isActive, createdAt, updatedAt. | assignedBranchId -> branches; assignedWarehouseId -> warehouses; user_branches. | unique username; index role/isActive/branch. | `isActive`; user admin changes audited; medium growth. |
| user_branches | Many-to-many branch scope. | id, userId, branchId, createdAt. | userId -> users; branchId -> branches. | unique userId+branchId; indexes both FKs. | Hard delete acceptable with audit on assignment change; low growth. |
| permissions | RBAC permission catalog. | id, key, nameAr, descriptionAr, groupAr, isActive, sortOrder, createdAt. | role_permissions. | unique key; index group/isActive. | `isActive`; seed changes controlled; low growth. |
| roles | RBAC roles. | id, code, nameAr, descriptionAr, scope, isSystem, allPermissions, isActive, createdAt, updatedAt. | role_permissions; users by role. | unique code; protect system roles. | `isActive`; role changes audited; low growth. |
| role_permissions | Role-permission assignments. | id, roleId, permissionId, createdAt. | roleId -> roles; permissionId -> permissions. | unique roleId+permissionId. | Assignment changes audited; low/medium growth. |
| branches | Business locations. | id, name, address, defaultWarehouseId, isActive, createdAt, updatedAt. | defaultWarehouseId -> warehouses; warehouses, users, transactions. | unique-ish name; index isActive. | `isActive`; branch changes audited; low growth. |
| warehouses | Inventory locations. | id, name, branchId, isActive, createdAt, updatedAt. | branchId -> branches; stock, movements, transfers. | unique branchId+name; index branchId/isActive. | `isActive`; low growth. |
| categories | Product categories. | id, name, description, isActive, createdAt, updatedAt, createdBy. | products. | unique name where feasible; index isActive. | `isActive`; low growth. |
| products | Product master. | id, name, sku, barcode, categoryId, description, costPrice, sellingPrice, currency, stock, minStock, productType, isActive, createdAt, updatedAt. | categoryId -> categories; units, stock, items. | unique sku/barcode when not null; index categoryId/isActive/name. | `isActive`; changes audited; medium growth. |
| product_units | Unit conversions. | id, productId, name, conversionFactor, isBase, isDefaultSale, isDefaultPurchase, createdAt, updatedAt. | productId -> products. | unique productId+name; one base unit per product; conversionFactor > 0. | Usually active flag preferred if added; low/medium growth. |
| product_stock | Current stock balance. | id, productId, warehouseId, quantity, updatedAt. | productId -> products; warehouseId -> warehouses. | unique productId+warehouseId; index warehouseId/productId. | No soft delete; rebuilt from movements/entries if needed; high read. |
| product_stock_entries | Cost/lot stock layers. | id, productId, warehouseId, quantity, remainingQuantity, unitCost, sourceType, sourceId, expiresAt, createdAt. | product/warehouse; source points to purchase/adjustment/return. | index productId+warehouseId+remainingQuantity; expiresAt. | Append-only except remainingQuantity; high growth; archive closed zero layers after retention. |
| stock_movements | Inventory ledger. | id, productId, warehouseId, accountingPeriodId, movementType, quantity, previousQuantity, newQuantity, reason, sourceType, sourceId, createdBy, createdAt. | product, warehouse, accountingPeriod. | index productId, warehouseId, sourceType+sourceId, createdAt. | Append-only; never hard delete; high growth; archive by period/date. |
| warehouse_transfers | Transfer requests. | id, branchId, fromWarehouseId, toWarehouseId, productId, quantity, status, requestedBy, approvedBy, rejectedBy, createdAt, updatedAt. | branch, warehouses, product, users. | index status, branchId, warehouses, productId. | Status history desirable; medium growth. |
| accounting_periods | Open/closed periods. | id, type, scopeType, branchId, status, openedAt, endsAt, closedAt, openedBy, closedBy, createdAt, updatedAt. | branch, users, transactional docs. | no overlapping open period per scope; index status/scope/dates. | Status-driven; changes audited; low growth. |
| accounting_period_report_snapshots | Close snapshots. | id, accountingPeriodId, branchId, snapshotJson, createdAt. | accountingPeriod -> accounting_periods; branch. | unique period+branch if applicable. | Append-only; archive with closed periods; medium JSON growth. |
| sales | Sale invoices. | id, invoiceNumber, customerId, branchId, warehouseId, accountingPeriodId, subtotal, discount, total, paidAmount, remainingAmount, paymentStatus, status, saleType, currency, exchangeRate, notes, createdBy, createdAt, updatedAt. | customer, branch, warehouse, period; items/payments/installments/returns. | unique invoiceNumber; index customerId, branchId, warehouseId, status, createdAt. | Status/cancel not hard delete; high growth; archive by period after retention. |
| invoice_sequences | Sale invoice numbering. | id, branchId, year, nextValue, updatedAt. | branch. | unique branchId+year; row locking for generation. | Low growth; audit sequence resets. |
| sale_items | Sale lines. | id, saleId, productId, productName, productSku, barcode, quantity, unitPrice, discount, total, cost, unitId, unitName, conversionFactor, createdAt. | saleId -> sales; productId -> products; unitId -> product_units. | index saleId/productId. | Append-only; high growth; archive with sales. |
| sale_item_stock_entries | Sale stock layer consumption. | id, saleItemId, productStockEntryId, quantity, createdAt. | sale item, stock entry. | index saleItemId, productStockEntryId. | Append-only; high growth. |
| payments | Customer sale payments. | id, saleId, customerId, amount, currency, exchangeRate, paymentMethod, paymentRef, cashboxId, createdBy, createdAt. | sale, customer, cashbox. | index saleId/customerId/cashboxId/createdAt. | Reverse/delete via audited action; high growth. |
| installments | Installment schedule. | id, saleId, customerId, installmentNumber, dueAmount, paidAmount, remainingAmount, dueDate, status, createdAt, updatedAt. | sale, customer, installment_actions. | unique saleId+installmentNumber; index customerId/status/dueDate. | Status history via actions; medium/high growth. |
| installment_actions | Installment action log. | id, installmentId, customerId, saleId, userId, actionType, amount, note, createdAt. | installment, customer, sale, user. | index installmentId/customerId/actionType/createdAt. | Append-only; medium growth. |
| sale_returns | Sale return headers. | id, saleId, customerId, branchId, warehouseId, accountingPeriodId, returnNumber, totalRefund, refundMethod, reason, createdBy, createdAt. | sale, customer, branch, warehouse, period. | unique returnNumber; index saleId/customerId/createdAt. | Append-only or reversed; medium growth. |
| sale_return_items | Sale return lines. | id, returnId, saleItemId, productId, productName, quantity, unitPrice, refundAmount, createdAt. | return, sale item, product. | index returnId/saleItemId/productId. | Append-only; medium growth. |
| customers | Customer master. | id, name, phone, normalizedPhone, address, city, notes, customerType, creditLimit, totalDebt, totalPurchases, isActive, createdAt, updatedAt. | sales, payments, installments, credit, notifications. | index normalizedPhone, name, isActive, totalDebt. | `isActive`; customer changes audited; medium growth. |
| credit_events | Customer credit event ledger. | id, customerId, saleId, eventType, amount, delayDays, createdAt. | customer, sale. | index customerId/eventType/createdAt. | Append-only; high-ish growth. |
| credit_snapshots | Credit derived snapshots. | id, customerId, snapshotDate, aggregate debt/payment fields, createdAt. | customer. | unique customerId+snapshotDate; index snapshotDate. | Rebuildable derived table; archive old snapshots. |
| credit_scores | Credit risk scores. | id, customerId, modelVersion, riskProbability, riskLevel, score, factorsJson, createdAt. | customer. | index customerId/modelVersion/createdAt. | Derived/history; archive by retention. |
| suppliers | Supplier master. | id, name, phone, normalizedPhone, address, city, notes, totalPurchases, totalDebt, isActive, createdAt, updatedAt. | purchases/vouchers. | index normalizedPhone/name/isActive. | `isActive`; audited; medium growth. |
| purchase_invoices | Supplier invoices. | id, invoiceNumber, supplierId, supplierInvoiceNumber, branchId, warehouseId, accountingPeriodId, subtotal, discount, total, paidAmount, remainingAmount, status, createdBy, createdAt, updatedAt. | supplier, branch, warehouse, period; items/returns. | unique invoiceNumber; index supplierId/branchId/status/createdAt. | Status/cancel; high growth. |
| purchase_items | Purchase lines. | id, purchaseInvoiceId, productId, productName, productSku, quantity, unitCost, total, warehouseId, createdAt. | purchase invoice, product, warehouse. | index purchaseInvoiceId/productId/warehouseId. | Append-only; high growth. |
| purchase_returns | Purchase return header. | id, purchaseInvoiceId, supplierId, branchId, warehouseId, accountingPeriodId, returnNumber, totalRefund, reason, createdBy, createdAt. | purchase, supplier, branch, warehouse, period. | unique returnNumber; index purchaseInvoiceId/supplierId. | Append-only/reversal; medium growth. |
| purchase_return_items | Purchase return lines. | id, returnId, purchaseItemId, productId, quantity, unitCost, refundAmount, createdAt. | purchase return, purchase item, product. | index returnId/purchaseItemId/productId. | Append-only; medium growth. |
| expenses | Expense records. | id, branchId, accountingPeriodId, category, amount, currency, note, date, cashboxId, createdBy, createdAt, updatedAt. | branch, period, cashbox, user. | index branchId/category/date/cashboxId. | Reversal/delete audited; medium/high growth. |
| recurring_expenses | Scheduled expenses. | id, branchId, name, category, amount, currency, note, frequency, nextRunAt, isActive, createdAt, updatedAt. | branch. | index branchId/isActive/nextRunAt. | `isActive`; low growth. |
| cashboxes | Cash containers. | id, name, branchId, isDefault, openingBalancesJson, glAccountId, balancesJson, isActive, createdAt, updatedAt. | branch, account, vouchers/payments/expenses. | unique branchId+name; one default per branch; index isActive. | `isActive`; audited; low growth. |
| bank_accounts | Bank containers. | id, name, bankName, accountNumber, iban, currency, openingBalance, glAccountId, isActive, createdAt, updatedAt. | account; vouchers/transfers. | index currency/isActive; optional unique accountNumber/iban. | `isActive`; audited; low growth. |
| vouchers | Receipt/payment documents. | id, voucherNumber, voucherType, branchId, accountingPeriodId, cashboxId, bankAccountId, amount, currency, partyType, partyId, sourceType, sourceId, note, status, createdBy, createdAt. | branch, period, cashbox/bank, party/source. | unique voucherNumber; index type/date/party/source/status. | Status cancel/reversal; high growth. |
| treasury_transfers | Internal money transfers. | id, transferNumber, fromCashboxId, fromBankAccountId, toCashboxId, toBankAccountId, amount, currency, status, createdBy, createdAt. | cashboxes/bank accounts, user. | unique transferNumber; index source/destination/status/date. | Status cancel; medium growth. |
| document_sequences | General document numbers. | id, docType, branchId, year, nextValue, updatedAt. | branch. | unique docType+branchId+year; locking. | Low growth; sequence changes audited. |
| accounts | Chart of accounts. | id, code, name, accountType, parentId, level, isPostable, isActive, createdAt, updatedAt. | self parent; journal lines; system accounts. | unique code; index parentId/type/isActive. | `isActive`; block delete with journals. |
| system_accounts | Operational-to-GL mappings. | id, key, accountId, description, updatedAt, updatedBy. | account, user. | unique key; account active/postable. | Audited; low growth. |
| journal_entries | GL journal headers. | id, entryNumber, entryDate, branchId, accountingPeriodId, sourceType, sourceId, description, status, createdBy, createdAt. | branch, period, lines. | unique entryNumber; index source/date/status. | Posted/reversed status; high growth. |
| journal_entry_lines | GL journal lines. | id, journalEntryId, lineNo, accountId, branchId, debit, credit, description. | journal, account, branch. | unique journalEntryId+lineNo; index accountId/branchId. | Append-only with journal; high growth. |
| gl_posting_failures | Failed accounting postings. | id, sourceType, sourceId, errorMessage, payloadJson, status, retryCount, createdAt, updatedAt. | source documents by type/id. | index status/sourceType/sourceId. | Resolved/ignored status; medium growth. |
| currency_settings | Currency catalog. | id, currencyCode, currencyName, symbol, exchangeRate, isBaseCurrency, isActive, updatedAt. | documents reference currency code. | unique currencyCode; one base currency. | `isActive`; audited changes; low growth. |
| settings | Generic settings. | id, key, value, description, updatedAt, updatedBy. | user. | unique key. | Mask/encrypt sensitive values; low growth. |
| sales_channels | Online sales channels. | id, code, name, isActive, color, icon, createdAt, updatedAt. | online orders. | unique code; index isActive. | `isActive`; low growth. |
| online_orders | Online order header. | id, orderNumber, channelId, customerId, customerName, customerPhone, address, status, total, currency, notes, createdAt, updatedAt. | channel, customer, items/history/shipment/sale. | unique orderNumber; index status/channel/customer/date. | Status/delete; high growth. |
| online_order_items | Online order lines. | id, orderId, productId, productName, productSku, quantity, unitPrice, total, createdAt. | order, product. | index orderId/productId. | Append with order; high growth. |
| online_order_status_history | Order transition history. | id, orderId, fromStatus, toStatus, note, changedBy, createdAt. | order, user. | index orderId/createdAt. | Append-only; high growth. |
| delivery_providers | Delivery integration config. | id, code, name, adapterKey, isActive, isDefault, configJson, credentialsEncrypted, createdAt, updatedAt. | shipments/logs. | unique code; one default active provider. | Secrets encrypted/masked; low growth. |
| delivery_shipments | Shipment records. | id, shipmentNumber, providerId, onlineOrderId, saleId, recipientName, recipientPhone, address, status, trackingNumber, cost, codAmount, createdAt, updatedAt. | provider, order, sale, events/logs. | unique shipmentNumber; index provider/status/tracking/source/date. | Status history through events; high growth. |
| delivery_events | Shipment status events. | id, shipmentId, eventType, status, providerStatus, message, occurredAt, createdAt. | shipment. | index shipmentId/status/occurredAt. | Append-only; high growth; archive old events. |
| delivery_webhook_logs | Provider webhook logs. | id, providerId, providerCode, shipmentId, status, requestPayload, responsePayload, createdAt. | provider, shipment optional. | index provider/status/createdAt. | High growth; archive/redact payloads. |
| delivery_action_logs | Provider action logs. | id, shipmentId, providerId, providerCode, action, requestPayload, responsePayload, status, createdAt. | shipment/provider. | index shipmentId/action/status/date. | High growth; archive/redact payloads. |
| notification_settings | Notification provider/settings. | id, enabled, provider, apiKeyEncrypted, senderId, smsEnabled, whatsappEnabled, createdAt, updatedAt. | notifications. | single active config or provider unique. | Secrets encrypted; low growth. |
| notifications | Notification queue. | id, type, channel, resolvedChannel, recipientPhone, customerId, saleId, templateKey, status, scheduledAt, sentAt, createdAt, updatedAt. | customer, sale, logs. | index status/scheduledAt/customer/channel. | Status lifecycle; high growth. |
| notification_logs | Notification provider logs. | id, notificationId, provider, channel, requestPayload, responsePayload, status, createdAt. | notification. | index notificationId/provider/status/date. | High growth; redact/archive. |
| idempotency_keys | Idempotent write cache. | id, key, scope, userId, response, statusCode, createdAt, expiresAt. | user. | unique key+scope+userId; index expiresAt. | Expire/archive after retention; prevents duplicate effects. |
| audit_log | Security/business audit trail. | id, userId, username, action, resource, resourceId, details, ipAddress, createdAt. | user optional. | index userId/action/resource/createdAt. | Append-only; high growth; purge only by policy and audit. |

## 7. Event Catalog

| Event | Producer | Required payload | Consumers / purpose |
|---|---|---|---|
| UserCreated | User management | userId, role, branch scope | Audit, notifications if enabled. |
| UserUpdated | User management | userId, changedFields | Audit, session invalidation. |
| UserDeactivated | User management | userId, reason | Audit, active session revocation. |
| RoleCreated | RBAC | roleId, code | Audit. |
| RolePermissionsChanged | RBAC | roleId, added/removed permissions | Audit, session refresh. |
| CompanySettingsUpdated | Settings | changedKeys | Audit, UI cache refresh. |
| CurrencyRateUpdated | Currency | currencyCode, oldRate, newRate | Pricing/report cache invalidation. |
| BranchCreated | Branches | branchId | Audit/setup. |
| WarehouseCreated | Warehouses | warehouseId, branchId | Inventory setup. |
| ProductCreated | Catalog | productId, sku | Audit/search index. |
| ProductUpdated | Catalog | productId, changedFields | Search/report refresh. |
| StockAdjusted | Inventory | productId, warehouseId, quantityDelta, movementId | Reports, GL if configured. |
| StockMovementCreated | Inventory | movementId, sourceType, sourceId | Inventory valuation, audit. |
| LowStockDetected | Inventory job | productId, warehouseId, quantity, minStock | Alerts/notifications. |
| TransferRequested | Transfers | transferId, source, target, product, quantity | Approval alerts. |
| TransferApproved | Transfers | transferId, movements | Stock reports, audit. |
| TransferRejected | Transfers | transferId, reason | Audit/alerts. |
| CustomerCreated | Customers | customerId | Audit/search. |
| CustomerUpdated | Customers | customerId, changedFields | Audit. |
| CustomerCreditRecalculated | Credit | customerId, scoreId, riskLevel | Sales eligibility/reporting. |
| CustomerDebtBecameOverdue | Collections | customerId, amount, oldestDueDate | Notifications/collections. |
| SaleDraftCreated | Sales | draftId, userId | Draft cleanup. |
| SaleCreated | Sales | saleId, invoiceNumber, customerId, total, branchId | Stock, GL, audit, notifications. |
| SalePaymentAdded | Payments | paymentId, saleId, amount | Treasury, GL, debt recalculation. |
| SalePaymentReversed | Payments | paymentId, saleId, reason | Treasury, GL, debt recalculation. |
| SaleCanceled | Sales | saleId, reason | Stock restore, GL reversal, audit. |
| SaleRestored | Sales | saleId, reason | Stock/GL reapply, audit. |
| SaleReturned | Returns | returnId, saleId, refundAmount | Stock restore, GL, customer debt. |
| InstallmentCreated | Sales | installmentId, saleId, dueDate, amount | Collections schedule. |
| InstallmentBecameDue | Collections job | installmentId, customerId | Notification scan. |
| InstallmentPaid | Payments | installmentId, amount | Credit score, reports. |
| InstallmentRescheduled | Installments | installmentId, oldDueDate, newDueDate | Audit/notifications. |
| ExpenseCreated | Expenses | expenseId, amount, branchId | Treasury, GL, reports. |
| ExpenseUpdated | Expenses | expenseId, changedFields | Treasury/GL adjustment. |
| ExpenseReversed | Expenses | expenseId, reason | Treasury, GL, audit. |
| RecurringExpenseRunCompleted | Jobs | scheduleId, expenseId, period | Audit/reports. |
| SupplierCreated | Suppliers | supplierId | Audit/search. |
| PurchaseCreated | Purchases | purchaseId, invoiceNumber, supplierId, total | Stock, GL, supplier debt. |
| PurchasePaymentAdded | Purchases | purchaseId, amount | Treasury, GL, supplier debt. |
| PurchaseReturned | Purchases | returnId, purchaseId | Stock, GL, supplier debt. |
| PurchaseCanceled | Purchases | purchaseId, reason | Stock/GL reversal. |
| VoucherCreated | Treasury | voucherId, type, amount, party | Treasury ledger, GL. |
| VoucherCanceled | Treasury | voucherId, reason | Ledger/GL reversal. |
| TreasuryTransferCreated | Treasury | transferId, source, destination, amount | Ledger, GL. |
| TreasuryTransferCanceled | Treasury | transferId, reason | Ledger reversal. |
| AccountingPeriodOpened | Accounting | periodId, scope | Period controls. |
| AccountingPeriodClosingStarted | Accounting | periodId | Close workflow. |
| AccountingPeriodClosed | Accounting | periodId, snapshotId | Reports/archive. |
| JournalEntryPosted | GL | journalEntryId, sourceType, sourceId | Financial reports. |
| JournalEntryReversed | GL | originalJournalId, reversalJournalId | Financial reports/audit. |
| GLPostingFailed | GL | failureId, sourceType, sourceId, error | Admin alerts. |
| GLPostingReposted | GL | failureId, journalEntryId | Audit. |
| SalesChannelCreated | Online commerce | channelId, code | Audit. |
| OnlineOrderCreated | Online orders | orderId, channelId, customer/contact | Fulfillment/notifications. |
| OnlineOrderStatusChanged | Online orders | orderId, fromStatus, toStatus | Delivery/notifications/reporting. |
| OnlineOrderConvertedToSale | Online orders | orderId, saleId | Sales reports. |
| OnlineOrderReturned | Online orders | orderId, return data | Inventory/notifications. |
| DeliveryProviderUpdated | Delivery | providerId, changedFields | Audit. |
| ShipmentCreated | Delivery | shipmentId, providerId, source | Provider action logs/notifications. |
| ShipmentStatusChanged | Delivery | shipmentId, fromStatus, toStatus, providerStatus | Order status, notifications, delivery reports. |
| ShipmentCanceled | Delivery | shipmentId, reason | Order workflow/audit. |
| DeliveryWebhookReceived | Delivery | providerCode, payload hash, shipmentId | Webhook logs/status mapping. |
| NotificationQueued | Notifications | notificationId, channel, recipient | Queue processor. |
| NotificationSent | Notifications | notificationId, providerMessageId | Logs/reports. |
| NotificationFailed | Notifications | notificationId, error, retryCount | Retry/alerts. |
| BackupCreated | Backup | backupId/filename, checksum, version | Audit/retention. |
| BackupRestoreStarted | Backup | filename, userId | Audit/maintenance lock. |
| BackupRestored | Backup | filename, version | Health checks/audit. |
| LicenseStateChanged | License | oldStatus, newStatus, reason | Feature entitlement/UI. |
| RemoteAccessEnabled | Remote access | tunnel id/url metadata | Audit/support. |
| RemoteAccessDisabled | Remote access | tunnel id | Audit. |
| DatabaseResetRequested | Reset | userId, environment | Backup guard/audit. |

## 8. Error Catalog

| Code | HTTP | User message | Cause | Recovery | Severity |
|---|---:|---|---|---|---|
| AUTH_REQUIRED | 401 | Login is required. | Missing/expired session. | Log in again. | Medium |
| AUTH_INVALID_CREDENTIALS | 401 | Username or password is incorrect. | Failed login. | Retry or reset password. | Medium |
| AUTH_INACTIVE_USER | 403 | This user account is inactive. | User disabled. | Admin reactivation. | High |
| AUTH_PERMISSION_DENIED | 403 | You do not have permission for this action. | RBAC denial. | Request role permission. | Medium |
| AUTH_SCOPE_DENIED | 403 | This record is outside your assigned branch or warehouse. | Scope mismatch. | Use assigned scope or admin override. | Medium |
| VALIDATION_FAILED | 422 | Some fields are invalid. | Field validation errors. | Fix fields shown in response. | Low |
| RECORD_NOT_FOUND | 404 | The requested record was not found. | Missing id or scoped out. | Refresh/search again. | Low |
| RECORD_CONFLICT | 409 | The record was changed or conflicts with existing data. | Unique/concurrent conflict. | Refresh and retry. | Medium |
| IDEMPOTENCY_CONFLICT | 409 | This request key was already used with different data. | Same idempotency key, different payload. | Use original payload or new key. | Medium |
| PERIOD_CLOSED | 409 | This operation is blocked because the accounting period is closed. | Mutation in closed period. | Use reversal/correction policy. | High |
| PERIOD_OVERLAP | 409 | Accounting period overlaps another period. | Invalid period date/scope. | Adjust dates/scope. | Medium |
| SEQUENCE_GENERATION_FAILED | 500 | Document number could not be generated. | Sequence lock/db issue. | Retry; support if persistent. | High |
| INV_PRODUCT_INACTIVE | 422 | Product is inactive and cannot be used. | Inactive product in new transaction. | Reactivate or choose another product. | Low |
| INV_WAREHOUSE_INACTIVE | 422 | Warehouse is inactive. | Inactive warehouse selected. | Select active warehouse. | Low |
| INV_INSUFFICIENT_STOCK | 409 | Insufficient stock for one or more items. | Stock below requested quantity. | Reduce quantity or restock. | High |
| INV_NEGATIVE_STOCK_BLOCKED | 409 | Stock cannot become negative. | Adjustment/return/transfer invalid. | Correct quantity. | High |
| INV_TRANSFER_INVALID_STATE | 409 | Transfer cannot be changed from its current status. | Approve/reject non-pending transfer. | Refresh transfer. | Medium |
| SALE_TOTAL_MISMATCH | 422 | Sale totals do not match item totals. | Client/server math mismatch. | Recalculate cart. | Medium |
| SALE_INVALID_STATUS | 409 | Sale cannot perform this action in its current status. | Invalid state transition. | Refresh and follow allowed actions. | Medium |
| SALE_RETURN_EXCEEDS_QUANTITY | 409 | Return quantity exceeds available sold quantity. | Over-return. | Adjust return quantity. | High |
| PAYMENT_AMOUNT_INVALID | 422 | Payment amount is invalid. | Zero/negative/overpayment. | Correct amount. | Medium |
| PAYMENT_REVERSAL_BLOCKED | 409 | Payment cannot be reversed. | Closed period or linked settlement. | Use accounting correction. | High |
| CREDIT_LIMIT_EXCEEDED | 409 | Customer credit limit is exceeded. | Credit check blocks sale. | Collect payment or authorize override. | Medium |
| INSTALLMENT_INVALID_ACTION | 409 | Installment action is not allowed now. | State transition invalid. | Refresh installment and choose valid action. | Medium |
| PURCHASE_TOTAL_MISMATCH | 422 | Purchase totals do not match item totals. | Math mismatch. | Recalculate invoice. | Medium |
| PURCHASE_RETURN_STOCK_CONFLICT | 409 | Not enough stock remains to return to supplier. | Stock already consumed/transferred. | Use correction workflow. | High |
| TREASURY_SOURCE_INVALID | 422 | Treasury source is invalid. | Missing/invalid cashbox/bank. | Select active account. | Medium |
| TREASURY_TRANSFER_INVALID | 422 | Transfer source and destination are invalid. | Same/missing endpoints. | Correct endpoints. | Medium |
| VOUCHER_INVALID_PARTY | 422 | Voucher party is invalid. | Party type/id mismatch. | Select valid customer/supplier/other. | Medium |
| GL_UNBALANCED_ENTRY | 422 | Journal entry must balance debit and credit. | Debit != credit. | Correct lines. | High |
| GL_ACCOUNT_NOT_POSTABLE | 422 | Selected account cannot receive journal lines. | Parent/inactive account. | Choose postable active account. | Medium |
| GL_SYSTEM_ACCOUNT_MISSING | 500 | Required accounting mapping is missing. | System account not configured. | Configure system accounts. | High |
| GL_POSTING_FAILED | 500 | Accounting posting failed. | Posting exception. | Review posting failure and repost. | High |
| ORDER_INVALID_STATUS | 409 | Order status transition is not allowed. | State-machine violation. | Use allowed status action. | Medium |
| ORDER_CONVERT_STOCK_FAILED | 409 | Order cannot be converted because stock is unavailable. | Sale validation failed. | Restock or edit order. | High |
| DELIVERY_PROVIDER_ERROR | 502 | Delivery provider returned an error. | External API failure. | Retry/sync later or use another provider. | Medium |
| DELIVERY_SIGNATURE_INVALID | 401 | Delivery webhook signature is invalid. | Failed provider auth. | Check provider credentials. | High |
| DELIVERY_SHIPMENT_INVALID_STATE | 409 | Shipment action is not allowed now. | Invalid shipment transition. | Refresh shipment. | Medium |
| NOTIFICATION_PROVIDER_ERROR | 502 | Notification provider returned an error. | SMS/WhatsApp API failure. | Retry later or fix provider settings. | Medium |
| NOTIFICATION_RECIPIENT_INVALID | 422 | Recipient phone number is invalid. | Bad/missing normalized phone. | Correct phone. | Low |
| BACKUP_CREATE_FAILED | 500 | Backup could not be created. | Disk/db/file failure. | Check storage and retry. | High |
| BACKUP_RESTORE_FAILED | 500 | Restore did not complete. | Incompatible/corrupt/IO failure. | Restore pre-restore backup; contact support. | Critical |
| BACKUP_FILE_INVALID | 422 | Backup file is invalid or incompatible. | Bad filename/checksum/version. | Use valid backup. | High |
| LICENSE_INVALID | 403 | License is invalid. | Signature/key invalid. | Enter valid license. | High |
| LICENSE_EXPIRED | 403 | License has expired. | Expired entitlement. | Renew license. | High |
| RATE_LIMITED | 429 | Too many requests. Please try later. | Rate limit exceeded. | Wait and retry. | Medium |
| EXTERNAL_TIMEOUT | 504 | External service timed out. | Provider/network timeout. | Retry/sync later. | Medium |
| REPORT_TOO_LARGE | 413 | Report is too large for this request. | Export/filter too broad. | Narrow filters or run async export. | Medium |
| RESET_BLOCKED | 403 | Database reset is blocked in this environment. | Production/destructive guard. | Use backup/restore or authorized maintenance. | Critical |
| INTERNAL_ERROR | 500 | Unexpected error occurred. | Unhandled exception. | Retry; support with correlation id. | High |

## 9. QA Master Test Plan

### 9.1 Test Strategy

| Layer | Scope | Required coverage |
|---|---|---|
| Unit tests | Pure validation, calculations, state transitions, permission helpers, totals, exchange conversion, report math. | All business rules and state machines. |
| Integration tests | API + database transactions, stock/payment/GL side effects, idempotency, auth/RBAC, provider adapters with mocks. | Every mutating endpoint and critical list/report endpoint. |
| End-to-end tests | Cash sale, installment sale, return, purchase, transfer, expense, voucher, online order to shipment to sale. | Core user journeys on desktop and tablet-sized viewport. |
| Regression tests | Known bugs, period close, restore, concurrent stock, role permissions, reports. | Required before release. |
| Security tests | Auth bypass, RBAC denial, branch/warehouse scope, secret redaction, webhook signatures, destructive actions. | All protected modules. |
| Performance tests | Sale creation, product search, sales listing, stock listing, dashboard, reports/export. | KPI targets from Section 2. |
| Recovery tests | Backup create/restore, failed restore, idempotent retry, provider timeout, GL reposting failure. | Release-blocking for backup and financial operations. |
| Localization/accessibility | Arabic labels, RTL, keyboard navigation, focus, contrast, validation messages. | Core operational screens. |

### 9.2 Feature Test Matrix

| Feature | Unit tests | Integration tests | E2E / acceptance tests |
|---|---|---|---|
| Initial setup | setup-state rules, password policy | first-user creation, seed idempotency | fresh install -> first admin -> login. |
| Auth/session | password verify, session expiry | login/logout/profile/change password | login as each role and verify landing access. |
| RBAC | permission resolution, scope rules | role CRUD, permission replacement, denial checks | cashier cannot access GL/settings; admin can. |
| Settings/currency | type validation, exchange math | update settings/rates, secret masking | change currency rate and create foreign sale. |
| Branch/warehouse | default warehouse rules | CRUD and delete constraints | create branch/warehouse and assign user. |
| Product/category/units | price/unit validation | product CRUD, SKU/barcode uniqueness | create product with units and sell via default unit. |
| Inventory | stock math, FIFO/layer math | adjust, movements, low stock, expiry | stock count adjustment appears in movement report. |
| Transfers | transfer state machine | request/approve/reject, concurrent stock | request transfer and approve as manager. |
| Customers/credit | phone normalization, debt aging | customer CRUD, credit recalc/check | create customer, debt sale, aging updates. |
| Sales | totals, discounts, payment status | sale create, stock consume, GL post, idempotency | cash sale receipt, credit sale, draft completion. |
| Sale payments | payment status math | add/delete payment, treasury effects | partial payment then full payment. |
| Returns/cancellations | returnable quantity rules | sale return, cancel, restore | return one item and verify stock/debt. |
| Installments/collections | due/overdue transitions | actions, overdue list, notifications scan | installment sale becomes overdue and is paid. |
| Expenses | amount/date/category validation | create/update/delete/summary | create expense and see profit report change. |
| Recurring expenses | nextRun calculation | run job idempotency | monthly expense generated once. |
| Suppliers | supplier validation/debt math | CRUD, debts, statement | purchase creates supplier debt. |
| Purchases | invoice totals, unit cost | purchase create/payment/return/cancel | receive stock then sell received item. |
| Treasury | source/destination validation | cashbox/bank/voucher/transfer ledgers | receipt voucher increases cashbox ledger. |
| Accounting periods | overlap/close checks | open/close/snapshot, closed-period blocks | close period, attempt blocked sale backdate. |
| GL | debit/credit balance | account CRUD, journal create/reverse, posting failure repost | sale produces balanced journal. |
| Opening balances | one-time balance rules | customer/supplier balances, opening entry | migrated customer debt appears in aging. |
| Online orders | status machine | CRUD/status/convert/return | order -> confirmed -> converted sale. |
| Delivery | provider config validation | mock quote/create/sync/cancel/webhook | create shipment and receive delivered webhook. |
| Notifications | phone/template validation | send/retry/process/scan overdue with mock provider | overdue customer receives queued notification. |
| Reports/exports | report math | dashboard/reports/export filters | compare sales report to known fixtures. |
| Backup/restore | filename/checksum validation | create/preview/restore/delete | restore backup and verify known sale/customer. |
| Remote access | state validation | enable/disable/status with mock tunnel | enable then disable and audit events. |
| Audit | action mapping | audited writes, filters, purge | sensitive operation appears in audit log. |

### 9.3 Release Test Data Requirements

| Dataset | Required contents |
|---|---|
| Minimal setup | One admin, one branch, one warehouse, base currency, default cashbox, seeded roles and permissions. |
| Retail dataset | 100 products, 10 categories, multiple units, low stock and expiring stock entries. |
| Sales dataset | Cash sale, credit sale, installment sale, partial payment, canceled sale, return, restored sale. |
| Purchase dataset | Supplier, purchase with stock entries, partial payment, supplier return, canceled purchase. |
| Accounting dataset | Open and closed periods, chart of accounts, system mappings, balanced journals, posting failure. |
| Online/delivery dataset | Channels, online orders in each status, mock providers, shipments in each status, webhook logs. |
| Notification dataset | Settings, queued/sent/failed notifications, overdue scan candidates. |
| Backup dataset | Known baseline backup with checksum and expected row counts. |

### 9.4 Acceptance Gates

| Gate | Pass condition |
|---|---|
| Functional gate | 100% critical workflow tests pass: setup, login, sale, payment, return, purchase, stock, accounting close, backup restore. |
| Financial gate | Sales, purchase, treasury, and GL reconciliation variance is 0 on fixture dataset. |
| Inventory gate | Product stock equals stock movements and stock entries after concurrency tests. |
| Security gate | No unauthenticated protected access; all role/scope denial tests pass. |
| Performance gate | P95 targets in Section 2 pass on recommended hardware. |
| Recovery gate | Backup restore tested from current release and previous compatible release. |
| UX gate | Arabic RTL smoke tests pass for core workflows without blocking layout defects. |
| Documentation gate | API, DB, event, error, and release notes updated for any changed behavior. |

## 10. Release Readiness Checklist

### 10.1 Product Readiness

| Check | Status required |
|---|---|
| All requested release features have product owner acceptance criteria. | Complete |
| Feature flags and app mode defaults are documented. | Complete |
| Arabic terminology for customer-facing and operator-facing labels reviewed. | Complete |
| User roles and default permissions reviewed against real staff responsibilities. | Complete |
| Destructive actions have confirmation, permission, and audit behavior. | Complete |

### 10.2 Engineering Readiness

| Check | Status required |
|---|---|
| Database migrations are deterministic and reversible where practical. | Complete |
| API contracts changed in code are reflected in documentation. | Complete |
| State-machine transitions are enforced in backend services, not only UI. | Complete |
| Idempotency is implemented for critical financial/inventory writes. | Complete |
| Required indexes exist for list/report filters. | Complete |
| Secrets are encrypted or masked in settings, logs, exports, and backups. | Complete |

### 10.3 QA Readiness

| Check | Status required |
|---|---|
| Critical unit, integration, and E2E suites pass. | Complete |
| Manual smoke test executed on production-like build. | Complete |
| Performance tests meet KPI thresholds. | Complete |
| Backup create and restore verified. | Complete |
| Role and branch/warehouse scope tests pass. | Complete |
| Known defects triaged with severity and release decision. | Complete |

### 10.4 Data And Operations Readiness

| Check | Status required |
|---|---|
| Backup schedule configured and tested. | Complete |
| Restore procedure documented and rehearsed. | Complete |
| Initial admin and recovery access process defined. | Complete |
| Default chart of accounts and system mappings configured. | Complete |
| Default cashbox, branch, warehouse, base currency, and company settings configured. | Complete |
| License/activation behavior verified for online/offline cases. | Complete |

### 10.5 Deployment Readiness

| Check | Status required |
|---|---|
| Build artifact versioned and traceable to commit. | Complete |
| Environment variables and local paths documented. | Complete |
| Production debug routes disabled or protected. | Complete |
| Health/version endpoints respond correctly. | Complete |
| Rollback plan prepared with database backup. | Complete |
| Release notes include migrations, breaking changes, and operator impacts. | Complete |

### 10.6 Go / No-Go Criteria

Release is blocked by any critical issue in: authentication, authorization, sale creation, stock integrity, payment/debt integrity, purchase stock receipt, accounting period close, GL balance, backup restore, or destructive reset/restore safeguards.

Release may proceed with documented non-critical issues only when: workaround exists, owner accepts risk, monitoring/support plan exists, and issue is scheduled.

## 11. Product Metrics

### 11.1 Business Metrics

| Metric | Definition | Source | Target / use |
|---|---|---|---|
| Daily gross sales | Sum of active sale totals by business date. | sales | Track revenue trend. |
| Net sales | Gross sales minus returns/cancellations. | sales, sale_returns | Management reporting. |
| Gross margin | Sales revenue minus item cost. | sale_items | Pricing/profit decisions. |
| Average basket value | Net sales / number of sales. | sales | Sales performance. |
| Top products | Quantity/revenue/margin by product. | sale_items | Stock and merchandising. |
| Stockout count | Products below zero/zero or below min stock. | product_stock, products | Replenishment. |
| Inventory valuation | Sum remaining stock by cost. | product_stock_entries | Accounting/operations. |
| Purchase volume | Total purchases by supplier/period. | purchase_invoices | Procurement planning. |
| Supplier debt | Outstanding purchase balances. | purchase_invoices, vouchers | Payables control. |
| Customer debt | Outstanding sale/installment balances. | sales, installments, payments | Collections. |
| Overdue amount | Debt past due date. | installments | Collection priority. |
| Collection recovery rate | Payments collected / overdue amount. | payments, installments | Debt management. |
| Expense ratio | Expenses / net sales. | expenses, sales | Profit control. |
| Cashbox balance variance | Expected balance - counted balance. | cashboxes/vouchers/payments | Cash control. |
| Delivery success rate | Delivered shipments / shipped shipments. | delivery_shipments | Provider performance. |
| Online conversion rate | Online orders converted to sales / total orders. | online_orders, sales | Channel performance. |
| Return rate | Returned quantity or value / sold quantity or value. | returns, sales | Product/quality issues. |

### 11.2 Operational Metrics

| Metric | Definition | Source | Target / use |
|---|---|---|---|
| Sale creation P95 | API latency for `POST /api/sales`. | API logs | <= 1.5 seconds. |
| Product search P95 | Search/list latency. | API logs | <= 500 ms. |
| Report generation P95 | Dashboard/report endpoint latency. | API logs | <= Section 2 targets. |
| Failed GL postings | Count by status/source. | gl_posting_failures | 0 unresolved for period close. |
| Backup success rate | Successful backups / attempted backups. | backup logs/audit | >= 99%. |
| Restore verification status | Last restore test result. | ops checklist | Must pass before release. |
| Notification failure rate | Failed notifications / attempted notifications. | notifications/logs | Provider monitoring. |
| Webhook processing failure rate | Failed webhook logs / total webhooks. | delivery_webhook_logs | Integration health. |
| Idempotency duplicate prevention | Duplicate submissions returning cached response. | idempotency_keys | Validate retry safety. |
| Audit coverage | Sensitive writes with audit rows / sensitive writes. | audit_log vs app events | 100%. |

### 11.3 Product Quality Metrics

| Metric | Definition | Source | Target |
|---|---|---|---|
| Critical workflow pass rate | Passing critical acceptance tests / total. | QA suite | 100%. |
| Escaped critical defects | Critical production defects after release. | Support tracker | 0. |
| Time to complete sale | Median trained cashier workflow time. | UX test/session analytics | <= 45 seconds. |
| Time to process return | Median return workflow time. | UX test | <= 90 seconds. |
| Role denial correctness | Unauthorized attempts correctly denied. | Security tests/logs | 100%. |
| Data reconciliation variance | Difference between source and derived totals. | reconciliation jobs | 0. |
| Documentation freshness | Changed endpoints/tables/events documented in release PRs. | PR checklist | 100%. |

## 12. Future Extensibility

### 12.1 Extension Principles

| Principle | Requirement |
|---|---|
| Preserve source-of-truth aggregates | New features must attach to existing aggregate roots rather than duplicating sale, stock, debt, or ledger truth. |
| Prefer events for side effects | Notifications, external integrations, reports, and derived scores should react to domain events instead of embedding side effects in unrelated modules. |
| Keep financial corrections reversible | New financial operations must support cancellation/reversal and audit. |
| Keep stock movements append-only | New inventory workflows must produce stock movements and preserve stock-entry cost traceability. |
| Keep branch/warehouse scope explicit | Every new scoped entity must include branchId/warehouseId where operationally relevant. |
| Version external contracts | Provider adapters, webhooks, exports, and public API changes need schema versioning. |
| Treat reports as projections | Reports should derive from transactions or period snapshots; they should not mutate source records. |

### 12.2 Recommended Extension Points

| Area | Extension point | Contract |
|---|---|---|
| Payment providers | Payment method adapter | Create authorization/capture/refund/reversal records; never mark payment posted until provider success or approved offline policy. |
| Delivery providers | Delivery adapter | quote, createShipment, cancelShipment, syncShipment, getLabel, verifyWebhook, mapStatus. |
| Notification providers | Message adapter | send, parseStatus, retry policy, credential schema, rate limits. |
| Reports | Report registry | Report id, filters schema, permission, query/projection, export formatter. |
| GL posting | Posting templates | Source type, debit/credit account resolver, amount resolver, reversal resolver. |
| Credit scoring | Scoring model plugin | Inputs, modelVersion, score, riskLevel, explainable factors, recalculation trigger. |
| Product units | Unit conversion strategy | Base quantity conversion, sale/purchase default units, historical line snapshot. |
| Backup | Backup provider/storage | local path, cloud path, checksum, encryption, restore compatibility. |
| License | License validator | local signed token, remote validation, grace policy, entitlement flags. |
| Online channels | Channel adapter | import order, update remote status, map customer/product/payment fields. |

### 12.3 Future Feature Families

| Future capability | Required design alignment |
|---|---|
| Barcode scanner and label printing | Reuse product barcode/SKU, sale item lookup, inventory labels, and print/export service. |
| Purchase order workflow | Add PurchaseOrder aggregate before PurchaseInvoice; receiving creates purchase invoice/stock entries. |
| Quotation workflow | Add Quote aggregate convertible to Sale; no stock effect until conversion. |
| Customer loyalty | Attach points ledger to Customer and SaleCreated/SaleReturned events; never mutate sale totals silently. |
| Multi-store synchronization | Introduce sync event log, conflict policy, server identity, and offline idempotency; preserve document sequence uniqueness. |
| Advanced cash sessions | Add cash_sessions table linked to cashbox/user and transaction range; enforce open session for cashier payments if enabled. |
| Manufacturing/bundles | Add product composition/BOM and stock movements for component consumption/finished goods receipt. |
| Cloud backup | Implement backup storage adapter with encryption, retention policy, and restore preview. |
| Mobile app | Consume existing API contracts; enforce same RBAC/scope; add device session management. |
| Public customer receipts | Add signed receipt URLs with limited data and expiration. |
| Advanced tax | Add tax rates, tax-inclusive pricing, invoice tax lines, and financial report mapping. |
| Multi-currency accounting | Store document currency and base currency values consistently in GL lines and reports. |

### 12.4 Change Control For Future Teams

Every future feature PR or delivery package must update:

1. Functional specification for affected features.
2. State machines if any entity status changes.
3. Domain model if entities, commands, queries, value objects, or events change.
4. API contract for added/changed/removed endpoints.
5. Database specification and migration notes for schema changes.
6. Event catalog for new emitted/consumed events.
7. Error catalog for new user-visible or integration errors.
8. QA plan with test cases and acceptance criteria.
9. Release readiness checklist with migration, backup, rollback, and operator notes.
10. Product metrics if the feature changes business or operational measurement.
