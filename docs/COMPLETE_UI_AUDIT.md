# جرد شامل لواجهات Nuqta Plus + خطة تنفيذ مرتّبة معمارياً

> جرد قراءة-فقط Module-by-Module (4 وكلاء متوازية). **لا تعديل.** يعكس الحالة الحالية بعد بناء البنية التحتية (Shell/Nav/Commands/Palette/Kit/API) وترحيل ميزة Customers.

---

## 0. الخلاصة المركزية

البنية التحتية للـ Desktop **مبنية**، لكن **وحدة واحدة فقط (Customers) اعتمدتها**. كل الـ Modules الأخرى (~25 view) ما زالت على النمط الويب القديم: `<div class="page-shell">` + `PageHeader` + `<v-card class="page-section">` + `<v-data-table>` بكثافة `comfortable`، وكل زر New/Edit/Delete/Refresh/Export/Print مكتوب يدوياً في القالب (لا في Command Registry). **هذا هو فجوة العمل الرئيسية.**

**حالة الترتيب المعماري (1–11):**
| # | المرحلة | الحالة |
|---|---|---|
| 1 | Desktop Shell | ✅ مكتمل (5 مناطق) |
| 2 | Navigation | ✅ مكتمل (registry + RBAC) |
| 3 | Command Registry | ✅ مكتمل (core نقي + useCommands) |
| 4 | Command Bar | ✅ مكتمل |
| 5 | Command Palette | ✅ مكتمل (Ctrl+Shift+P) |
| 6 | Shared Desktop Components | ✅ أساس مبني (UI kit) · 🔶 الاعتماد ناقص |
| 7 | Tabs & Workspaces | 🔶 جزئي (WorkspaceTabs في CustomerProfile فقط؛ 7 مواضع v-tabs قديمة) |
| 8 | Module-by-module page refactoring | 🔴 **متبقٍّ (الجزء الأكبر — Customers فقط مُرحّلة)** |
| 9 | API Interceptors | ✅ أساس · 🔶 اعتماد `meta.handled`/`runAction` في Customers فقط |
| 10 | Dead code cleanup | 🔶 جزئي (حُذف 17 ملف؛ وُجد 2+ ميتة جديدة) |
| 11 | Final testing | 🔁 مستمر |

---

## 1. جرد Module-by-Module

> القالب لكل Module: صفحات · تابات · تكرار · ملفات كبيرة · Dead code · UX · أوامر في القوالب · القرار.

### Dashboard
- **صفحات:** `Dashboard.vue` (200) + 8 لوحات `dashboard/control/*` + `WorkHub.vue`. تابات: `RecentActivity` (4 داخلية).
- **Dead:** **`WorkHub.vue` (300 LOC) ميت** (0 import). · **UX:** Refresh/Customize في الهيدر (ويب) — لأوامر؛ اختصارات F2–F10 محلية فقط (يجب أن تكون أوامر عامة).
- **القرار:** Dashboard **إبقاء** (Refresh/Customize→commands)؛ QuickActionsBar **إبقاء+ربط الاختصارات بالـ registry**؛ AlertsCenter **تقسيم**؛ **WorkHub → حذف**.

### Products + Categories
- **Products** (639): قائمة useServerSearch — **إبقاء+اعتماد kit**. **ProductForm** (1285، الأكبر): نموذج طويل + bugs (`handleBarcodeScan` لا يفعل شيئاً، textarea ملاحظات الخدمة **بلا v-model**) — **تقسيم**+إصلاح. **Categories** (215): بلا بحث، double-binding في `items-per-page` — **تحويل تبويب** ضمن «المنتجات والمرجعيات».

### Sales / POS / Invoices
- **Sales** (805) قائمة — إبقاء+kit. **NewSale** (1685) — **تقسيم** (line-items/installment/summary). **SaleDetails** (1599) — **تقسيم + تحويل تبويب** (تفاصيل/دفعات/مرتجعات/شحن). **PosScreen** (2968) — **تقسيم** (grid/cart/numpad/drafts) دون لمس `usePosCart`.
- تكرار: formatters من مصدرين (`helpers` vs `formatters`)؛ ReturnDialog/PaymentDialog/TreasuryTarget مكررة مع Purchases.

### Collections (الديون)
- `Collections.vue` (223) — إبقاء+kit؛ استبدال «رقم الفرع» النصّي بـ branch select؛ توحيد `formatters`.

### Suppliers
- **Suppliers** (282): CRUD حوار + **`window.confirm` للحذف** — إبقاء/مواءمة نمط customers + `EntityFormDialog`. **SupplierProfile** (171): **تابات أصلاً** (3) — **إبقاء** (نموذج مرجعي للتابات)، تحميل متوازٍ.

