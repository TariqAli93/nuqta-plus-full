import { z } from 'zod';
import {
  SALE_SOURCES,
  SALE_SOURCE_POS,
  SALE_SOURCE_NEW_SALE,
  SALE_TYPES,
  SALE_TYPE_CASH,
  SALE_TYPE_INSTALLMENT,
  POS_PAYMENT_METHODS,
  PAYMENT_METHOD_CARD,
} from '../constants/sales.js';
import { ORDER_STATUSES } from '../constants/orders.js';

/**
 * Validation schemas using Zod
 * These schemas validate incoming request data
 */

// User schemas
export const userSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(4, 'Password must be at least 4 characters')
    .max(100, 'Password cannot exceed 100 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().optional(),
  // Role is a dynamic RBAC code (table `roles`), NOT a fixed enum — any active
  // role created on the Roles & permissions page is valid. Existence + active
  // status are verified against the DB in the service layer (userService /
  // authService), so this only checks the shape.
  role: z.string().trim().min(1, 'الدور مطلوب').default('cashier'),
  assignedBranchId: z.union([z.number().int().positive(), z.null()]).optional(),
  // Full set of branches the user may act on (many-to-many). When provided, the
  // first entry (or assignedBranchId) becomes the primary branch. Optional —
  // omitting it keeps the single-branch behaviour driven by assignedBranchId.
  branchIds: z.array(z.number().int().positive()).optional(),
  assignedWarehouseId: z.union([z.number().int().positive(), z.null()]).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().length(6).optional(),
});

// Customer schemas
//
// `phone` is stored exactly as the user typed it (so the receipt/contact form
// matches what they entered) and is *optional* — the customers table allows
// NULL phones and the UI does not require it. The service layer separately
// computes `normalized_phone` for de-dupe and search.
//
// `allowDuplicatePhone` is a deliberate override: duplicates are blocked by
// default, but legitimate shared family numbers can be saved by passing
// `true` (the UI surfaces a confirmation dialog before doing so).
export const customerSchema = z.object({
  name: z.string().min(2, 'Customer name must be at least 2 characters'),
  phone: z.string().trim().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Price tier / classification (تسعير الوكلاء). Default retail.
  customerType: z.enum(['retail', 'wholesale', 'agent']).optional(),
  // Hard credit ceiling (سقف الدين). NULL/omitted = unlimited.
  creditLimit: z.coerce.number().nonnegative().nullable().optional(),
  allowDuplicatePhone: z.boolean().optional(),
});

// ── Product units ─────────────────────────────────────────────────────────
// One product has exactly one base unit (conversion_factor = 1) and any
// number of additional units (درزن, كارتون …) that map back to it via
// `conversionFactor`. The product create/update endpoint accepts an
// optional `units` array — when present we replace the product's units in a
// single transaction. Validation here only checks shape; the service enforces
// "exactly one base unit" / "duplicate names" / etc. with Arabic messages.
export const productUnitInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, 'اسم الوحدة مطلوب').max(40),
  conversionFactor: z.coerce.number().positive('عامل التحويل يجب أن يكون أكبر من صفر'),
  isBase: z.boolean().optional(),
  isDefaultSale: z.boolean().optional(),
  isDefaultPurchase: z.boolean().optional(),
  barcode: z.string().trim().max(120).nullable().optional(),
  salePrice: z.coerce.number().nonnegative().nullable().optional(),
  costPrice: z.coerce.number().nonnegative().nullable().optional(),
  // Per-unit wholesale/agent tier prices (تسعير الوكلاء).
  wholesalePrice: z.coerce.number().nonnegative().nullable().optional(),
  agentPrice: z.coerce.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

