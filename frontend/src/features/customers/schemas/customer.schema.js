import { normalizeIraqPhone } from '@/utils/phone';

/**
 * Shared customer form validators + payload shape.
 *
 * Single source of truth for create AND edit (rule 2): CustomerForm imports
 * these instead of inlining rule closures, so both flows validate identically.
 */

export const required = (v) => !!v || 'هذا الحقل مطلوب';

/** Soft phone check — empty is allowed; an un-normalisable value warns. */
export const phoneRule = (v) => {
  const raw = (v || '').trim();
  if (!raw) return true;
  if (!normalizeIraqPhone(raw)) {
    return 'تنسيق رقم الهاتف غير مفهوم — تأكّد من الأرقام (يُقبل +964 أو 0…)';
  }
  return true;
};

export const customerRules = {
  required,
  phone: phoneRule,
};

/** A blank customer form model. */
export const emptyCustomer = () => ({
  name: '',
  phone: '',
  city: '',
  address: '',
  notes: '',
  customerType: 'retail',
  creditLimit: null,
});

export const customerTypeOptions = [
  { value: 'retail', label: 'مفرد (تجزئة)' },
  { value: 'wholesale', label: 'جملة' },
  { value: 'agent', label: 'وكيل' },
];
