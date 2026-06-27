# تقرير Audit شامل للواجهة الأمامية — تحويل Nuqta Plus إلى تطبيق Windows سطح مكتب احترافي

> **الحالة:** تقرير فحص فقط — لم يُجرَ أي تعديل على الكود.
> **الفرع:** `development` · **التاريخ:** 2026-06-25
> **النطاق:** `frontend/` (Electron + Vue 3 + Vuetify 3 + Pinia + Vue Router) — Backend لم يُمَسّ.

---

## 0. الملخص التنفيذي

البنية الحالية **سليمة وظيفياً ومركزية في طبقة البيانات**، لكنها **تبدو كتطبيق ويب** لأن:

1. نافذة Electron تستخدم **شريط عنوان Windows الافتراضي** (`frame` غير مضبوط) فوق هيكل ويب (Drawer + App-bar زجاجي + Footer تسويقي) → شريطان مكدّسان.
2. الـ Shell هو نمط ويب كلاسيكي (Navigation Drawer + glassmorphism + هامبرغر + footer تسويقي + انتقالات صفحات منزلقة).
3. كثافة العرض `comfortable` (للمس) لا `compact` (لسطح المكتب)، وخطوط Google عبر الشبكة، ولا شريط حالة حقيقي، ولا اختصارات لوحة مفاتيح/قوائم سطح مكتب.

في المقابل، **الأساس موجود بالفعل**: Vuetify يعمل بـ `fluentBlueprint`، وهناك مكتبة مكوّنات مشتركة (لكن اعتمادها غير متسق)، وطبقة axios مركزية نظيفة. التحويل ممكن **تدريجياً دون كسر RBAC أو سلوك الصفحات**.

> ⚠️ **ملاحظة مهمة عن الذاكرة:** ملاحظة الذاكرة "Desktop shell — Phases 1–3 done (title bar/command bar/nav rail/workspace/status bar)" **لا تطابق الواقع على هذا الفرع**. مجلد `src/components/shell/` فارغ، و`MainLayout.vue` لا يزال نمط ويب. كذلك `src/design/tokens.js` المذكور في الذاكرة **غير موجود**. اعتُمد هذا التقرير على الكود الفعلي.

---

## 1. البنية الحالية (Current Architecture)

### 1.1 الأحجام

| الفئة        | العدد                                              |
| ------------ | -------------------------------------------------- |
| Views        | 73                                                 |
| Components   | 68                                                 |
| Layouts      | 3 (`MainLayout`, `AuthLayout`, `PrintLayout`)      |
| Composables  | 14                                                 |
| Pinia Stores | 37                                                 |
| Utils        | 14                                                 |
| Blueprints   | 2 (`fluentBlueprint` نشط، `codelimsBlueprint` ميت) |

### 1.2 Desktop Shell الحالي

- **Electron** (`electron/main/main.js:175`): `BrowserWindow` بـ `1400×900`، **`frame` غير مضبوط ⇒ شريط عنوان Windows افتراضي**. لا `titleBarStyle` ولا `titleBarOverlay`. `removeMenu()` يحذف شريط القوائم (لا File/Edit/View، لا mnemonics). للمقارنة: نافذة الـ splash تستخدم `frame:false` ونافذة التفعيل `frame:true` — أي أن الـ frameless مفهوم في الكود لكنه غير مطبّق على النافذة الرئيسية.
- **preload.cjs**: يكشف `electronAPI.setSize` لكن **لا قنوات `minimize/maximize/close/startDrag`** (مطلوبة لشريط عنوان مخصص). `window:auto-resize` بلا handler (قناة ميتة).
- **`MainLayout.vue`**: `v-navigation-drawer` (rail عرض 165) + `v-app-bar` بـ `glass__main` (backdrop-blur) + `v-main`>`v-container fluid` + `v-footer` تسويقي. يدير: حالة الـ drawer (localStorage)، الثيم، انتقالات الصفحات، توسعة المجموعة النشطة.