// Product schemas
//
// Stock quantity is intentionally NOT part of this schema. All stock changes
// must go through the inventory movement endpoints (`/inventory/adjust`,
// `/inventory/transfer`, sales flow). The product controller rejects any
// payload that tries to set quantity-like fields with the explicit
// `STOCK_UPDATE_NOT_ALLOWED_ON_PRODUCT` error code.
export const productSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.number().int().positive().optional(),
  description: z.string().optional(),
  // Cost price is optional at the schema level so SERVICE products (which have
  // no purchase cost) can be created without one. Inventory products still
  // require a positive cost — enforced by `productCreateSchema` below.
  costPrice: z.coerce.number().nonnegative('Cost price must be zero or more').optional(),
  sellingPrice: z.coerce.number().positive('Selling price must be positive'),
  currency: z.enum(['USD', 'IQD'], {
    errorMap: () => ({ message: 'Currency must be USD or IQD' }),
  }),
  // Product kind. 'inventory' (default) is a stocked good with the existing
  // quantity/stock behaviour; 'service' is a non-stocked offering (e.g.
  // "تصليح شاشة") that is never stock-checked or deducted on a sale.
  productType: z.enum(['inventory', 'service']).optional(),
  // minStock / lowStockThreshold are alert thresholds, not stock balances —
  // they describe the product, so they stay on the product form.
  minStock: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  unit: z.string().optional(),
  supplier: z.string().nullable().optional(),
  // Product-level wholesale/agent tier prices (تسعير الوكلاء). Per-unit
  // overrides live on each unit; these are the product-level default.
  wholesalePrice: z.coerce.number().nonnegative().nullable().optional(),
  agentPrice: z.coerce.number().nonnegative().nullable().optional(),
  tracksExpiry: z.boolean().optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['available', 'out_of_stock', 'discontinued']).optional(),
  // Optional units payload. When present, the product service replaces the
  // product's units atomically — the first item with `isBase = true` (or, if
  // none is flagged, the entry with `conversionFactor === 1`) becomes the
  // base unit. Sending an empty array clears all non-base units.
  units: z.array(productUnitInputSchema).optional(),
});

// Create-time schema: keeps the original guarantee that an INVENTORY product
// always carries a positive cost price, while letting a SERVICE product omit
// it (defaults to 0 in the service layer). Update stays lenient via
// `productSchema.partial()` so partial edits never trip this rule.
export const productCreateSchema = productSchema.superRefine((data, ctx) => {
  const type = data.productType || 'inventory';
  if (type === 'inventory' && (data.costPrice == null || data.costPrice <= 0)) {
    ctx.addIssue({
      path: ['costPrice'],
      code: z.ZodIssueCode.custom,
      message: 'Cost price must be positive',
    });
  }
});

// Quantity-like keys that must never be accepted on product create/update.
// Detected at the controller layer so we can return the documented code
// `STOCK_UPDATE_NOT_ALLOWED_ON_PRODUCT` instead of a generic Zod error.
export const PRODUCT_FORBIDDEN_STOCK_KEYS = [
  'stock',
  'quantity',
  'qty',
  'stockQuantity',
  'currentStock',
  'inStock',
  'openingStock',
  'openingWarehouseId',
];

// ── Inventory schemas ─────────────────────────────────────────────────────
export const branchSchema = z.object({
  name: z.string().min(2, 'Branch name must be at least 2 characters'),
  address: z.string().optional(),
  // Default warehouse for this branch. The service layer additionally checks
  // that the warehouse belongs to this branch.
  defaultWarehouseId: z.union([z.number().int().positive(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

// `branchId` is required only when the multi-branch feature is enabled. With
// the feature off, warehouses are global. The service layer enforces this
// with the live feature flag.
export const warehouseSchema = z.object({
  name: z.string().min(2, 'Warehouse name must be at least 2 characters'),
  branchId: z.union([z.number().int().positive(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const stockAdjustmentSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  // Quantity is in the *selected unit*. The service multiplies it by the
  // unit's conversionFactor before it touches `product_stock`. unitId is
  // optional — when omitted we use the product's base unit (factor 1).
  quantityChange: z.number().int().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitId: z.number().int().positive().nullable().optional(),
  movementType: z.enum(
    [
      'opening_balance',
      'stock_in',
      'adjustment_in',
      'adjustment_out',
      'damaged',
      'lost',
      'correction_in',
      'correction_out',
      'manual_adjustment_in',
      'manual_adjustment_out',
    ],
    { errorMap: () => ({ message: 'نوع حركة المخزون غير صالح' }) }
  ),
  reason: z.string().nullable().optional(),
  costPrice: z.coerce.number().nonnegative('Cost price must be non-negative').optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be YYYY-MM-DD')
    .nullable()
    .optional(),
  allowNegative: z.boolean().optional(),
});

export const stockTransferSchema = z
  .object({
    fromWarehouseId: z.number().int().positive(),
    toWarehouseId: z.number().int().positive(),
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitId: z.number().int().positive().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
    message: 'Source and destination warehouses must be different',
    path: ['toWarehouseId'],
  });

// Category schemas
export const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters'),
  description: z.string().optional(),
});

// Sales channel schemas (قنوات البيع)
// `code` is a stable machine identifier (UPPER_SNAKE_CASE); the service
// normalises/uppercases it before persisting. `color` is a hex string and
// `icon` an mdi icon name — both optional UI hints.
export const salesChannelSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Channel code must be at least 2 characters')
    .max(40, 'Channel code is too long')
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Code may contain only letters, numbers and underscore'),
  name: z.string().trim().min(2, 'Channel name must be at least 2 characters'),
  isActive: z.boolean().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a hex value like #25D366')
    .nullable()
    .optional(),
  icon: z.string().trim().max(60).nullable().optional(),
});

// Online order schemas (الطلبات الأونلاين)
// `order_number`, `status`, and `total_amount` are owned by the server — they
// are NOT accepted from the client on create. Items are optional at intake.
export const onlineOrderItemSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  productName: z.string().trim().min(1, 'Product name is required'),
  productSku: z.string().trim().nullable().optional(),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  unitPrice: z.coerce.number().nonnegative('Unit price cannot be negative'),
  notes: z.string().trim().nullable().optional(),
});

export const onlineOrderSchema = z.object({
  channelId: z.number().int().positive('A sales channel is required'),
  customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters'),
  customerPhone: z.string().trim().nullable().optional(),
  customerAddress: z.string().trim().nullable().optional(),
  province: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  // Used only when the order carries no line items (item-less intake).
  totalAmount: z.coerce.number().nonnegative().optional(),
  items: z.array(onlineOrderItemSchema).optional(),
});

export const onlineOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
});

