# Matrix إعادة هيكلة الصفحات → Desktop Workspaces

> تقرير تخطيط — لا تعديل بعد. القرار لكل صفحة: **إبقاء / دمج / تحويل إلى Tab / تحويل إلى Panel / حذف**.
> المصدر: مسح فعلي لكل الصفحات (المكوّنات + مصادر البيانات + التابات الداخلية + التشابه).

---

## 1. Matrix الكامل (73 صفحة)

### أ. المبيعات والأطراف (Transactional + Parties)
| الصفحة | Route | الهدف | تابات داخلية | مشابهة | القرار |
|---|---|---|---|---|---|
| sales/Sales | `/sales` | قائمة الفواتير (useServerSearch) | لا | Customers (نفس النمط) | **إبقاء** (قائمة workspace) |
| sales/NewSale | `/sales/new` | إنشاء بيع/تقسيط | لا | PosScreen (مُنشئ آخر) | **إبقاء** (مُنشئ مستقل) |
| sales/PosScreen | `/sales/pos` | نقطة بيع سريعة | لا | NewSale | **إبقاء** |
| sales/SaleDetails | `/sales/:id` | تفاصيل/طباعة فاتورة | لا (مكدّس) | PurchaseDetails | **تحويل إلى Tab** (تفاصيل/دفعات/شحن/سجل) |
| collections/Collections | `/collections` | الأقساط المتأخرة | لا | CustomerProfile (تبويب التحصيل) | **إبقاء** (نفس store، سياق مختلف) |
| customers/Customers | `/customers` | قائمة العملاء | لا | Sales | **إبقاء** |
| customers/CustomerForm | `/customers/new` + `/:id/edit` | إضافة/تعديل عميل (مشترك) | لا | ProductForm | **إبقاء** (Form مشترك صحيح) |
| customers/CustomerProfile | `/customers/:id` | ملف العميل 360 | **نعم (6)** | SupplierProfile | **إبقاء** → workspace تابات |
| suppliers/Suppliers | `/suppliers` | قائمة الموردين | لا | Customers | **إبقاء** (توحيد UX) |
| suppliers/SupplierProfile | `/suppliers/:id` | ملف المورد | **نعم (3)** | CustomerProfile | **إبقاء** → workspace تابات |
| purchases/Purchases | `/purchases` | قائمة المشتريات | لا | Sales | **إبقاء** |
| purchases/NewPurchase | `/purchases/new` | إنشاء فاتورة شراء | لا | NewSale | **إبقاء** |
| purchases/PurchaseDetails | `/purchases/:id` | تفاصيل شراء | لا (مكدّس) | SaleDetails | **تحويل إلى Tab** |

### ب. المخزون والبضاعة + المالية (Stock + Finance)
| الصفحة | Route | الهدف | القرار |
|---|---|---|---|
| products/Products | `/products` | قائمة المنتجات | **إبقاء** |
| products/ProductForm | `/products/new` + `/:id/edit` | إنشاء/تعديل منتج (مشترك) | **إبقاء** |
| categories/Categories | `/categories` | تصنيفات | **تحويل إلى Tab** (workspace المنتجات: البضاعة/التصنيفات) |
| inventory/Inventory | `/inventory` | شبكة المخزون | **إبقاء** (الصفحة الأم) |
| inventory/LowStock | `/inventory/low-stock` | المخزون المنخفض | **دمج** → View داخل Inventory |
| inventory/ExpiryAlerts | `/inventory/expiry-alerts` | قرب الانتهاء | **دمج** → View داخل Inventory |
| inventory/StockMovements | `/inventory/movements` | سجل الحركات | **تحويل إلى Tab** (Inventory: المخزون/الحركات) |
| inventory/StockTransfer | `/inventory/transfer` | إنشاء نقل | **دمج** → صفحة Transfers (إنشاء+طلبات) |
| inventory/TransferRequests | `/inventory/transfers` | اعتماد النقل | **دمج** → صفحة Transfers |
| inventory/BranchesWarehouses | `/inventory/settings` | فروع/مخازن (config) | **إبقاء** |
| treasury/Cashboxes | `/treasury/cashboxes` | الصناديق | **دمج** → صفحة الحسابات (نوع: صندوق) |
| treasury/BankAccounts | `/treasury/bank-accounts` | الحسابات المصرفية | **دمج** → صفحة الحسابات (نوع: بنك) |
| treasury/CashboxLedger | `/treasury/cashboxes/:id/ledger` | كشف صندوق | **تحويل إلى Panel** (drill-down من الحساب) |
| treasury/Vouchers | `/treasury/vouchers` | سندات القبض/الدفع | **تحويل إلى Tab** (workspace الخزينة) |
| treasury/TreasuryTransfers | `/treasury/transfers` | تحويل بين الصناديق | **تحويل إلى Tab** (workspace الخزينة) |
| expenses/Expenses | `/expenses` | المصاريف | **إبقاء** (الأم) |
| expenses/RecurringExpenses | `/recurring-expenses` | المصاريف الثابتة | **تحويل إلى Tab** (workspace المصاريف) |
| accounting/AccountingPeriods | `/accounting-periods` | فترات العمل (config) | **إبقاء** |
| gl/ChartOfAccounts | `/gl/accounts` | شجرة الحسابات | **تحويل إلى Tab** (workspace المحاسبة) |
| gl/JournalEntries | `/gl/journal` | القيود | **تحويل إلى Tab** (workspace المحاسبة) |
| gl/SystemAccounts | `/gl/system-accounts` | ربط الحسابات | **تحويل إلى Tab** (workspace المحاسبة) |
| gl/PostingFailures | `/gl/posting-failures` | إصلاح القيود | **تحويل إلى Tab** (workspace المحاسبة) |
| gl/ManualJournalForm | — (مضمّن في JournalEntries) | نموذج قيد | **إبقاء** (Form مضمّن) |

