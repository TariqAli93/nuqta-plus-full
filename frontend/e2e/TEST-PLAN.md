# Nuqta Plus — E2E Test Plan

Full coverage plan across every section of the app. Each case is browser-driven
(real clicks/fills/assertions); the API is used only for setup/cleanup. Arabic
user-facing copy is asserted to catch localization regressions.

**Status legend:** ✅ implemented & shipped · 🟡 partially implemented · ⬜ planned
(scaffolding + testids ready; follow the same patterns).

**Conventions:** see [`README.md`](README.md) · selectors in
[`helpers/testids.ts`](helpers/testids.ts) · Arabic strings in
[`helpers/arabic.ts`](helpers/arabic.ts).

---

## 0. Cross-cutting happy-path flow ✅

`specs/flows/happy-path.spec.ts` — the canonical retail cycle, end-to-end:

> login (session) → **open accounting period** → **open shift** → **create product**
> → **add stock** → **sell 2 units** → **partial return (1)** → **reports** →
> **close shift** → **close period**

Enables `accountingPeriods` for the run and restores it afterwards.

---

## 1. Authentication / تسجيل الدخول ✅ — `specs/auth/login.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| AUTH-01 | Valid admin login → lands on `/sales/pos` | happy | ✅ |
| AUTH-02 | Invalid credentials → Arabic error `اسم المستخدم أو كلمة المرور غير صحيحة` | negative | ✅ |
| AUTH-03 | Empty submit → `هذا الحقل مطلوب`, stays on login | negative | ✅ |
| AUTH-04 | Session persistence (storageState) reused by all specs | infra | ✅ |
| AUTH-05 | Logout clears session → protected route bounces to login | negative | ⬜ |
| AUTH-06 | Expired/invalid token → 401 interceptor redirects to login | negative | ⬜ |

## 2. Dashboard / لوحة التحكم 🟡

| ID | Case | Type | Status |
|---|---|---|---|
| DASH-01 | Dashboard renders KPI cards after login | happy | ⬜ |
| DASH-02 | No fatal console errors on load (covered generally by UI-REG) | regression | 🟡 |
| DASH-03 | Quick-action menu navigates (new sale / collect / expense) | happy | ⬜ |

## 3. Products / المنتجات ✅ — `specs/products/products.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| PROD-01 | Create product → appears in list | happy | ✅ |
| PROD-02 | Edit product (change selling price) → persists | happy | ✅ |
| PROD-03 | Delete product (confirm `حذف نهائي`) → removed | happy | ✅ |
| PROD-04 | Required-field validation in Arabic | negative | ✅ |
| PROD-05 | Search by name/SKU/barcode filters the table | happy | 🟡 (search used in 01–03) |
| PROD-06 | Filter by category/status/price chips | happy | ⬜ |
| PROD-07 | Create a **service** product (no stock fields) | happy | ⬜ |
| PROD-08 | Product units (درزن/كارتون) add + conversion validation | happy | ⬜ |
| PROD-09 | Cost-price admin-unlock dialog for non-admins | negative | ⬜ |

## 4. Categories / التصنيفات ⬜

| ID | Case | Status |
|---|---|---|
| CAT-01 | Create category from dialog | ⬜ |
| CAT-02 | Inline category creation from product form (Enter to create) | ⬜ |
| CAT-03 | Edit / delete category | ⬜ |

## 5. Brands / العلامات ⬜

| ID | Case | Status |
|---|---|---|
| BRND-01 | Create / list / delete brand (if surfaced in UI) | ⬜ |

## 6. Units / الوحدات ⬜

| ID | Case | Status |
|---|---|---|
| UNIT-01 | Define base + extra units on a product; default-sale toggle | ⬜ |
| UNIT-02 | Sell in a non-base unit at POS (unit picker) | ⬜ |

## 7. Branches / الفروع ⬜ (requires `multiBranch` ON)

| ID | Case | Status |
|---|---|---|
| BRCH-01 | Create branch + default warehouse | ⬜ |
| BRCH-02 | Edit branch metadata | ⬜ |

## 8. Warehouses / المخازن ⬜ (requires `multiWarehouse`/`multiBranch` ON)

| ID | Case | Status |
|---|---|---|
| WH-01 | Create warehouse under a branch | ⬜ |
| WH-02 | Activate/deactivate warehouse | ⬜ |
| WH-03 | "Create default warehouse" CTA when none exists | ⬜ |

## 9. Inventory / المخزون ✅ (stock add) · 🟡 (rest)

| ID | Case | Type | Status |
|---|---|---|---|
| INV-01 | Add opening stock via adjust dialog (deep-link from product form) | happy | ✅ |
| INV-02 | Stock table reflects updated quantity | happy | 🟡 |
| INV-03 | Low-stock-only filter | happy | ⬜ |
| INV-04 | Expiry status chips for tracked products | happy | ⬜ |

## 10. Stock entries / حركات المخزون ⬜