### Purchases
- **Purchases** (187) — إبقاء+kit. **NewPurchase** (378) — استخراج `LineItemsTable`+`TreasuryTargetSelect`. **PurchaseDetails** (455) — **تحويل تبويب** (بنود/مرتجعات/سندات)+استخراج الحوارات المشتركة.

### Returns
- **ليست Module مستقلة** — مدمجة في SaleDetails (`createReturn`) وPurchaseDetails (حوارات متشابهة). يلزم `ReturnDialog` مشترك.

### Inventory / Warehouses / Transfers
- **Inventory** (681، الأكبر) hub — **إبقاء وطيّ الأشقّاء فيه**؛ يحمل أصلاً بيانات LowStock/Expiry. dead computeds (`conversionForSelected`...). **StockMovements** (175) — تبويب. **LowStock** (141) — **دمج/حذف→تبويب**. **ExpiryAlerts** (94) — **دمج→تبويب**. **StockTransfer** (248، الوحيد بـ raw axios) + **TransferRequests** (207) — **دمج→صفحة نقل واحدة**. **BranchesWarehouses** (494) — إبقاء (مرجعي).

### Expenses
- **Expenses** (489) + **RecurringExpenses** (610) — تكرار byte-identical (categories/treasury/dialog)؛ `window.confirm`. **دمج shell→`ExpensesWorkspace` بتبويبين** (جداول مختلفة، ليس دمج سجلات) + استخراج `useExpenseCategories`/`useTreasuryTargets`.

### Accounting Periods
- `AccountingPeriods.vue` (472) — **إبقاء** (مجال مستقل)؛ استخراج `SummaryRow`/P&L grid إلى `ui` (يفيد reports/dashboard)؛ Open/Close→commands.

### Treasury / Cash *(لا Cash Sessions — نظام الورديات أُزيل)*
- **Cashboxes** (282) + **BankAccounts** (249) — **دمج→`Accounts` بتبويبين** (~90% تطابق)+`AccountFormDialog`. **CashboxLedger** (150) — **لوحة تفاصيل** (master-detail)+طباعة/تصدير مفقودة. **Vouchers** (261)+**TreasuryTransfers** (293) — إبقاء، استخراج `TransferFormDialog`+`CancelReasonDialog` (محل `window.prompt`). كل الـ5: فشل صامت (`console.error` فقط).

### General Ledger (المحاسبة)
- **ChartOfAccounts** (311)+**JournalEntries** (285)+**SystemAccounts** (139)+**PostingFailures** (124) على store واحد → **`GlWorkspace` بتبويبات مُبوّبة بالصلاحيات**. **ManualJournalForm** (202، غير مُوجّه) → **نقل إلى `components/gl/`**. تكرار: `GlEditDialog`+`JournalLinesTable`؛ `confirm/prompt` أصلية.

### Reports (3 أنظمة متوازية)
- **Reports** (432) المحرّك القانوني — إبقاء. **FinancialReports** (317، تابات trial/income/balance/ledger) — إبقاء+تصدير. **InventoryValuation** (279) — إبقاء+إعادة استخدام KpiCard. **OnlineCommerceShippingReports** (607، 6 تابات) — **تقسيم تابات لمكوّنات**. **6 نوافذ مستقلة** (`ReportWindow`+`reportConfigs`) — إبقاء. **لا مكوّنات تقارير ميتة** (الـ11 كلها مستخدمة). توحيد: `useReportDateRange` + مُصدّر واحد + KpiCard.

### Online Commerce
- **OnlineOrders** (1402) god-component — **تقسيم** (`OnlineOrderFormDialog`+`DetailsDialog`)؛ dead `canCancel`/`confirmCancel`. **SalesChannels** (312) — إبقاء/تبويب. **DeliveryShipments** (341) — إبقاء. **ShipmentDetails** (408، 9 cards) — **تحويل تبويب**. تكرار: formatters/timeline/badge عبر الأربعة.

### Settings (hub + sub-pages)
- **Settings.vue** (205) تابات (7)، يركّب 9 مكوّنات (لا أيتام). **MessagingSettings** (532، الأكبر) — تنظيف ~60 سطر ميت. **الصفحات الفرعية** (FeatureFlags/SetupWizard/OpeningBalances/DeliveryProviders/Boxy*/Generic*) منفصلة عن الـ hub (فجوة اكتشاف). **BoxySettings** (225) vs **GenericProviderSettings** (284) ~85% تكرار → **دمج/`ProviderCredentialForm`**.