// ── Delivery integration ─────────────────────────────────────────────────────
// Provider settings + credentials. Secrets (apiKey/webhookSecret) are encrypted
// by the service; an empty string clears them, undefined leaves them untouched.
export const deliveryProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  adapterKey: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  // Boxy derives its base URL from the environment; generic providers set it
  // directly ('' clears).
  environment: z.enum(['sandbox', 'production']).optional(),
  baseUrl: z.string().trim().url().or(z.literal('')).nullable().optional(),
  config: z.any().optional(),
  // Secrets: a value sets/re-encrypts, '' clears, omitted leaves untouched.
  // password → api-secret slot; username + accessToken → encrypted bag.
  apiKey: z.string().nullable().optional(),
  apiSecret: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  accessToken: z.string().nullable().optional(),
  webhookSecret: z.string().nullable().optional(),
});

export const deliveryShipmentCreateSchema = z
  .object({
    // Source: an online order and/or a sale (at least one).
    onlineOrderId: z.coerce.number().int().positive().optional(),
    saleId: z.coerce.number().int().positive().optional(),
    providerId: z.coerce.number().int().positive().optional(),
    providerCode: z.string().trim().min(1).optional(),
    // Recipient (dialog fields).
    recipientName: z.string().trim().min(1, 'Customer name is required'),
    recipientPhone: z.string().trim().min(1, 'Customer phone is required'),
    secondaryPhone: z.string().trim().nullable().optional(),
    province: z.string().trim().nullable().optional(),
    region: z.string().trim().nullable().optional(),
    recipientAddress: z.string().trim().nullable().optional(),
    // Boxy dispatch attributes.
    description: z.string().trim().nullable().optional(),
    size: z.enum(['S', 'M', 'L', 'XL']).optional(),
    fragile: z.boolean().optional(),
    readyToPickup: z.boolean().optional(),
    paymentType: z.enum(['COLLECT_ON_DELIVERY', 'PREPAID']).optional(),
    feeType: z.enum(['BY_MERCHANT', 'BY_CUSTOMER']).optional(),
    codAmount: z.coerce.number().nonnegative().optional(),
    deliveryFee: z.coerce.number().nonnegative().optional(),
    currency: z.enum(['USD', 'IQD']).optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .refine((d) => d.onlineOrderId || d.saleId, {
    message: 'onlineOrderId or saleId is required',
    path: ['onlineOrderId'],
  });
// Provider is intentionally optional — when omitted the service falls back to
// the default delivery provider.

// Shipping-cost quote request. Provider is optional (falls back to default).
export const deliveryQuoteSchema = z.object({
  providerId: z.coerce.number().int().positive().optional(),
  providerCode: z.string().trim().min(1).optional(),
  province: z.string().trim().min(1, 'province is required'),
  region: z.string().trim().nullable().optional(),
  weight: z.coerce.number().nonnegative().optional(),
  codAmount: z.coerce.number().nonnegative().optional(),
  size: z.enum(['S', 'M', 'L', 'XL']).optional(),
  paymentType: z.enum(['COLLECT_ON_DELIVERY', 'PREPAID']).optional(),
  feeType: z.enum(['BY_MERCHANT', 'BY_CUSTOMER']).optional(),
  currency: z.enum(['USD', 'IQD']).optional(),
});

// Optional overrides when converting an order to a sale invoice. Everything is
// optional — the order itself supplies the items, channel and customer.
export const onlineOrderConvertSchema = z.object({
  paidAmount: z.coerce.number().nonnegative().optional(),
  paymentMethod: z.enum(['cash', 'card']).optional(),
  paymentReference: z.string().trim().nullable().optional(),
  currency: z.enum(['USD', 'IQD']).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

// Sale schemas
//
// `quantity` is expressed in the SELECTED unit (e.g. 2 درزن). The service
// resolves the unit and multiplies by `conversionFactor` to derive the
// `baseQuantity` that actually deducts stock. When `unitId` is omitted the
// product's base unit is used (factor 1), so legacy callers stay valid.
export const saleItemSchema = z.object({
  productId: z.number().int().positive('Product ID must be a positive integer'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  unitPrice: z.coerce.number().positive('Unit price must be positive'),
  discount: z.coerce.number().nonnegative('Discount cannot be negative').optional(),
  unitId: z.number().int().positive().nullable().optional(),
  // Per-line note (ملاحظة المنتج) — independent of the invoice-level note.
  notes: z.string().trim().max(1000, 'ملاحظة المنتج طويلة جداً (الحد الأقصى 1000 حرف)').nullable().optional(),
});

export const saleSchema = z
  .object({
    customerId: z.union([z.number().int().positive(), z.null()]).optional(),
    branchId: z.number().int().positive().optional(),
    warehouseId: z.number().int().positive().optional(),
    currency: z.enum(['USD', 'IQD'], {
      errorMap: () => ({ message: 'Currency must be USD or IQD' }),
    }),
    exchangeRate: z.number().positive().optional(),
    items: z
      .array(saleItemSchema)
      .min(1, 'Sale must have at least one item')
      .refine((items) => items.length > 0, {
        message: 'Sale cannot have empty items',
      }),
    discount: z.number().nonnegative('Discount cannot be negative').optional().default(0),
    tax: z
      .number()
      .nonnegative('Tax cannot be negative')
      .max(100, 'Tax cannot exceed 100%')
      .optional()
      .default(0),
    // `paymentType` is the legacy column kept for backwards compatibility with
    // the sales table. Clients should send `saleType` instead; we accept either.
    paymentType: z.enum(['cash', 'installment', 'mixed']).optional(),
    saleSource: z.enum(SALE_SOURCES, {
      errorMap: () => ({ message: 'saleSource must be POS or NEW_SALE' }),
    }),
    saleType: z.enum(SALE_TYPES, {
      errorMap: () => ({ message: 'saleType must be CASH or INSTALLMENT' }),
    }),
    paymentMethod: z.enum(POS_PAYMENT_METHODS).optional(),
    paymentReference: z
      .string()
      .trim()
      .min(1, 'Card reference cannot be empty')
      .max(120, 'Card reference is too long')
      .optional()
      .nullable(),
    paidAmount: z.number().nonnegative('Paid amount cannot be negative').optional().default(0),
    installmentCount: z.number().int().positive('Installment count must be at least 1').optional(),
    // Invoice-level note (ملاحظة الفاتورة). Trimmed and capped so an over-long
    // value is rejected with a clear message instead of being silently stored.
    notes: z.string().trim().max(1000, 'الملاحظة طويلة جداً (الحد الأقصى 1000 حرف)').nullable().optional(),
    paymentNotes: z.string().nullable().optional(),
    interestRate: z
      .number()
      .nonnegative('Interest rate cannot be negative')
      .max(100, 'Interest rate cannot exceed 100%')
      .optional()
      .default(0),
    interestAmount: z.number().nonnegative().optional(),
    // Pricing tier chosen for this invoice (تسعير الوكلاء): مفرد/جملة/وكيل.
    // Optional + enum so legacy clients omit it and the service defaults to retail.
    priceType: z.enum(['retail', 'wholesale', 'agent']).optional(),
  })
  .superRefine((data, ctx) => {
    // ── POS-originated sales: cash/card only, no deferred balance ───────────
    if (data.saleSource === SALE_SOURCE_POS) {
      if (data.saleType !== SALE_TYPE_CASH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saleType'],
          message: 'POS supports cash/card sales only.',
        });
      }
      if (data.paymentMethod && !POS_PAYMENT_METHODS.includes(data.paymentMethod)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMethod'],
          message: 'POS supports cash/card sales only.',
        });
      }
      if (data.installmentCount && data.installmentCount > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installmentCount'],
          message: 'Installment sales must be created from NewSale.',
        });
      }
    }

    // ── NewSale: installments only ──────────────────────────────────────────
    if (data.saleSource === SALE_SOURCE_NEW_SALE) {
      if (data.saleType !== SALE_TYPE_INSTALLMENT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saleType'],
          message: 'NewSale accepts installment sales only.',
        });
      }
      if (!data.customerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerId'],
          message: 'Customer is required for installment sales.',
        });
      }
    }

    // ── Card payments must carry a non-empty reference ──────────────────────
    if (data.paymentMethod === PAYMENT_METHOD_CARD) {
      const ref = typeof data.paymentReference === 'string' ? data.paymentReference.trim() : '';
      if (!ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentReference'],
          message: 'Card reference number is required.',
        });
      }
    }
  });