| ID | Case | Status |
|---|---|---|
| STK-01 | `stock_in` movement increases qty; movement logged | ⬜ |
| STK-02 | Movements page filter by warehouse/type | ⬜ |

## 11. Adjustments / التعديلات ⬜

| ID | Case | Status |
|---|---|---|
| ADJ-01 | `adjustment_out` / `damaged` decreases qty | ⬜ |
| ADJ-02 | Negative stock guard (`allowNegative=false`) | ⬜ |

## 12. Transfers / النقل بين المخازن ⬜ (requires `inventoryTransfers` ON)

| ID | Case | Status |
|---|---|---|
| TRF-01 | Create transfer request between warehouses | ⬜ |
| TRF-02 | Approve / reject request (with reason) | ⬜ |
| TRF-03 | Direct transfer for users with approve capability | ⬜ |

## 13. POS sales / نقطة البيع ✅ — `specs/sales/pos-sale.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| POS-01 | Open shift + complete a cash sale | happy | ✅ |
| POS-02 | Checkout blocked without an open shift (`افتح وردية…`) | negative | ✅ |
| POS-03 | Card payment requires card reference | negative | ⬜ |
| POS-04 | Per-line discount / sale discount / tax math | happy | ⬜ |
| POS-05 | Barcode scan adds product | happy | ⬜ |
| POS-06 | Change/“المبلغ كامل” readout correctness | happy | ⬜ |
| POS-07 | Save as draft + resume draft | happy | ⬜ |
| POS-08 | Sale blocked when no open accounting period (flag ON) | negative | 🟡 (exercised in happy-path) |

## 14. Invoices / الفواتير 🟡

| ID | Case | Type | Status |
|---|---|---|---|
| INVC-01 | Sale details page renders invoice number, items, totals | happy | ✅ (via returns/happy-path) |
| INVC-02 | Sales list → open invoice | happy | ⬜ |
| INVC-03 | Add payment to a pending/credit invoice | happy | ⬜ |
| INVC-04 | Print / preview buttons disabled when fully returned | negative | ⬜ |

## 15. Returns / المرتجعات ✅ — `specs/sales/returns.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| RET-01 | Partial return reduces net; returns history recorded | happy | ✅ |
| RET-02 | Full return → invoice marked `مُرجع كلياً` | happy | ✅ |
| RET-03 | Over-return blocked (qty capped at maxReturnable) | negative | ⬜ |
| RET-04 | Cash refund vs debt-reduction split preview | happy | ⬜ |
| RET-05 | Return disabled for installment invoices | negative | ⬜ |

## 16. Invoice cancellation / إلغاء الفاتورة ⬜

| ID | Case | Status |
|---|---|---|
| CNCL-01 | Cancel a sale → status `cancelled`, stock restored | ⬜ |
| CNCL-02 | Cancelled invoice cannot be returned/printed | ⬜ |

## 17. Customers / العملاء ⬜

| ID | Case | Status |
|---|---|---|
| CUST-01 | Create customer (name/phone) | ⬜ |
| CUST-02 | Duplicate-phone confirmation dialog | ⬜ |
| CUST-03 | Edit / delete customer | ⬜ |
| CUST-04 | Customer profile tabs (purchases/installments/payments) | ⬜ |
| CUST-05 | CSV export of customers | ⬜ |

## 18. Payments / debts / التحصيل ⬜

| ID | Case | Status |
|---|---|---|
| PAY-01 | Record a payment against a credit invoice | ⬜ |
| PAY-02 | "دفع المبلغ المتبقي" pays full balance | ⬜ |
| PAY-03 | Collections page lists overdue installments by aging bucket | ⬜ |

## 19. Expenses / المصاريف ⬜

| ID | Case | Status |
|---|---|---|
| EXP-01 | Create expense (category/amount/currency) | ⬜ |
| EXP-02 | Amount > 0 validation | ⬜ |
| EXP-03 | Edit / delete expense; summary totals update | ⬜ |
| EXP-04 | Date-range + category filter | ⬜ |

## 20. Shifts / الورديات ✅ (open/close) · 🟡 (rest)

| ID | Case | Type | Status |
|---|---|---|---|
| SHFT-01 | Open shift with opening cash | happy | ✅ |
| SHFT-02 | Close shift; expected vs counted variance shown | happy | ✅ (close) / 🟡 (variance assert) |
| SHFT-03 | Shift bar shows received/expected metrics after a sale | happy | ⬜ |
| SHFT-04 | Shift report / ShiftReport page totals | happy | ⬜ |

## 21. Accounting periods / القيود المحاسبية ✅ — `specs/accounting/periods.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| PER-01 | Open a daily period | happy | ✅ |
| PER-02 | Close a period (pre-close summary dialog) | happy | ✅ |
| PER-03 | Block opening a 2nd period for an open scope (`يوجد قيد مفتوح…`) | negative | ✅ |
| PER-04 | Closing a period closes its open shifts | happy | 🟡 (happy-path) |
| PER-05 | Closed-period frozen snapshot visible in reports | happy | ⬜ |