### Backup / Restore
- **BackupManager** (309) vs **DataBackupRestore** (381) — **نظامان متوازيان على نفس التبويب** (IPC ومسارات مختلفة). **دمج** على DataBackupRestore + **فصل تصفير القاعدة إلى Danger Zone مُحصّنة** (BackupManager فقد عبارة «تصفير» المكتوبة + سبب — **انحدار** عن مواصفة التحصين؛ بلا `can()` guard).

### License + Updates
- **LicenseStatus** (187)+**Activation** (268، تابات file/key) — استخراج `licenseErrors.js`+`useMachineId`. **UpdateNotification** (326) — **يستهلك `useUpdater.js`** بدل إعادة تسجيل 7 قنوات inline (خطر double-teardown).

### Users / Roles / Permissions
- **Users** (601، الأكبر في القسم) — **تقسيم** (حوار النموذج+إعادة التعيين)+اعتماد SearchBar؛ `console.log` متبقٍّ. **Roles** (343) master-detail بـ v-row — **إبقاء**+اعتماد `DesktopSplitView`. Permissions = ضمن RBAC/`auth/*`.

### Notifications
- `Notifications.vue` (310) + `NotificationFailures` (215) — **تكرار مع Dashboard AlertsCenter** → `AlertList` مشترك؛ NotificationFailures تستخدم axios inline → store/service.

### Auth / Onboarding / Errors / Layouts
- Login/Activation/Profile/About/Forbidden **إبقاء** (+حُرّاس `typeof` لـ Electron). **ServerSetup** (459) — **تقسيم**. **`FirstRun.vue` (0 bytes) — حذف.** Layouts: MainLayout(thin→DesktopShell)/AuthLayout إبقاء؛ PrintLayout محذوف ✅.

---

## 2. الطبقة المشتركة (Cross-Cutting)

- **مكوّنات مشتركة:** `PageHeader` (55 مستهلك)، `EmptyState` (36)، TableSkeleton(15)، ConfirmDialog(13)، PaginationControls(9)، StatCard(5)، SearchBar/AdvancedFilters(3–4). **تصحيح:** `FilterBar`/`FormSection` ليستا ميتتين — مُعاد تصديرهما في `ui/index.js` (DesktopFilterBar/FormSection) = **API kit بانتظار الاعتماد**. `ReportHeader` ≈ `PageHeader` (مستهلك واحد) → دمج.
- **Composables:** usePermissions(16)، useLoading(7)، useNavigation/useShellLayout(6). **`useNativeNotification` 0 مستهلك** (primitive بُني للمهمة السابقة، غير معتمد). تداخل: `useKeyboardShortcuts`+`usePageShortcuts`+`useCommandShortcuts` (3 أنظمة اختصارات)؛ `useQuickSearch` (palette قديمة) vs `useCommandPalette`.
- **Stores:** 37، **لا ميت** (currency حُذف سابقاً).
- **Routes:** ~60 سجل، 4 redirects مقصودة، حارس `beforeEach` واحد، لا تكرار.
- **Commands:** 13 id مسجّلة؛ Command Bar + Palette من **نفس** `useCommands` ✅. **الفجوة:** أزرار الإجراءات inline في ~25 view (تعديل 26 ملف، جديد 29، إضافة 20، حذف 18، تحديث 15...) **غير مسجّلة** — Customers فقط مُرحّلة.
- **API:** عميل واحد `plugins/axios` (47 ملف)؛ طبقة `api/*` للأخطاء؛ لا `fetch` خام؛ 3 `axios.get` مقصودة (probes قبل توفّر baseURL)؛ **NotificationFailures يستخدم axios inline** (flag).
- **Electron IPC:** الجسور متطابقة عموماً. **أيتام:** `window:auto-resize`/`setSize` (ميت)؛ 5 معالجات `backend:*` update بلا مستهلك (UI لم يُبنَ)؛ **`invoke` العام في preload لا يزال موجوداً** (يستخدمه UpdateNotification) — راجعته الذاكرة كـ«مُزال» — **flag أمني**.
- **ملفات ميتة جديدة (آمنة الحذف):** `views/FirstRun.vue` (0 bytes)، `components/dashboard/WorkHub.vue` (300). **مرشّح:** `useNativeNotification.js` (غير معتمد).

---

## 3. قوائم موحّدة

**حذف:** WorkHub.vue · FirstRun.vue · (مرشّح) useNativeNotification.js · أيتام IPC (`window:auto-resize`) · أكواد debug (`console.log` ×5، void props، dead computeds، canCancel/confirmCancel...).

