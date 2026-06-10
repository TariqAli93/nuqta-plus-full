/**
 * Arabic UI strings the suite asserts against.
 *
 * These are copied verbatim from the components/stores so tests validate the
 * real, user-facing Arabic copy (and catch accidental wording/localization
 * regressions). Grouped by area. Keep in sync with source if copy changes.
 */

export const AR = {
  login: {
    title: 'تسجيل الدخول',
    submit: 'دخول',
    requiredField: 'هذا الحقل مطلوب',
    // authStore.login() maps 401 → this exact message (stores/auth.js)
    invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    success: 'تم تسجيل الدخول بنجاح',
  },

  pos: {
    cartEmpty: 'السلة فارغة',
    checkout: 'دفع وإتمام',
    openShift: 'فتح وردية',
    closeShift: 'إغلاق الوردية',
    saleSuccess: 'تم حفظ البيع بنجاح',
    noShiftWarning: 'افتح وردية قبل تسجيل بيع نقدي',
    noProducts: 'لا توجد منتجات',
    noResults: 'لا نتائج',
  },

  shift: {
    openTitle: 'فتح وردية',
    openConfirm: 'فتح الوردية',
    closeTitle: 'إغلاق الوردية',
    closeConfirm: 'إغلاق الوردية',
  },

  periods: {
    title: 'القيود المحاسبية',
    openBtn: 'فتح قيد جديد',
    openDialogTitle: 'فتح قيد محاسبي جديد',
    submitOpen: 'فتح القيد',
    closeConfirm: 'تأكيد الإغلاق',
    openSuccess: 'تم فتح القيد المحاسبي',
    closeSuccess: 'تم إغلاق القيد المحاسبي',
    statusOpen: 'مفتوح',
    statusClosed: 'مغلق',
    // Shown when trying to open a 2nd period for an already-open scope.
    alreadyOpenWarning: 'يوجد قيد مفتوح بالفعل لهذا النطاق',
  },

  products: {
    title: 'إدارة المنتجات',
    newBtn: 'منتج جديد',
    save: 'حفظ',
    deleteConfirm: 'حذف نهائي',
    createdSuccess: 'تم إنشاء المنتج بنجاح',
    openingStockTitle: 'إضافة مخزون افتتاحي',
    openingStockAdd: 'إضافة مخزون',
    openingStockSkip: 'لاحقاً',
    emptyTitle: 'لا توجد منتجات',
    noResults: 'لا توجد نتائج مطابقة',
  },

  inventory: {
    title: 'إدارة المخزون',
    adjustBtn: 'إضافة / تعديل مخزون',
    save: 'حفظ',
  },

  saleDetails: {
    title: 'تفاصيل الفاتورة',
    returnBtn: 'إرجاع / استرداد',
    fullyReturned: 'مُرجع كلياً',
    confirmReturn: 'تأكيد الإرجاع',
    returnsHistory: 'سجل الإرجاع',
    netAfterReturns: 'الصافي بعد الإرجاع',
  },

  common: {
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    confirm: 'تأكيد',
    back: 'رجوع',
    // Generic forbidden page copy (views/errors/Forbidden.vue)
    forbidden: 'ليس لديك صلاحية',
  },
} as const;