## 22. Reports / التقارير 🟡

| ID | Case | Type | Status |
|---|---|---|---|
| REP-01 | Reports page loads with KPI cards | smoke | ✅ (happy-path + UI-REG) |
| REP-02 | Period preset + custom date range filter | happy | ⬜ |
| REP-03 | KPIs net out returns (net sales / COGS / qty) | happy | ⬜ |
| REP-04 | Aging panel buckets | happy | ⬜ |
| REP-05 | Closed accounting-period snapshot selector | happy | ⬜ |

## 23. Users / المستخدمون ⬜

| ID | Case | Status |
|---|---|---|
| USR-01 | Create user (username/role/password/branch) | ⬜ |
| USR-02 | Edit user; activate/deactivate | ⬜ |
| USR-03 | Reset password (min length + confirm match) | ⬜ |
| USR-04 | Filter by role/status/search | ⬜ |

## 24. Roles / الأدوار ⬜

| ID | Case | Status |
|---|---|---|
| ROLE-01 | Role chip rendered per user | ⬜ |
| ROLE-02 | Role drives capabilities (UI visibility) | ⬜ |

## 25. Permissions / الصلاحيات ✅ (guard) · ⬜ (matrix)

| ID | Case | Type | Status |
|---|---|---|---|
| PERM-01 | Non-admin forbidden from `/users` → `/forbidden` | negative | ✅ |
| PERM-02 | Feature-gated route (`/sales/new`, installments off) redirects | negative | ✅ |
| PERM-03 | Cashier cannot see manage-products actions | negative | ⬜ |
| PERM-04 | 403 from backend triggers session refresh + Arabic toast | negative | ⬜ |

## 26. Settings / الإعدادات ⬜

| ID | Case | Status |
|---|---|---|
| SET-01 | Toggle a feature flag → module appears/disappears | ⬜ |
| SET-02 | Company info / currency settings persist | ⬜ |
| SET-03 | Setup wizard preset application | ⬜ |
| SET-04 | Upgrade simple → full mode | ⬜ |

## 27. Backup / restore / النسخ الاحتياطي ⬜

| ID | Case | Status |
|---|---|---|
| BKP-01 | Create selective backup (choose groups) → file produced | ⬜ |
| BKP-02 | Restore preview (manifest) + confirm checkboxes gate | ⬜ |
| BKP-03 | Restore replaces selected groups; counts reported | ⬜ |

## 28. Search / البحث ⬜

| ID | Case | Status |
|---|---|---|
| SRCH-01 | Quick search (Ctrl+K) finds products/customers/invoices | ⬜ |
| SRCH-02 | Result actions (open / collect / print) navigate | ⬜ |
| SRCH-03 | Server-side product search highlights matched field | ⬜ |

## 29. Exports / التصدير ⬜

| ID | Case | Status |
|---|---|---|
| EXP-CSV-01 | Products "تصدير" downloads a CSV (assert `download` event) | ⬜ |
| EXP-XLSX-01 | Reports Excel export downloads a workbook | ⬜ |
| EXP-PDF-01 | Reports PDF export downloads a PDF | ⬜ |

## 30. UI regression / انحدار الواجهة ✅ — `specs/ui/regression.spec.ts`

| ID | Case | Type | Status |
|---|---|---|---|
| UI-01 | Primary screens render their Arabic heading | regression | ✅ |
| UI-02 | No fatal console/page errors on primary screens | regression | ✅ |
| UI-03 | App shell is RTL (`direction: rtl`) | regression | ✅ |
| UI-04 | Visual snapshots (`toHaveScreenshot`) for key screens | regression | ⬜ |
| UI-05 | Responsive / dark-mode (`preview_resize`-style viewport sweep) | regression | ⬜ |

---

## Negative-test catalogue (cross-section, summary)

| Area | Negative behaviour asserted | Status |
|---|---|---|
| Login | Wrong password → Arabic error; empty → required | ✅ |
| POS | Checkout without shift → `افتح وردية قبل تسجيل بيع نقدي` | ✅ |
| Periods | Second open period blocked for an open scope | ✅ |
| Routing | Feature-off route redirect; non-admin → `/forbidden` | ✅ |
| Product form | Required-field validation | ✅ |
| Returns | Over-return cap; installment-return hidden | ⬜ |
| Expenses | Amount ≤ 0 rejected | ⬜ |
| Users | Password mismatch / too short on reset | ⬜ |

---

## CI / local run

```bash
# local
pnpm run test:e2e:install      # one-time browser install
pnpm run test:e2e              # full suite (auto-starts dev server)
pnpm exec playwright test e2e/specs/flows/happy-path.spec.ts   # one file

# CI (see .github/workflows/e2e.yml)
#   spins up Postgres, runs backend + frontend, then `playwright test`.
```