### ج. التقارير + التجارة الأونلاين + الإدارة
| الصفحة | Route | القرار |
|---|---|---|
| Reports | `/reports` | **إبقاء** |
| reports/FinancialReports | `/reports/financial` | **إبقاء** (تابات داخلية صحيحة) |
| reports/InventoryValuation | `/reports/inventory-valuation` | **إبقاء** |
| reports/{Sales,Profit,TopProducts,Debts,CashBox,Expenses}ReportPage | `/reports/*` (نوافذ Electron مستقلة) | **إبقاء** (6 أغلفة 6 أسطر فوق محرّك `ReportWindow` + `reportConfigs.js` — لا تكرار) |
| reports/SimpleReports | غير مُوجّه (معلّق) | **حذف** |
| reports/DeliveryReports | redirect | **حذف** (استُبدل بالموحّد) |
| reports/OnlineCommerceReports | redirect | **حذف** (استُبدل بالموحّد) |
| reports/OnlineCommerceShippingReports | `/reports/online-commerce-shipping` | **إبقاء** (تابات ديناميكية صحيحة) |
| online-orders/OnlineOrders | `/online-orders` | **إبقاء** |
| sales-channels/SalesChannels | `/sales-channels` | **إبقاء** |
| delivery/DeliveryShipments | `/delivery/shipments` | **إبقاء** |
| delivery/ShipmentDetails | `/delivery/shipments/:id` | **تحويل إلى Tab** (تفاصيل/سجل) |
| delivery/DeliveryTracking | غير مُوجّه (redirect) | **حذف** (غير مستخدم) |
| Settings | `/settings` | **إبقاء** (hub تابات عمودية) |
| settings/FeatureFlags | `/settings/feature-flags` | **إبقاء** |
| settings/SetupWizard | `/setup` | **إبقاء** (wizard) |
| settings/OpeningBalances | `/settings/opening-balances` | **إبقاء** |
| settings/{DeliveryProviders,BoxySettings,GenericProviderSettings,BoxyWebhookLogs} | `/settings/integrations/...` | **إبقاء** (تدفّق config متداخل) |
| users/Users | `/users` | **تحويل إلى Tab** (workspace الصلاحيات: الموظفون/الأدوار) |
| roles/Roles | `/roles` | **تحويل إلى Tab** (workspace الصلاحيات) |
| Dashboard, Notifications, Profile, About, Forbidden, FirstRun, ServerSetup, Activation, Login | — | **إبقاء** |

---

## 2. قواعد الدمج المطبّقة (ملخّص القرارات)

**حذف (4 صفحات ميتة مؤكّدة + مكوّنات ميتة سابقة):**
`SimpleReports`, `DeliveryReports`, `OnlineCommerceReports`, `DeliveryTracking` — كلها بلا route فعّال وبلا أي import.

**دمج (نفس البيانات/filter بسيط → صفحة واحدة + Views) — القاعدة 1:**
- **Inventory** = Inventory + LowStock + ExpiryAlerts (Views: الكل/منخفض/قرب الانتهاء) + StockMovements كتبويب.
- **Transfers** = StockTransfer + TransferRequests (إنشاء + قائمة طلبات).
- **Accounts (الخزينة)** = Cashboxes + BankAccounts (View: صندوق/بنك).

**Form مشترك (القاعدة 2):**
- موجود وصحيح: `CustomerForm`, `ProductForm` (create+edit)، `VoucherFormDialog`, `ManualJournalForm`.
- يُستخرج: `AccountFormDialog` (Cashboxes+BankAccounts)، `ExpenseFormDialog` (Expenses+RecurringExpenses)، `SupplierForm` (ناقص حالياً — لا توازن مع العملاء).

**Tabs ضمن نفس السياق (القاعدة 6) — workspaces:**
- سجل العميل/المورد (موجود). سجل البيع/الشراء/الشحنة (تفاصيل/دفعات/شحن/سجل).
- المحاسبة (الحسابات/القيود/الربط/الإصلاح). الخزينة (سندات/تحويلات). المصاريف (مرة/ثابتة). الصلاحيات (موظفون/أدوار). المنتجات (بضاعة/تصنيفات).