// Sale return / refund schemas
export const saleReturnItemSchema = z
  .object({
    saleItemId: z.number().int().positive().optional(),
    productId: z.number().int().positive().optional(),
    // Quantity is in the original sale-item's unit. When the caller passes a
    // different unitId, the service converts to base units before checking
    // the remaining returnable amount.
    quantity: z.number().int().positive('الكمية المرتجعة يجب أن تكون أكبر من صفر'),
    unitId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.saleItemId || d.productId, {
    message: 'Each return item needs either saleItemId or productId',
    path: ['saleItemId'],
  });

export const saleReturnSchema = z.object({
  items: z.array(saleReturnItemSchema).min(1, 'Return must include at least one item'),
  refundAmount: z.number().nonnegative('Refund amount cannot be negative').optional().default(0),
  refundMethod: z.enum(['cash', 'card', 'credit']).optional(),
  refundReference: z.string().trim().min(1).max(120).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

// Payment schemas
export const paymentSchema = z
  .object({
    saleId: z.number().int().positive().optional(),
    customerId: z.number().int().positive().optional(),
    amount: z.number().positive('Payment amount must be positive'),
    currency: z.enum(['USD', 'IQD']),
    exchangeRate: z.number().positive('Exchange rate must be positive'),
    paymentMethod: z.enum(POS_PAYMENT_METHODS),
    paymentReference: z
      .string()
      .trim()
      .min(1, 'Card reference cannot be empty')
      .max(120, 'Card reference is too long')
      .optional()
      .nullable(),
    notes: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === PAYMENT_METHOD_CARD) {
      const ref = typeof data.paymentReference === 'string' ? data.paymentReference.trim() : '';
      if (!ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentReference'],
          message: 'Card reference number is required.',
        });
      }
    }
  });

