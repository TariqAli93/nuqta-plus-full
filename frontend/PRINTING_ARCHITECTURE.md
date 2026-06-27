# نظام الطباعة والمعاينة الموحّد — Nuqta Plus

نظام طباعة/معاينة/PDF للفواتير مبني من **مصدر واحد**: نفس مكوّن Vue
(`ReceiptPrint.vue`) يُستخدم للمعاينة والطباعة و PDF، فلا يختلف شكل المعاينة عن
المطبوع. **Electron main لم يعد يبني HTML** ولا يستخدم `document.write`.

## مسار الطباعة الجديد

```
صفحة البيع (SaleDetails.vue)
  └─ normalizeInvoiceForPrint({ sale, companyInfo })   → Print DTO نظيف قابل للـ IPC
       └─ window.electronAPI.print.previewInvoice / printInvoice / exportInvoicePdf
            └─ [main] printIpc → enrichData (يحوّل مسار الشعار إلى data URL)
                 └─ printJobStore.create(job)  (يخزّن الـ DTO ويُعيد jobId صغير)
                      ├─ معاينة: نافذة مرئية على  /print/preview/:jobId (PrintPreviewWindow + شريط أدوات)
                      └─ طباعة/PDF: نافذة مخفية على /print/render/:jobId (PrintRenderWindow فقط)
                           └─ [main] waitForPrintReady (DOM فيه نص → fonts → images)
                                └─ webContents.print / printToPDF (مع حارس buffer<1000)
```

- **صفحتان منفصلتان**: `/print/preview/:jobId` (مع شريط الأدوات) و
  `/print/render/:jobId` (الفاتورة فقط بلا أي chrome) — الطباعة و PDF تستخدمان
  صفحة الـrender حصراً فلا يتسرّب أي عنصر واجهة إلى المخرجات.
- **المعاينة** (`print:preview-invoice`): نافذة مرئية فيها شريط أدوات
  (ورق/ثيم/طابعة/نسخ/طباعة/PDF/إغلاق) ومعاينة حيّة تتغيّر فورياً.
- **الطباعة** (`print:invoice`): نافذة مخفية تُرسم ثم `webContents.print`. تدعم
  اختيار الطابعة، النسخ، والطباعة الصامتة.
- **PDF** (`print:invoice-pdf`): نافذة مخفية ثم `webContents.printToPDF` + حوار حفظ.
- **الجاهزية + بوابة DOM إجبارية** (سبب PDF الأبيض كان تنفيذ `printToPDF` قبل وصول
  المحتوى للـDOM): النافذة المخفية تحمل preload التطبيق + `paintWhenInitiallyHidden`
  - `backgroundThrottling:false`. صفحة `/print/render/:jobId?rt=token` ترسل
    `notifyReady(token)` بعد ظهور نص حقيقي (poll بـsetTimeout) + الخطوط + الصور.
    main ينتظر إشارة الـtoken (`printReadyStore`) ثم **يفحص الـDOM إجبارياً**
    (`inspectRenderDom`: paperExists & paperTextLength≥20)؛ لو فارغ يكتب
    `print-debug.html` + `print-debug.png` في userData ويرمي خطأ. ناتج PDF أصغر من
    1500 بايت = فشل (مع debug). `printToPDF` بالإنشات و`print` بالميكرونات.
- **ارتفاع الرول محسوب من المحتوى**: للرولات الحرارية يُقاس الارتفاع الفعلي
  للفاتورة (`measureContentHeightMM`) ولا يُفرض ارتفاع ثابت (297mm). A4/A5 أبعاد ثابتة.

## الملفات

### جديدة — Electron main (تُحزَّم تلقائياً ضمن `dist-electron/main`)

| الملف                                  | الدور                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| `electron/print/paperPresets.js`       | أحجام الورق (نسخة main: هندسة الصفحة)                   |
| `electron/print/printJobStore.js`      | تخزين مؤقت للـ jobs + TTL                               |
| `electron/print/logoStore.js`          | حفظ/حذف/تحويل شعار الشركة إلى data URL                  |
| `electron/print/printWindowManager.js` | نوافذ المعاينة/الطباعة + إشارة الجاهزية + قياس الارتفاع |
| `electron/print/printIpc.js`           | كل قنوات `print:*`                                      |

### جديدة — Frontend

| الملف                                              | الدور                                |
| -------------------------------------------------- | ------------------------------------ |
| `src/printing/dto/normalizeInvoiceForPrint.js`     | بناء الـ Print DTO الموحّد           |
| `src/printing/paper/paperPresets.js`               | أحجام الورق (نسخة renderer: التخطيط) |
| `src/printing/templates/receipt/ReceiptPrint.vue`  | المكوّن الوحيد لرسم الفاتورة         |
| `src/printing/templates/receipt/receipt.print.css` | CSS الطباعة (mm + `@page`)           |
| `src/printing/templates/receipt/receipt.themes.js` | الثيمات (متغيرات CSS)                |
| `src/printing/preview/PrintPreviewWindow.vue`      | نافذة المعاينة (مع شريط الأدوات)     |
| `src/printing/preview/PrintRenderWindow.vue`       | صفحة الرسم للطباعة/PDF (بلا chrome)  |
| `src/printing/preview/PrintPreviewToolbar.vue`     | شريط أدوات المعاينة                  |
| `test/normalizeInvoiceForPrint.test.mjs`           | اختبارات الـ DTO                     |