### 1.3 Navigation

- مصدر القائمة: `composables/useNavigationMenu.js` — بنية معطيات منظّمة حسب **مجال العمل** (البيع/التجارة الأونلاين/الفواتير/العملاء/المخزون/المشتريات/المالية/التقارير/الإدارة/المحاسبة المتقدمة)، كل عنصر يحمل بوابات `permission/feature/capability/anyFeature/roles`.
- التصفية في `filteredMenu` تخفي المجموعة كاملةً إن اختفت كل عناصرها → **متين ومتوافق مع RBAC**.

### 1.4 RBAC / الراوتر (`router/index.js`)

- **كل الـ views مستوردة بشكل ثابت (static imports)** — لا lazy-loading، لا code-splitting.
- `beforeEach` بوابة مركزية: hydration gate → feature gate → anyFeature → capability → permission (`canAccessRouteMeta`) → setup wizard → guest. **الراوتر هو نقطة الدخول الوحيدة للصفحات** ومتوافق تماماً مع RBAC.
- ثلاث طبقات صلاحيات متناسقة (لا تتعارض): getters في `stores/auth.js` (مصدر الحقيقة) → `auth/permissions.js` (للراوتر/الـ interceptor) → `composables/usePermissions.js` (للمكوّنات).

### 1.5 طبقة الـ API (`plugins/axios.js`) — **نظيفة ومركزية**

- نسخة axios **وحيدة**، الـ `baseURL` يُضبط وقت التشغيل. **لا أي `axios.create`/`interceptors` آخر، ولا أي `window.fetch` في الشيفرة كلها.**
- الـ response interceptor **يفك التغليف** ويُرجع `response.data` (الـ body `{success,data,meta}`)؛ المستهلك يقرأ `res.data` والترقيم `res.meta`.
- معالجة مركزية: loading bar، optional-feature short-circuit، Authorization، FormData، وأخطاء 401/403/404/429/500/Network/Timeout + حوارات تحقّق/صلاحيات.

### 1.6 نظام التصميم — **منقسم (split-brain)**

- `fluentBlueprint.js` و`design-system/index.js` (غير مستورد) يعلنان Fluent أزرق `#0078D4` + Segoe UI.
- لكن `plugins/vuetify.js` يغلّب البنفسجي `#7B5CFF` والخط الفعلي **Roboto** (Material). أي أن "Fluent" نيّة لا واقع.

---

## 2. المشاكل المكتشفة

### 2.1 مشاكل تجعل التطبيق يبدو كـ Web App (الأولوية القصوى)

| #   | المشكلة                                                       | الموقع                                    |
| --- | ------------------------------------------------------------- | ----------------------------------------- |
| 1   | شريط عنوان Windows افتراضي فوق App-bar ويب ⇒ شريطان           | `main.js:175`                             |
| 2   | Footer تسويقي بدل شريط حالة                                   | `MainLayout.vue:216-225`                  |
| 3   | شعار يربط للرئيسية (نمط ويب)                                  | `MainLayout.vue:15-28`                    |
| 4   | هامبرغر يطوي rail دائم                                        | `MainLayout.vue:102-105`                  |
| 5   | Glassmorphism/backdrop-blur على chrome                        | `MainLayout.vue:100,216,539-542`          |
| 6   | حقل بحث وهمي يطلق `window` CustomEvent                        | `MainLayout.vue:114-136,308-310`          |
| 7   | انتقالات صفحات منزلقة (SPA)                                   | `MainLayout.vue:265,418-446,502-537`      |
| 8   | `v-container fluid` يضيف هوامش ويب حول كل صفحة                | `MainLayout.vue:203`                      |
| 9   | كثافة `comfortable` في كل مكان + أرضية 44px للمس              | `fluentBlueprint.js`, `main.scss:115-121` |
| 10  | خطوط Google عبر الشبكة + Roboto افتراضي (يفشل offline)        | `fonts.css:17-24,49`                      |
| 11  | مفتاح الثيم في الـ header (نمط موقع)                          | `MainLayout.vue:163-169`                  |
| 12  | App.vue يكبت middle/ctrl-click "فتح تبويب" — دليل ذهنية الويب | `App.vue:69-82`                           |

