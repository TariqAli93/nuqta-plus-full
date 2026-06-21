// Centralized Arabic error message builder for Axios responses

/** Format a number as IQD-ish for human error messages. */
function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('en-US')} د.ع`;
}

/**
 * Human, action-oriented messages keyed by the backend's stable error `code`.
 * These take PRECEDENCE over the generic name/message translation so the user
 * never sees a raw code like CREDIT_LIMIT_EXCEEDED or ACCOUNTING_PERIOD_CLOSED.
 * Each entry returns the full message; some interpolate `data.details`.
 */
function translateErrorCode(data = {}) {
  const code = data.code;
  if (!code) return '';
  const d = (data.details && !Array.isArray(data.details)) ? data.details : {};

  switch (code) {
    case 'PERMISSION_DENIED': {
      // Backend already sends a specific message ("ليس لديك صلاحية حذف مستخدم")
      // plus a `details` payload — compose a clear, multi-line explanation so
      // even a plain toast tells the user the reason and what to do next.
      const lines = [data.message || 'ليس لديك صلاحية لتنفيذ هذه العملية'];
      if (d.reason) lines.push(d.reason);
      if (d.suggestion) lines.push(`الحل: ${d.suggestion}`);
      return lines.join('\n');
    }
    case 'CAPABILITY_DENIED': {
      const lines = [data.message || 'لا تملك صلاحية استخدام هذه الميزة'];
      if (d.reason) lines.push(d.reason);
      if (d.suggestion) lines.push(`الحل: ${d.suggestion}`);
      return lines.join('\n');
    }
    case 'CREDIT_LIMIT_EXCEEDED': {
      const current = d.currentAR != null ? d.currentAR : d.currentDebt;
      const limit = d.creditLimit;
      const lines = ['لا يمكن البيع بالدين لهذا العميل.'];
      if (current != null) lines.push(`الدين الحالي: ${money(current)}`);
      if (limit != null) lines.push(`أعلى دين مسموح: ${money(limit)}`);
      lines.push('يمكن للمدير تجاوز هذا الحد إذا عنده صلاحية.');
      return lines.join('\n');
    }
    case 'CREDIT_DECISION_BLOCKED':
      return 'لا يمكن البيع بالدين لهذا العميل بسبب تأخره في السداد أو تجاوز الحد. يمكن للمدير الموافقة إذا عنده صلاحية.';
    case 'MODE_UPGRADE_REQUIRED':
      return 'هذه الميزة متوفرة في النمط الكامل فقط.\nحتى تستخدمها، فعّل النمط الكامل من الإعدادات.';
    case 'MODE_DOWNGRADE_UNSUPPORTED':
      return 'لا يمكن الرجوع من النمط الكامل إلى السهل. يمكنك إيقاف أي ميزة لا تحتاجها من شاشة الميزات.';
    case 'ACCOUNTING_PERIOD_DISABLED':
    case 'ACCOUNTING_PERIOD_REQUIRED':
      return 'يجب فتح فترة عمل قبل البيع.\nافتح فترة عمل من الإعدادات أو اطلب من المدير.';
    case 'ACCOUNTING_PERIOD_CLOSED':
      return 'فترة العمل مغلقة — لا يمكن تسجيل عمليات في فترة مغلقة. افتح فترة جديدة.';
    case 'ENTRY_DATE_OUTSIDE_PERIOD':
      return 'تاريخ التسجيل خارج فترة العمل المفتوحة — لا يمكن التسجيل بأثر رجعي.';
    case 'SALE_STOCK_VALIDATION': {
      // Per-item details are surfaced separately via extractArabicDetails().
      return 'الكمية غير كافية لبعض المنتجات. راجع التفاصيل أدناه.';
    }
    case 'PURCHASE_ALREADY_CONSUMED':
      return 'لا يمكن إلغاء فاتورة الشراء لأن جزءاً من البضاعة تم بيعه أو استخدامه.\nيمكنك عمل مرتجع شراء للكميات المتبقية فقط.';
    case 'PURCHASE_RETURN_INSUFFICIENT_STOCK':
      return 'الكمية المتبقية في المخزون لا تكفي لإرجاعها للمورد. تحقق من الكميات المتاحة.';
    case 'VOUCHER_HAS_SOURCE':
      return 'هذا الوصل أُنشئ تلقائياً من عملية أخرى — عدّل أو ألغِ العملية الأصلية بدلاً منه.';
    case 'SYSTEM_ACCOUNT_UNMAPPED':
      return 'يوجد حساب غير مربوط في إعدادات المحاسبة المتقدمة. اطلب من المحاسب ربط الحسابات.';
    case 'CUSTOMER_PHONE_DUPLICATE':
      return 'رقم الهاتف مستخدم لعميل آخر مسبقاً.';
    default:
      return '';
  }
}

function translateErrorName(name = '') {
  const map = {
    ValidationError: 'خطأ في التحقق من البيانات',
    AuthenticationError: 'خطأ في المصادقة',
    AuthorizationError: 'صلاحيات غير كافية',
    NotFoundError: 'العنصر غير موجود',
    ConflictError: 'تعارض في البيانات',
    'Internal Server Error': 'خطأ داخلي في الخادم',
    Unauthorized: 'غير مصرح',
    Forbidden: 'ممنوع',
    'Not Found': 'غير موجود',
  };
  return map[name] || name;
}

function translateGenericMessage(message = '') {
  if (!message) return '';
  const patterns = [
    [/Invalid request data/i, 'بيانات غير صالحة'],
    [/already exists/i, 'القيمة موجودة مسبقًا'],
    [/not found/i, 'غير موجود'],
    [/Invalid username or password/i, 'اسم المستخدم أو كلمة المرور غير صحيحة'],
    [/User not found or inactive/i, 'المستخدم غير موجود أو غير مُفعل'],
    [/Permission denied:?\s*/i, 'تم رفض الإذن: '],
    [/Authentication required/i, 'يتطلب تسجيل الدخول'],
    [/An unexpected error occurred/i, 'حدث خطأ غير متوقع'],
    [/Route (GET|POST|PUT|DELETE):.* not found/i, 'المسار المطلوب غير موجود'],
  ];
  for (const [re, ar] of patterns) {
    if (re.test(message)) return message.replace(re, ar);
  }
  return message;
}

function translateZodDetailMessage(msg = '') {
  if (!msg) return '';
  const patterns = [
    [/Required/i, 'مطلوب'],
    [/Invalid type/i, 'نوع غير صالح'],
    [/Too short/i, 'قصير جدًا'],
    [/Too long/i, 'طويل جدًا'],
    [/Must be positive/i, 'يجب أن يكون موجبًا'],
    [/Number must be greater than or equal to\s*(\d+)/i, 'الرقم يجب أن يكون أكبر أو يساوي $1'],
    [/Number must be less than or equal to\s*(\d+)/i, 'الرقم يجب أن يكون أقل أو يساوي $1'],
    [/Expected number/i, 'قيمة رقمية مطلوبة'],
    [/Expected string/i, 'قيمة نصية مطلوبة'],
    [/Expected array/i, 'قائمة (Array) مطلوبة'],
    [/Invalid email/i, 'بريد إلكتروني غير صالح'],
    [/Invalid date/i, 'تاريخ غير صالح'],
    [/Invalid enum value/i, 'قيمة غير مسموحة'],
  ];
  for (const [re, ar] of patterns) {
    if (re.test(msg)) return msg.replace(re, ar);
  }
  return msg;
}

function translateHttpStatus(status) {
  const map = {
    400: 'طلب غير صالح',
    401: 'غير مصرح – يرجى تسجيل الدخول',
    403: 'صلاحيات غير كافية للوصول',
    404: 'المورد المطلوب غير موجود',
    409: 'تعارض في البيانات',
    422: 'تعذر معالجة البيانات',
    429: 'تم تجاوز حدّ الطلبات',
    500: 'خطأ في الخادم',
  };
  return map[status] || '';
}

function translateFieldName(field = '') {
  const map = {
    // Common auth/user
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    fullName: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    role: 'الدور',
    permissions: 'الصلاحيات',

    // category: handled once above if needed
    // Products
    name: 'الاسم',
    sku: 'رمز التخزين (SKU)',
    barcode: 'الباركود',
    categoryId: 'التصنيف',
    description: 'الوصف',
    costPrice: 'سعر التكلفة',
    sellingPrice: 'سعر البيع',
    currency: 'العملة',
    productId: 'المنتج',
    stock: 'المخزون',
    minStock: 'حد المخزون الأدنى',
    unit: 'الوحدة',
    supplier: 'المورّد',
    status: 'الحالة',

    // Sales
    saleId: 'رقم المبيعة',
    invoiceNumber: 'رقم الفاتورة',
    customerId: 'المشتري',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    tax: 'الضريبة',
    total: 'الإجمالي',
    exchangeRate: 'سعر الصرف',
    interestRate: 'نسبة الفائدة',
    currencyCode: 'رمز العملة',
    currencyName: 'اسم العملة',
    interestAmount: 'قيمة الفائدة',
    paymentType: 'نوع الدفع',
    paidAmount: 'المبلغ المدفوع',
    remainingAmount: 'المبلغ المتبقي',
    notes: 'ملاحظات',

    // Payments
    paymentId: 'رقم الدفعة',
    amount: 'المبلغ',
    paymentMethod: 'طريقة الدفع',
    paymentDate: 'تاريخ الدفع',

    // Installments
    installmentNumber: 'رقم القسط',
    dueAmount: 'المبلغ المستحق',
    dueDate: 'تاريخ الاستحقاق',
    address: 'العنوان',
    city: 'المدينة',
    paidDate: 'تاريخ السداد',

    // Categories/Customers
    customer: 'العميل',
    category: 'التصنيف',

    defaultCurrency: 'العملة الافتراضية',
    usdRate: 'سعر الدولار',
    iqdRate: 'سعر الدينار',
    companyName: 'اسم الشركة',
    area: 'المنطقة',
    street: 'الشارع',
    phones: 'أرقام الهواتف',
    logoUrl: 'شعار الشركة',
    invoiceType: 'نوع الفاتورة',
    destinationDir: 'مسار الحفظ',
    // Settings/Company
    key: 'المفتاح',
    value: 'القيمة',
    updatedAt: 'تاريخ التحديث',
    createdAt: 'تاريخ الإنشاء',
  };
  return map[field] || field;
}

function translateResourceName(resource = '') {
  const map = {
    users: 'المستخدمين',
    permissions: 'الصلاحيات',
    roles: 'الأدوار',
    customers: 'العملاء',
    products: 'المنتجات',
    sales: 'المبيعات',
    categories: 'التصنيفات',
    reports: 'التقارير',
    dashboard: 'لوحة التحكم',
    settings: 'الإعدادات',
  };
  return map[resource] || resource;
}

function translateActionName(action = '') {
  const map = {
    create: 'إنشاء',
    read: 'قراءة',
    view: 'عرض',
    update: 'تعديل',
    delete: 'حذف',
    manage: 'إدارة',
  };
  return map[action] || action;
}

// Sale stock-validation reasons emitted by the backend
// (inventoryService.validateSaleStock). Keep in sync with the reason strings
// the API returns so each rejected item renders a precise Arabic line.
function translateStockReason(reason = '') {
  const map = {
    insufficient_stock: 'الكمية غير كافية',
    inventory_record_not_found: 'لا يوجد سجل مخزون لهذا المنتج في هذا المخزن',
    product_not_active: 'المنتج غير مُفعل',
    product_not_sale_enabled: 'المنتج غير متاح للبيع',
    warehouse_not_found: 'المخزن غير موجود',
    branch_mismatch: 'المنتج لا يتبع الفرع المحدد',
    unit_not_found: 'الوحدة غير موجودة',
    invalid_unit_conversion: 'عامل تحويل الوحدة غير صالح',
  };
  return map[reason] || reason;
}

function formatStockDetail(d) {
  const name = d.productName || (d.productId ? `#${d.productId}` : 'منتج');
  const reasonText = translateStockReason(d.reason);
  if (d.reason === 'insufficient_stock') {
    return `${name}: ${reasonText} (مطلوب ${d.requestedQty}، متاح ${d.availableQty}، نقص ${d.shortageQty})`;
  }
  return `${name}: ${reasonText}`;
}