// Installment schemas
export const installmentSchema = z.object({
  saleId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  installmentNumber: z.number().int().positive(),
  dueAmount: z.number().positive('Due amount must be positive'),
  currency: z.enum(['USD', 'IQD']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  notes: z.string().nullable().optional(),
});

// ── Installment collection actions ────────────────────────────────────────
// One schema covers all action types — type-specific fields are validated in
// the superRefine below so the API surface stays a single endpoint.
export const INSTALLMENT_ACTION_TYPES = [
  'call',
  'visit',
  'promise_to_pay',
  'reschedule',
  'note',
  'payment',
];

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const installmentActionSchema = z
  .object({
    actionType: z.enum(INSTALLMENT_ACTION_TYPES, {
      errorMap: () => ({ message: 'Invalid action type' }),
    }),
    note: z.string().trim().optional().nullable(),
    // promise_to_pay
    promisedAmount: z.coerce.number().positive().optional(),
    promisedDate: ymd.optional(),
    // reschedule
    newDueDate: ymd.optional(),
    // payment — delegated to the existing payment service
    amount: z.coerce.number().positive().optional(),
    currency: z.enum(['USD', 'IQD']).optional(),
    exchangeRate: z.coerce.number().positive().optional(),
    paymentMethod: z.enum(['cash', 'card']).optional(),
    paymentReference: z.string().trim().min(1).max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.actionType === 'promise_to_pay') {
      if (!data.promisedAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['promisedAmount'],
          message: 'Promised amount is required',
        });
      }
      if (!data.promisedDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['promisedDate'],
          message: 'Promised date is required',
        });
      }
    }
    if (data.actionType === 'reschedule' && !data.newDueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newDueDate'],
        message: 'New due date is required',
      });
    }
    if (data.actionType === 'payment') {
      if (!data.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'Payment amount is required',
        });
      }
      if (!data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMethod'],
          message: 'Payment method is required',
        });
      }
      if (data.paymentMethod === 'card') {
        const ref = typeof data.paymentReference === 'string' ? data.paymentReference.trim() : '';
        if (!ref) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['paymentReference'],
            message: 'Card reference number is required.',
          });
        }
      }
    }
  });

// Query schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const settingsSchema = z.object({
  key: z.string().min(1, 'Settings key is required'),
  value: z.any(),
});

// Cash session / shift schemas removed — the shift system no longer exists.