### 2.2 أعراف سطح المكتب الناقصة

- لا شريط عنوان مخصص/أزرار نافذة، لا منطقة سحب.
- لا شريط قوائم/أوامر (ribbon/command bar) — الإجراءات مبعثرة في صف أيقونات الـ header.
- لا شريط حالة حقيقي (رغم توفّر `window.api.backend.onStatusChanged` في `preload.cjs:127`).
- اختصارات ضعيفة: `useKeyboardShortcuts.js` فيه Ctrl+K + Escape فقط؛ لا F-keys ولا Alt mnemonics ولا خريطة أوامر عامة.
- لا قوائم سياق (right-click)، لا تخطيط Master-Detail متعدد الأجزاء.

### 2.3 التكرار (Duplication)

- **بحث:** فقط 3 شاشات قوائم تستخدم `SearchBar`+`useServerSearch`؛ +8 شاشات تكرّر `v-text-field` بـ `mdi-magnify` يدوياً.
- **فلاتر (الأعلى تأثيراً):** بطاقة `filter-toolbar` منسوخة يدوياً في **13 شاشة** رغم وجود `FilterBar.vue` غير المستخدم؛ فلتر مدى التاريخ مكرر في **11 ملف**؛ اختيار الفرع/المخزن يدوياً في **11 ملف** رغم `BranchWarehouseSelector.vue`.
- **حوارات:** `ConfirmDialog` مستخدم في 13 فقط مقابل **45 `v-dialog` في 28 ملف**؛ حوارات الإنشاء/التعديل نسخة-لصق موحّدة (~20 موضع).
- **جداول:** نفس سقالة `#loading→TableSkeleton` + `#no-data→EmptyState` مكررة في 30 شاشة.
- **نماذج:** `FormSection`/`FormActions` غير مستخدمة قط؛ كل نموذج كبير يكتب layout + قواعد تحقق + شريط حفظ خاصاً به.
- **تنسيقات العملة/الأرقام/التاريخ:** ≥4 تطبيقات (`formatters.js` القانوني + نسخ خاصة في `helpers.js`/`receiptFormatter.js`/`reportExport.js`) + **~20 ملف Vue يعرّف تنسيقاً inline**.

### 2.4 أخطاء كامنة (آمنة الإصلاح، تُعيد السلوك المقصود)

- `stores/category.js` و`stores/salesChannel.js`: يقرآن `response.data.meta` بعد فكّ التغليف ⇒ **الترقيم لا يتحدّث أبداً**.
- `composables/useCurrency.js:72`: `response.data.data.convertedAmount` بعد الفكّ ⇒ **نتيجة تحويل العملة تُهمل دائماً** وتعود للقيمة الأصلية.
- تصادم أسماء: `composables/useExport.js` فيه `exportToExcel`/`exportToPDF` **وهمية** (Excel=CSV، PDF=outerHTML) بنفس أسماء الحقيقية في `utils/reportExporters.js`.

### 2.5 الأداء

- استيراد ثابت لـ ~70 view ⇒ حزمة واحدة ضخمة، بدء أبطأ. lazy-loading يحسّن زمن الإقلاع (مهم لإحساس سطح المكتب).

---

## 3. الملفات المرشحة للحذف (Dead Code — مؤكَّدة 0 مرجع)

> تحقّقنا عبر الـ imports + الراوتر + الاستخدام في القوالب (PascalCase وkebab-case). لا تسجيل عام/auto-import في المشروع.

**مكوّنات ميتة (مستبدَلة فعلاً):**

