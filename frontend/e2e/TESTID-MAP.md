# data-testid Map

The single source of truth for selector strings is [`helpers/testids.ts`](helpers/testids.ts).
This document maps each id to the component + element it lives on, and tracks
wiring status.

- ✅ **wired** — the attribute exists in the component (added by this suite) and a
  spec/POM uses it.
- ⬜ **planned** — listed in `TEST-PLAN.md`; add the attribute when implementing
  that section's specs (follow the same convention).

Dynamic ids: product tiles also expose `data-product-id` / `data-product-name`;
period rows expose `data-period-id`/`data-period-status` (planned); sale-return
rows expose `data-sale-item-id`.

---

## ✅ Wired (covered by the shipped specs)

### Login — `src/views/auth/Login.vue`
| testid | Element |
|---|---|
| `login-username` | username `v-text-field` |
| `login-password` | password `v-text-field` |
| `login-submit` | "دخول" submit button |
| `login-error` | invalid-credentials `v-alert` |

### POS — `src/views/sales/PosScreen.vue`
| testid | Element |
|---|---|
| `pos-shift-chip` | open-shift status chip |
| `pos-open-shift` | "فتح وردية" button |
| `pos-close-shift` | "إغلاق الوردية" button |
| `pos-search` | quick-search field (F2) |
| `pos-barcode` | barcode field (F4) |
| `pos-product` | product tile (`+ data-product-id`, `data-product-name`) |
| `pos-total` | cart grand-total value |
| `pos-pay-method-cash` / `pos-pay-method-card` | payment-method radios |
| `pos-card-ref` | card reference field (card only) |
| `pos-pay-full` | "المبلغ كامل" tender button |
| `pos-checkout` | "دفع وإتمام" (F9) |

### Shift dialogs — `src/components/cashSession/`
| testid | Element |
|---|---|
| `open-shift-cash` / `-currency` / `-notes` / `-confirm` / `-cancel` | `OpenShiftDialog.vue` |
| `close-shift-cash` / `-notes` / `-variance` / `-confirm` / `-cancel` | `CloseShiftDialog.vue` |

### Accounting periods — `src/views/accounting/AccountingPeriods.vue`
| testid | Element |
|---|---|
| `period-open-btn` | "فتح قيد جديد" |
| `period-type` | period-type `v-select` |
| `period-notes` | notes textarea |
| `period-submit-open` | "فتح القيد" |
| `periods-table` | periods `v-data-table` |
| `period-close-btn` | row lock/close icon (open rows) |
| `period-confirm-close` | "تأكيد الإغلاق" |

### Products list — `src/views/products/Products.vue`
| testid | Element |
|---|---|
| `product-new-btn` | "منتج جديد" |
| `products-export` | "تصدير" |
| `products-table` | products `v-data-table` |
| `product-edit` / `product-delete` | per-row action buttons |

### Product form — `src/views/products/ProductForm.vue`
| testid | Element |
|---|---|
| `product-name` / `product-sku` | name / SKU |
| `product-category` | category autocomplete (required by backend) |
| `product-cost-price` / `product-selling-price` | prices |
| `product-currency` / `product-unit` / `product-status` | selects/fields |
| `product-save` / `product-cancel` | actions |
| `product-opening-stock-add` / `product-opening-stock-skip` | post-create prompt |

### Inventory adjust — `src/views/inventory/Inventory.vue`
| testid | Element |
|---|---|
| `inventory-adjust-btn` | "إضافة / تعديل مخزون" |
| `inventory-adjust-product` | product autocomplete |
| `inventory-adjust-type` | movement-type select |
| `inventory-adjust-qty` | quantity |
| `inventory-adjust-reason` | reason |
| `inventory-adjust-save` | "حفظ" |
| `inventory-table` | stock `v-data-table` |

### Sale details / returns — `src/views/sales/SaleDetails.vue`
| testid | Element |
|---|---|
| `sale-invoice-number` | invoice-number chip |
| `sale-return-btn` | "إرجاع / استرداد" |
| `sale-return-qty` | per-line return qty (`+ data-sale-item-id`) |
| `sale-refund-amount` | cash refund amount |
| `sale-refund-method` | refund-method select |
| `sale-confirm-return` | "تأكيد الإرجاع" |
| `sale-returns-history` | returns-history card |
| `sale-net-after-returns` | net-after-returns total cell |

---

## ⬜ Planned (add when implementing these sections)

Suggested ids — keep the `area-element` convention. Several screens already
expose stable anchors (Arabic `label=`, `aria-label`, `title`) that specs can use
until ids are added.

| Section | Component | Suggested ids |
|---|---|---|
| Categories | `views/categories/Categories.vue` | `category-new-btn`, `category-name`, `category-save`, `categories-table`, `category-edit`, `category-delete` |
| Brands / Units | (categories tabs / product units) | `unit-*`, `brand-*` |
| Customers | `views/customers/Customers.vue` + `CustomerForm.vue` | `customer-new-btn`, `customer-name`, `customer-phone`, `customer-save`, `customers-table` |
| Payments / debts | `CustomerProfile.vue` / `Collections.vue` | `collect-payment-btn`, `payment-amount`, `payment-confirm` |
| Expenses | `views/expenses/Expenses.vue` | `expense-new-btn`, `expense-category`, `expense-amount`, `expense-save`, `expenses-table` |
| Branches / Warehouses | `views/inventory/BranchesWarehouses.vue` | `branch-new-btn`, `branch-name`, `warehouse-new-btn`, `warehouse-name`, `branch-save`, `warehouse-save` |
| Stock transfers | `views/inventory/StockTransfer.vue` + `TransferRequests.vue` | `transfer-product`, `transfer-from`, `transfer-to`, `transfer-qty`, `transfer-submit`, `transfer-approve`, `transfer-reject` |
| Stock movements | `views/inventory/StockMovements.vue` | `movements-table`, `movement-type-filter` |
| Invoice cancellation | `SaleDetails.vue` | `sale-cancel-btn`, `sale-cancel-confirm` |
| Users / roles | `views/users/Users.vue` | `user-new-btn`, `user-username`, `user-role`, `user-password`, `user-save`, `users-table`, `user-reset-password` |
| Settings / Feature flags | `views/settings/FeatureFlags.vue` | `flag-<key>` (per `v-switch`), `mode-upgrade-btn` |
| Setup wizard | `views/settings/SetupWizard.vue` | `wizard-mode-<id>`, `wizard-preset-<id>`, `wizard-apply` |
| Reports | `views/Reports.vue` / `reports/SimpleReports.vue` | `report-period`, `report-from`, `report-to`, `report-apply`, `report-kpi-<key>`, `report-export-excel`, `report-export-pdf` |
| Backup / restore | `components/.../DataBackupRestore.vue` | `backup-create-btn`, `backup-group-<key>`, `backup-confirm`, `restore-file`, `restore-confirm` |
| Global search | `components/QuickSearch.vue` | `quick-search-input`, `quick-search-result` |