**دمج (مرتّب بالقيمة):**
1. Inventory + LowStock + ExpiryAlerts → Inventory hub (3→1، ~235 LOC).
2. Cashboxes + BankAccounts → `Accounts` (تبويبان، ~500 LOC).
3. StockTransfer + TransferRequests → صفحة نقل واحدة (+يحلّ raw-axios).
4. GL (4 صفحات) → `GlWorkspace`.
5. Expenses + RecurringExpenses → `ExpensesWorkspace`.
6. BackupManager + DataBackupRestore → نظام نسخ واحد + Danger Zone.
7. BoxySettings + GenericProviderSettings → `ProviderCredentialForm`.
8. Products + Categories → workspace.
9. Notifications ↔ Dashboard AlertsCenter → `AlertList`.

**تقسيم (>400/متعدّد المسؤوليات):** PosScreen(2968) · NewSale(1685) · SaleDetails(1599) · OnlineOrders(1402) · ProductForm(1285) · OnlineCommerceShippingReports(607) · Users(601) · BranchesWarehouses(494) · ServerSetup(459).

**تحويل تبويب (DesktopTabHost):** SaleDetails · PurchaseDetails · ShipmentDetails · (توحيد الـ7 v-tabs القديمة على WorkspaceTabs).

**مكوّنات مشتركة تُنشأ (كلٌّ يخدم >1 Module):** `ListPageScaffold` · `EntityFormDialog` · `ReturnDialog` · `PaymentDialog` · `TreasuryTargetSelect`(+util) · `LineItemsTable` · `AccountFormDialog` · `GlEditDialog` · `JournalLinesTable` · `CancelReasonDialog` · `StatusTimeline` · `ChannelBadge` · `ProviderCredentialForm` · `CopyableField`/`useMachineId` · `AlertList` · `SummaryRow/PnlGrid`→ui · `useReportDateRange` · توحيد formatters على `@/utils/formatters`.

---

## 4. خطة التنفيذ (مرتّبة بالتأثير المعماري) — المتبقّي

> المراحل 1–6 من البنية مكتملة. العمل المتبقّي يتركّز في 7–11. كل دفعة: typecheck+lint+test+build، وعرض «أُنجز/تبقّى من Modules».

**الدفعة 0 — تنظيف سريع آمن:** حذف WorkHub + FirstRun + يتيم `window:auto-resize`؛ حسم `useNativeNotification`؛ إزالة console.log/dead computeds الموثّقة.

**الدفعة 1 — المكوّنات المشتركة (تفتح بقية الـModules، كلٌّ يخدم >1):** `ListPageScaffold` + `EntityFormDialog` + `TreasuryTargetSelect` + `LineItemsTable` + `ReturnDialog` + `PaymentDialog` + `CancelReasonDialog` + `AlertList` + `KpiCard reuse` + `useReportDateRange` + توحيد formatters.

**الدفعة 2 — توحيد التابات/Workspaces:** اعتماد `DesktopTabHost` محل الـ7 v-tabs القديمة؛ بناء الـ workspaces المدموجة (Inventory/Accounts/Transfers/GL/Expenses/Products) عبر merges + redirects.

**الدفعة 3..N — Module-by-module page refactoring (الجزء الأكبر، بالترتيب):**
- **A. القوائم** (ListPageScaffold + commands + context-menu + multi-select): Sales · Purchases · Suppliers · Collections · Products · Users · Vouchers · TreasuryTransfers · SalesChannels · OnlineOrders(list) · GL lists.
- **B. التفاصيل→تابات + تقسيم:** SaleDetails · PurchaseDetails · ShipmentDetails؛ تقسيم POS/NewSale/OnlineOrders/ProductForm/ServerSetup/Users.
- **C. الإعدادات/النسخ/الترخيص/التحديث:** دمج النسخ + ProviderCredentialForm + useUpdater + تنظيف MessagingSettings.

**الدفعة M — اعتماد API:** `meta.handled`/`runAction`/`useFormErrors` عبر كل الـModules المُرحّلة (إزالة توست stores المزدوج).

**الدفعة N — تنظيف نهائي + اختبار شامل:** حذف ما تبقّى ميتاً، مراجعة `invoke` العام وأيتام `backend:*`، typecheck/lint/test/build + packaging + smoke.

**أعلام أعمال (لا تُعدّل كـ business logic — تُصلَح فقط عند الترحيل بموافقة):** ProductForm (`handleBarcodeScan`/textarea بلا v-model) · Categories double-binding · انحدار تحصين «تصفير» في BackupManager · فشل Treasury/GL الصامت · `invoke` العام/أيتام IPC.
