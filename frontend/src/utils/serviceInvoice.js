/**
 * Service-vs-physical invoice rules (نظام المنتجات/الخدمات).
 *
 * Pure, dependency-free helpers so the POS/NewSale cart logic stays declarative
 * and can be unit-tested without Vue/Pinia. The single source of truth for:
 *   - what counts as a service line/product,
 *   - whether an invoice is service-only,
 *   - whether adding a product would illegally mix services with physical goods,
 *   - whether the "المبلغ كامل" quick-pay button must be disabled.
 *
 * Business rules:
 *   - An invoice is EITHER physical-only OR service-only — never both.
 *   - On a service invoice the price is captured as "السعر المستلم" (the amount
 *     actually received from the customer); the stored service price, if any, is
 *     only a convenience default.
 */

export const SERVICE_PRODUCT_TYPE = 'service';

/** Arabic, user-facing messages — shared by the cart guards and notifications. */
export const MIX_TYPES_ERROR = 'لا يمكن دمج خدمة مع منتجات فعلية في نفس الفاتورة';
export const SERVICE_PRICE_REQUIRED_ERROR = 'أدخل السعر المستلم للخدمة';

/** A catalogue product is a service. */
export function isServiceProduct(product) {
  return product?.productType === SERVICE_PRODUCT_TYPE;
}

/** A cart line is a service (lines carry a `productType` snapshot). */
export function isServiceLine(line) {
  return line?.productType === SERVICE_PRODUCT_TYPE;
}

/** The cart contains at least one service line. */
export function cartHasService(items) {
  return Array.isArray(items) && items.some(isServiceLine);
}

/** The cart contains at least one physical (non-service) line. */
export function cartHasPhysical(items) {
  return Array.isArray(items) && items.some((i) => i && !isServiceLine(i));
}

/** The invoice is non-empty and made up entirely of service lines. */
export function isServiceInvoice(items) {
  return Array.isArray(items) && items.length > 0 && items.every(isServiceLine);
}

/**
 * True when adding `product` to the current cart would mix a service with
 * physical goods (in either direction).
 */
export function wouldMixTypes(items, product) {
  if (!Array.isArray(items) || items.length === 0 || !product) return false;
  return isServiceProduct(product) ? cartHasPhysical(items) : cartHasService(items);
}

/**
 * The "المبلغ كامل" quick-pay button is disabled whenever the invoice contains a
 * service: a service is paid by the received price, not by tendering the total.
 */
export function isFullAmountDisabled(items) {
  return cartHasService(items);
}

/**
 * A service invoice is only submittable once every service line has a positive
 * received price. Returns the blocking Arabic reason, or null when fine.
 */
export function serviceBlockingReason(items) {
  if (!isServiceInvoice(items)) return null;
  const missing = items.some((i) => !(Number(i?.price) > 0));
  return missing ? SERVICE_PRICE_REQUIRED_ERROR : null;
}