export function buildArabicErrorMessage(error) {
  const data = error?.response?.data || {};
  const status = error?.response?.status;

  // Stable error codes win: render the human, action-oriented message and skip
  // the generic name/message path entirely so no raw code ever leaks.
  const coded = translateErrorCode(data);
  if (coded) {
    const details = extractArabicDetails(error);
    return details.length ? `${coded}\n${details.join('\n')}` : coded;
  }

  // Prefer backend-provided message/error
  const baseName = translateErrorName(data.error);
  let baseMessage = translateGenericMessage(data.message) || translateHttpStatus(status);

  // If permission token exists in message, localize action/resource
  if (baseMessage && baseMessage.startsWith('تم رفض الإذن:')) {
    const token = (data.message || '').split(':').slice(1).join(':').trim();
    // token may be in form "products:delete" (resource:action)
    if (token && token.includes(':')) {
      const [resource, action] = token.split(':');
      const arAction = translateActionName(action);
      const arResource = translateResourceName(resource);
      const pretty = [arAction, arResource].filter(Boolean).join(' ');
      baseMessage = `تم رفض الإذن: ${pretty || token}`;
    }
  }

  // Aggregate Zod validation details if present
  const details = Array.isArray(data.details)
    ? data.details
        .map((d) => {
          const arField = d?.field ? translateFieldName(d.field) : '';
          const field = arField ? `${arField}: ` : '';
          const msg = translateZodDetailMessage(d?.message || '');
          return (field + msg).trim();
        })
        .filter(Boolean)
        .join('، ')
    : '';

  const parts = [baseName, baseMessage].filter(Boolean);
  const combined = parts.length ? parts.join(' - ') : 'حدث خطأ غير متوقع';

  return details ? `${combined} — ${details}` : combined;
}