- `components/AlertsPanel.vue` — استُبدل بـ `dashboard/control/AlertsCenter.vue`.
- `components/dashboard/RevenueChart.vue`
- `components/dashboard/SalesStatusChart.vue`
- `components/dashboard/TopProductsChart.vue`
- `components/dashboard/RoleHero.vue` — (Dashboard لا يستورد أي charts).

**شاشات ميتة (مستبدَلة براوتر موحّد/redirect):**

- `views/delivery/DeliveryTracking.vue` — الراوت يعيد التوجيه لـ `DeliveryShipments`.
- `views/reports/DeliveryReports.vue` — استُبدلت بـ `OnlineCommerceShippingReports`.
- `views/reports/OnlineCommerceReports.vue` — كذلك.
- `views/reports/SimpleReports.vue` — راوتها معلّق (comment-only).

**أخرى:**

- `blueprints/codelimsBlueprint.js` — `fluentBlueprint` هو النشط.

> ⚠️ **لا تُحذف** `FilterBar.vue` / `FormActions.vue` / `FormSection.vue` / `PageSection.vue` / `DataCard.vue` رغم كونها 0-مرجع — هذه **"مبنية وغير معتمَدة"**، والخطة هي **اعتمادها** (القسم 5)، لا حذفها. قرار `PageSection`/`DataCard` يُؤجَّل حتى تثبيت مكوّنات الـ Shell.

---

## 4. الملفات المرشحة للدمج (Merge / Consolidate)

| العناصر                                                                       | القرار                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `stores/category.js` + `stores/salesChannel.js`                               | توأمان حرفياً ⇒ دمج عبر `createCrudStore` factory.                               |
| `stores/supplier.js` + `expenses.js` + `purchase.js` + `recurringExpenses.js` | نفس شكل CRUD+ترقيم ⇒ factory (Bucket A).                                         |
| `stores/customer.js` + `product.js`                                           | ~90% متطابقان (optimistic) ⇒ factory بعَلم `optimistic` مع إبقاء الحالات الخاصة. |
| كتلة تطبيع الترقيم (8 stores)                                                 | استخراج `normalizePagination(meta, prev)` مشترك (أقل خطوة خطورةً — ابدأ بها).    |
| `_params()` في `deliveryReport.js` + `onlineCommerceReport.js`                | استبدالها بـ `cleanParams` من `utils/requestParams.js`.                          |
| `ReportHeader.vue` ↔ `PageHeader.vue`                                         | مكوّنا ترويسة لنفس الغرض — توحيد.                                                |
| `useExport.js` (وهمي) ↔ `reportExporters.js` (حقيقي)                          | إزالة/إعادة توجيه الوهمي لمنع تصادم الأسماء.                                     |
| تنسيقات inline (~20 ملف) + نسخ `helpers/receiptFormatter/reportExport`        | توحيد على `utils/formatters.js` (مع فحص متغيّرات `style:'currency'`).            |

> **ليست تكراراً (لا تُدمج):** `report.js`/`deliveryReport.js`/`onlineCommerceReport.js` (مجالات مختلفة)، `notification.js`/`notificationSettings.js`، `inventory.js`/`inventoryDialog.js`، `reportExport.js`/`reportExporters.js` (طبقتان: تشكيل بيانات مقابل إخراج — يُقترح فقط إعادة تسمية `reportExport.js`→`reportExportModel.js`).

---

## 5. الملفات المرشحة للتقسيم (Split — مكوّنات ضخمة)