### مُعدّلة

- `electron/preload/preload.cjs` — أُضيف `electronAPI.print.*` (مع الحفاظ على contextIsolation).
- `electron/main/main.js` — `registerPrintIpc(() => mainWindow)`؛ تعليم الـ handlers القديمة `@deprecated`.
- `src/router/index.js` — مسار `/print/preview/:jobId` (مستقل، بلا واجهة التطبيق).
- `src/stores/settings.js` — حقول الشركة/الطباعة الجديدة.
- `src/components/settings/CompanyInfoForm.vue` — قسم «إعدادات الفاتورة والطباعة» (شعار/نصوص/طابعة/نسخ/صامتة).
- `src/views/sales/SaleDetails.vue` — التحويل إلى المسار الجديد.
- `backend/src/{controllers,services,routes}/settings*` — توسيع مخطط الشركة (whitelist + response schema).

### معزولة / Deprecated (لم تُحذف — توافق مؤقت، req #19)

- `electron/scripts/receiptBuilder.js` (`generateReceiptHtml`) — يبني HTML في main.
- `src/utils/receiptFormatter.js` (`formatReceiptData`) — لا يستورده أي كود الآن.
- قنوات `preview-receipt` / `print-receipt` / `getPrinters` القديمة في main + preload.

## كيف تضيف…

### ثيماً جديداً

الثيمات الحالية: `classic-pro` · `fluent` (A4/A5) · `compact-pro` (حراري) ·
`ledger` (محاسبي A4) · `minimal-modern`.

1. أضف مدخلاً في `receipt.themes.js` ضمن `THEMES` (مجرد متغيرات CSS بادئتها `--r-`).
2. (اختياري) أضف سطراً في `THEME_OPTIONS` ليظهر في الإعدادات والمعاينة.
   لا حاجة لتعديل المكوّن — الثيم يغيّر العرض فقط لا البيانات. القيم القديمة
   (classic/modern/professional…) تُحوَّل تلقائياً عبر `coerceTheme`.

### تنسيق الترويسة (الشعار واسم الشركة)

`invoiceHeaderLayout`: `auto` (افتراضي) | `horizontal` | `centered` | `compact`.

- `auto`: A4/A5 → أفقي (شعار بجانب الاسم)؛ الرولات → مدمج متمركز.
- الشعار يظهر بجانب الاسم (لا واحد فوق الآخر)؛ بلا شعار يتمركز الاسم بلا فراغ؛
  اسم طويل يلتف بنظافة. الشعار صغير تلقائياً على الحراري (10–14mm).
  يُضبط من الإعدادات ويمرّ عبر الـDTO (`company.invoiceHeaderLayout`).

### حجم ورق جديد

1. أضف مدخلاً في **كلا** ملفي `paperPresets.js` (renderer + main) بنفس المفتاح.
   - thermal: `widthMM` فقط (الارتفاع من المحتوى).
   - sheet: `widthMM` + `heightMM` + `pageSize`.
2. أضف صنف عرض في `receipt.print.css`: `.receipt-paper--<key> { width: <n>mm }`.

### تغيير شعار الشركة

الإعدادات ← «إعدادات الفاتورة والطباعة» ← شعار الشركة: إضافة/تغيير/حذف. تُنسخ
الصورة إلى `userData/images/company/` ويُحفظ **المسار فقط** في قاعدة البيانات
(لا base64 ولا binary). يُحوَّل المسار إلى data URL وقت الطباعة. لو الملف مفقود
تُطبع الفاتورة بلا شعار مع تسجيل تحذير.

### تعديل النصوص العلوية/السفلية

نفس القسم: «النص العلوي»، «النص الفرعي العلوي»، «النص السفلي»، «الشروط». تدخل ضمن
`companyInfo` ← الـ DTO وتظهر في المعاينة/الطباعة/PDF. النص الفارغ لا يترك فراغاً.

## نتائج الاختبارات

- `node --test test/normalizeInvoiceForPrint.test.mjs` → **9/9 ناجح** (DTO: serializable،
  بلا شعار مضمّن، بلا عميل، دفع جزئي، خصومات، أقساط+فائدة، العملة، رسالة خطأ عربية).
- بناء الويب (`VITE_TARGET=web vite build`) → **نجح**.
- بناء Electron (`VITE_TARGET=electron vite build`) → **نجح** (تحزيم main + preload + renderer).
- ESLint على الملفات الجديدة/المعدّلة → **نظيف**.

## قيود / ملاحظات

- اختبارات الطباعة الفعلية (طباعة rolls/A4، حفظ PDF، طابعة مفقودة، لا طابعات،
  الطباعة الصامتة) تتطلب جهازاً به طابعة وتُنفَّذ يدوياً وفق قائمة الاختبارات في طلب العمل.
- أبعاد `printToPDF` للرول مبنية على إنشات (mm→inch) و`webContents.print` على ميكرونات
  (mm×1000) وفق توثيق Electron 41؛ يُنصح بتأكيدها على طابعة حرارية حقيقية.
- لا يوجد snapshot لشكل الفاتورة وقت البيع (إعدادات طباعة عامة) — تُركت كمرحلة لاحقة كما طُلب.
- نسخة `paperPresets.js` مكرّرة (renderer/main) بسبب حدود التحزيم؛ يجب إبقاؤها متطابقة.

```

```