**Panel (drill-down):** CashboxLedger كلوحة تفاصيل من الحساب.

**لا تابات للوحدات غير المرتبطة (القاعدة 7):** ✓ — النوافذ المستقلة للتقارير تبقى نوافذ، ولا تُدمج التقارير الأونلاين مع المحاسبة، إلخ.

---

## 3. البنية المقترحة `features/`

```
src/features/
  <feature>/
    pages/        # شاشات على مستوى الـ route (أصداف workspace)
    components/   # مكوّنات خاصة بالميزة
    composables/  # جلب البيانات (use<Feature>Data) — لا fetch داخل الصفحة
    services/     # أغلفة API رفيعة فوق axios المركزي (لا interceptors مكررة)
    schemas/      # قواعد التحقق (validators) المشتركة بين الإنشاء/التعديل
    commands/     # تسجيل أوامر الميزة في Command Registry
    routes.js     # RouteRecordRaw[] للميزة
  index.js        # يجمع routes كل الميزات → يُغذّى للراوتر
```
الميزات: `sales, customers, suppliers, purchases, products, inventory, treasury, expenses, gl, reports, online-commerce, delivery, settings, access(users+roles), dashboard`.

**مبادئ:** لا منطق أعمال في صفحة الـ workspace (القاعدة 4)؛ جلب البيانات في composables/services (القاعدة 10)؛ معالجة الأخطاء تبقى في interceptor axios المركزي (القاعدة 11)؛ أوامر كل صفحة تُسجَّل في الـ Command Registry (القاعدة 9) عبر `useCommands().register()`.

---

## 4. استراتيجية تابات سطح المكتب

طبقتان:
1. **تابات داخل السياق** (داخل سجل/workspace): تفاصيل/عمليات/ملاحظات/سجل/مرفقات — عبر مكوّن `WorkspaceTabs` بمظهر سطح مكتب (لا v-tabs ويب خام)، يستخدمه سجل العميل/المورد/البيع/الشراء/المحاسبة.
2. **تابات متعددة المستندات (اختياري، أكبر)**: فتح السجلات كتابات على مستوى الـ shell (مثل محرّر)، مع رجوع/تقدّم + حفظ الحالة (القاعدة 8). ميزة كبيرة → مرحلة لاحقة.

القاعدة 8 مغطّاة جزئياً اليوم: الـ workspace يُبقي حالة الصفحة عبر keying بالـ path، شريط الأوامر فيه رجوع، واختصارات Ctrl+K/Ctrl+Shift+P. تابات المستندات المتعددة تكملها.

---

## 5. ترتيب التنفيذ (تصاعدي المخاطر) + المخاطر

```
المرحلة 0  حذف 4 صفحات ميتة (+ مكوّنات ميتة)            ← أدنى مخاطرة
المرحلة 1  scaffold features/ + ترحيل ميزة مرجعية واحدة (Customers) end-to-end
المرحلة 2  نماذج مشتركة: AccountFormDialog, ExpenseFormDialog, SupplierForm
المرحلة 3  الدمج: Inventory(Views+Movements) · Accounts · Transfers (مع redirects)
المرحلة 4  workspaces تابات: المحاسبة · الصلاحيات · الخزينة · سجلات البيع/الشراء
المرحلة 5  (اختياري) تابات متعددة المستندات + back-stack للسجلات
المرحلة 6  توحيد UX القوائم (useServerSearch/DataTable) عبر Suppliers/Purchases/Categories
```

**المخاطر والتخفيف:**
- **روابط عميقة مكسورة عند الدمج** → الإبقاء على المسارات القديمة كـ redirects (النمط مستخدم أصلاً).
- **RBAC**: الصفحة المدموجة يجب أن تبوّب كل View بنفس بوابات `permission/feature/capability` (مثال: Inventory لكل view بوابة `inventory`؛ Transfers تحتاج `inventoryTransfers`+`canTransferStock`؛ Accounts: bankAccounts منفصلة).
- **حفظ الحالة** عند تبديل مفتاح الـ workspace.
- **النوافذ المستقلة للتقارير** لا تُحوّل لتابات داخلية (نوافذ Electron منفصلة).
- **نقل ضخم لـ features/** قد يكسر الـ imports → ميزة-بميزة مع إبقاء build أخضر بعد كل خطوة.

---

## 6. مكاسب رقمية متوقّعة
- **−4** صفحات ميتة فوراً.
- **−5..7** صفحات بالدمج (LowStock/ExpiryAlerts/StockMovements في Inventory؛ BankAccounts في Accounts؛ TransferRequests في Transfers؛ RecurringExpenses تبويب).
- إزالة ~3 نماذج CRUD مكررة عبر FormDialogs مشتركة.
- توحيد ~20 موضع قائمة على نمط واحد (مرحلة 6).