| الملف                                       | الأسطر | اقتراح التقسيم                                                                                            |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `views/sales/PosScreen.vue`                 | 2968   | ⚠️ **لا تمسّ منطق `usePosCart`**؛ استخرج فقط أجزاء العرض (شبكة المنتجات، لوحة السلة، شريط الدفع، modals). |
| `views/sales/NewSale.vue`                   | 1685   | استخرج جدول البنود، محرّر القسط/الجدول، شريط الإجمالي، اختيار العميل.                                     |
| `views/sales/SaleDetails.vue`               | 1599   | بطاقات الملخص، جدول البنود، جدول الدفعات، الخط الزمني (مكوّنات عرض).                                      |
| `views/online-orders/OnlineOrders.vue`      | 1402   | شريط الحالة/الفلاتر، الجدول، حوار التفاصيل/التحويل لبيع.                                                  |
| `views/customers/CustomerProfile.vue`       | 1369   | بطاقة الرأس، تبويبات (الفواتير/الديون/الدفعات).                                                           |
| `views/products/ProductForm.vue`            | 1285   | أقسام النموذج (أساسي/تسعير/مخزون/خدمة) عبر `FormSection`.                                                 |
| `components/reports/ReportWindow.vue`       | 634    | محرّك مشترك — تقسيمه إلى رأس/فلاتر/جداول/رسوم (بعضها موجود).                                              |
| `components/settings/MessagingSettings.vue` | 532    | فصل لكل قناة (SMS/WhatsApp).                                                                              |

> قاعدة: التقسيم **عرضي فقط** (presentational extraction) — منطق الأعمال/الـ stores يبقى مكانه.

---

## 6. المكوّنات المشتركة المطلوب إنشاؤها/اعتمادها

> الأولوية = التأثير × عدد المواضع. الأرقام تقديرية من الفحص.

1. **اعتماد `FilterBar.vue`** (موجود) في الـ13 بطاقة فلتر يدوية.
2. **`DateRangeFilter.vue`** (جديد) — حقلا `dateFrom/dateTo` (يعالج اختلاف `startDate/endDate` مقابل `dateFrom/dateTo`) — 11 موضع.
3. **اعتماد `BranchWarehouseSelector.vue`** (موجود) — 11 موضع.
4. **`FormDialog.vue`** (جديد) — يغلّف `v-dialog/v-card` + عنوان (إنشاء/تعديل) + slot نموذج + شريط إجراءات يستعمل `FormActions.vue` → يبتلع ~20 حواراً ويحيي `FormActions`.
5. **اعتماد `SearchBar.vue`+`useServerSearch`** في ~8 شاشات قوائم متبقية.
6. **اعتماد `FormSection.vue`/`FormActions.vue`** + `validators.js` مشترك (required/positive/phone/email) بدل closures عربية مكررة.
7. **`DataTable.vue`** (wrapper) — `headers/items/loading` + كثافة وحجم صفحة افتراضيان + slotا `#loading`(TableSkeleton)/`#no-data`(EmptyState).
8. **`ListToolbar.vue`** (جديد) — عنوان/عدّاد + slot إجراءات + شريط تحديد جماعي اختياري (9 مواضع).
9. **تعميم `ReportExportActions.vue`** إلى `ExportActions.vue` عام (refresh+Excel+PDF+print) للقوائم والتفاصيل.

### مكوّنات Shell جديدة (للقسم 7)

`shell/TitleBar.vue` · `shell/CommandBar.vue` · `shell/NavRail.vue` (إعادة هيكلة الحالي) · `shell/StatusBar.vue` · `composables/useWindowControls.js`.

---

## 7. التصميم المقترح لـ Desktop Shell (5 مناطق — WinUI/Fluent، يحافظ على Light/Dark + RTL)

> كل المناطق تستخدم رموز `--v-theme-surface`/`on-surface` والبنفسجي `#7B5CFF`؛ والاتجاهات بـ flex/logical ⇒ RTL تلقائي.

**0. إطار النافذة** — `main.js:175`: أضف `frame:false` (أو `titleBarStyle:'hidden'` + `titleBarOverlay` كأبسط مسار). في `preload.cjs`: قنوات `windowControls:{minimize,maximize,close,isMaximized,onMaximizeChange}` + `ipcMain.handle` مقابلة في `main.js` (أعد استخدام تأكيد الإغلاق الموجود `main.js:281-312`).