/**
 * Pull the structured Authorization (403) payload out of an Axios error.
 * Returns `null` for any error that is NOT a permission/capability denial,
 * so callers can branch on it.
 *
 * Shape: { code, message, action, resource, requiredPermission, capability,
 *          userPermissions[], reason, suggestion }
 */
export function extractPermissionDenied(error) {
  const data = error?.response?.data || {};
  if (data.code !== 'PERMISSION_DENIED' && data.code !== 'CAPABILITY_DENIED') return null;
  const d = data.details && !Array.isArray(data.details) ? data.details : {};
  const req = d.requiredPermission;
  return {
    code: data.code,
    message: data.message || 'ليس لديك صلاحية لتنفيذ هذه العملية',
    action: d.action || '',
    resource: d.resource || '',
    requiredPermission: Array.isArray(req) ? req.join('، ') : req || '',
    capability: d.capability || '',
    userPermissions: Array.isArray(d.userPermissions) ? d.userPermissions : [],
    reason: d.reason || '',
    suggestion: d.suggestion || '',
  };
}

/**
 * Build the {title, message, details[]} object the global error dialog expects
 * from a permission-denied error — labeled Arabic lines the user can read at a
 * glance. Returns `null` when the error is not a permission/capability denial.
 */
export function buildPermissionDeniedDialog(error) {
  const info = extractPermissionDenied(error);
  if (!info) return null;
  const details = [];
  if (info.action) details.push(`العملية: ${info.action}`);
  if (info.requiredPermission) details.push(`الصلاحية المطلوبة: ${info.requiredPermission}`);
  else if (info.capability) details.push(`الميزة المطلوبة: ${info.capability}`);
  if (info.reason) details.push(`السبب: ${info.reason}`);
  if (info.suggestion) details.push(`الحل: ${info.suggestion}`);
  return {
    title: info.code === 'CAPABILITY_DENIED' ? 'ميزة غير متاحة' : 'صلاحيات غير كافية',
    message: info.message,
    details,
  };
}

export function extractArabicDetails(error) {
  const data = error?.response?.data || {};
  if (!Array.isArray(data.details)) return [];
  return data.details
    .map((d) => {
      // Stock-validation details carry a `reason` (and product/quantity fields)
      // instead of the Zod `{ field, message }` shape.
      if (d?.reason) return formatStockDetail(d);
      const arField = d?.field ? translateFieldName(d.field) : '';
      const field = arField ? `${arField}: ` : '';
      const msg = translateZodDetailMessage(d?.message || '');
      return (field + msg).trim();
    })
    .filter(Boolean);
}