**1. شريط العنوان (TitleBar)** — شريط 32–40px، `color="surface"`، `-webkit-app-region:drag` على الشريط و`no-drag` على الأبناء. البداية: أيقونة + عنوان المستند (من `currentPageTitle`) **لا رابط راوتر**. النهاية: min/max/close مخصصة (close hover = أحمر). خلفية معتمة بلا blur.

**2. شريط الأوامر (CommandBar)** — يستبدل الـ app-bar الحالي: `v-toolbar density="compact"` معتم + `border="b-sm"` بلا glass. قوائم نمط Office (`ملف/تحرير/عرض/تقارير/مساعدة`) مع mnemonics أو مجموعة إجراءات سياقية تتبدّل حسب الراوت. انقل بحث Ctrl+K لحقل صغير مرسى يميناً (احذف الـ pill الكبير). أبقِ الجرس وقائمة المستخدم؛ **انقل مفتاح الثيم إلى عرض/الإعدادات**.

**3. شريط التنقل (NavRail)** — أبقِ `v-navigation-drawer rail permanent` لكن: استبدل الهامبرغر بزرّ تثبيت (pin)، الشعار برمز هوية غير تفاعلي، `v-tooltip` على الأيقونات عند الطيّ، `rounded="md"` بمؤشّر تحديد جانبي بدل الـ pill، والمجموعات كـ fly-out في وضع rail.

**4. مساحة العمل (Workspace)** — `v-main` بخلفية معتمة، احذف `v-container fluid` (أو `pa-0` ودع الصفحات تملك حشوها)، **احذف الانتقالات المنزلقة** (تبديل فوري أو cross-fade ≤80ms)، وتبنّ **Master-Detail** لشاشات القائمة←السجل بدل صفحة كاملة منزلقة.

**5. شريط الحالة (StatusBar)** — يستبدل الـ footer التسويقي: شريط 24–28px `border="t-sm"` معتم 12px يعرض حالة حيّة: نقطة حالة الـ backend (من `onStatusChanged`)، الفرع/المخزن النشط، المستخدم+الدور، عدّاد سجلات/تحديد الصفحة، وقت المزامنة، ساعة. (انقل حقوق "كودل" إلى "حول" فقط).

**تغييرات عابرة:** كثافة `compact` افتراضية لـ VTextField/VSelect/VList/VBtn/VTable في `fluentBlueprint.js`، إزالة أرضية 44px (`main.scss:115-121`)، اعتماد **Segoe UI** خطاً رئيسياً (معلن أصلاً في `design-system/index.js:93`) + استضافة Cairo/Tajawal محلياً وحذف `@import` خطوط Google (`fonts.css:17-24`)، واستبدال `glass__main` بأسطح معتمة (Mica).

---

## 8. خطة Migration تدريجية (كل مرحلة تُبقي الـ build أخضر وتُختبر منفصلة)

> القاعدة عبر كل المراحل: **لا تغيير في Backend APIs، لا كسر RBAC، لا تغيير سلوك تجاري، حذف فقط بعد تأكيد 0-مرجع.**

**المرحلة 0 — تنظيف آمن (لا أثر بصري):**

- احذف الـ15 ملفاً المؤكّدة (القسم 3). أصلح الأخطاء الكامنة (category/salesChannel pagination، useCurrency:72، تصادم useExport). build + lint.

**المرحلة 1 — أساس Shell (Electron + frame):**

- `frame:false` + قنوات window controls + `shell/TitleBar.vue` + `shell/StatusBar.vue` (يستبدل الـ footer). أبقِ بقية الـ MainLayout كما هي مؤقتاً. اختبار: min/max/close/drag، الثيمان.

**المرحلة 2 — CommandBar + NavRail:**

- استبدل الـ app-bar الزجاجي بـ `CommandBar` معتم، أزل الهامبرغر/الشعار-الرابط، صغّر البحث، انقل الثيم. de-glass + الكثافة compact.

**المرحلة 3 — Workspace:**

- احذف `v-container fluid` والانتقالات المنزلقة. (Master-Detail لاحقاً لكل وحدة على حدة.)

**المرحلة 4 — توحيد الخطوط/الثيم:** Segoe UI + استضافة محلية + حذف Google Fonts + توحيد التصميم البنفسجي-على-Fluent.

**المرحلة 5 — المكوّنات المشتركة (تدريجي، شاشة-شاشة):**

- بالترتيب: `FilterBar`+`DateRangeFilter`+`BranchWarehouseSelector` → `FormDialog`(+FormActions) → `SearchBar`/`useServerSearch` → `FormSection`+`validators.js` → `DataTable` → `ListToolbar`/`ExportActions`. استخدم `Suppliers.vue`/`Expenses.vue`/`Cashboxes.vue` كقوالب تحويل.

**المرحلة 6 — طبقة البيانات (لا أثر بصري):**

- `normalizePagination` المشترك → `createCrudStore` لـ category/salesChannel/Bucket A → customer/product بعَلم optimistic. توحيد تنسيقات inline على `formatters`.

**المرحلة 7 — تحسينات سطح المكتب:**

- lazy-loading للـ views (code-splitting)، خريطة اختصارات F-keys/Alt mnemonics، قوائم سياق (right-click)، Master-Detail.

---

## 9. المخاطر المحتملة

| الخطر                                                 | التخفيف                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `frame:false` يكسر السحب/التكبير/أزرار النافذة        | اختبر القنوات الجديدة على ويندوز فعلي؛ بديل أأمن `titleBarOverlay` يبقي الأزرار الأصلية.                       |
| كسر RBAC عند نقل الإجراءات للـ CommandBar             | أبقِ نفس بوابات `permission/feature/capability`؛ الراوتر يبقى الحارس الوحيد.                                   |
| توحيد الحوارات/النماذج يغيّر سلوك حفظ/تحقق            | حوّل شاشة-شاشة مع اختبار يدوي لكل CRUD؛ أبقِ الحالات الخاصة (product `isUpdatingFromAPI`, customer phone-dup). |
| `createCrudStore` يكسر شكل استجابة معيّن              | ابدأ بـ `normalizePagination` فقط؛ هاجر store واحداً وتحقّق قبل التعميم.                                       |
| تغيير تنسيق العملة (`style:'currency'`) يغيّر الإخراج | افحص المتغيّرات الأربعة يدوياً قبل الاستبدال.                                                                  |
| حذف `PageSection`/`DataCard` قبل ثبات الـ Shell       | أجّل قرارها للمرحلة 5+.                                                                                        |
| استضافة الخطوط محلياً تغيّر الميتريك/التخطيط          | تحقّق بصري للعربية (Cairo/Tajawal) في الثيمين.                                                                 |
| كثافة `compact` تكسر تخطيطات افترضت `comfortable`     | غيّرها كافتراضي عام وافحص الشاشات الكثيفة (POS/الجداول الكبيرة).                                               |

---

## 10. ترتيب التنفيذ (موصى به)

```
0  تنظيف Dead Code + إصلاح الأخطاء الكامنة     (مخاطرة منخفضة، مكسب فوري)
1  Electron frame + TitleBar + StatusBar       (أكبر أثر "ناتيف")
2  CommandBar + NavRail + de-glass + compact
3  Workspace (إزالة container/الانتقالات)
4  الخطوط + توحيد الثيم
5  المكوّنات المشتركة (شاشة-شاشة)
6  طبقة البيانات (factory + توحيد التنسيقات)
7  lazy-load + اختصارات + قوائم سياق + Master-Detail
```

المراحل 0–4 تعطي **الإحساس بسطح المكتب** بأقل خطر، والمراحل 5–7 تعطي **النظافة الهيكلية وتجربة الاستخدام المتقدمة**. كل مرحلة قابلة للشحن بمفردها مع build أخضر.
