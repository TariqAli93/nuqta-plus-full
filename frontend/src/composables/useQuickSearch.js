import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useProductStore } from '@/stores/product';
import { useCustomerStore } from '@/stores/customer';
import { useSaleStore } from '@/stores/sale';
import { useSupplierStore } from '@/stores/supplier';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/formatters';

/**
 * Quick command palette (بحث سريع — Ctrl+K). Federated search across
 * products / customers / invoices / suppliers reusing each store's ranked
 * list endpoint. Every result carries DIRECT ACTIONS so the palette executes
 * tasks (قبض دين، بيع، طباعة…) instead of merely navigating — fewer clicks.
 */
export function useQuickSearch() {
  const router = useRouter();
  const productStore = useProductStore();
  const customerStore = useCustomerStore();
  const saleStore = useSaleStore();
  const supplierStore = useSupplierStore();
  const authStore = useAuthStore();

  const query = ref('');
  const isOpen = ref(false);
  const isLoading = ref(false);
  const results = ref([]);

  // Shortcut screens shown when the query is empty.
  const SHORTCUTS = [
    { title: 'بيع جديد', to: '/sales/pos', icon: 'mdi-cash-register', type: 'page', need: 'canUsePOS', cap: true },
    { title: 'قبض الديون', to: '/collections', icon: 'mdi-hand-coin', type: 'page', need: 'view:sales' },
    { title: 'العملاء', to: '/customers', icon: 'mdi-account-group', type: 'page', need: 'view:customers' },
    { title: 'البضاعة', to: '/products', icon: 'mdi-package-variant', type: 'page', need: 'view:products' },
    { title: 'المشتريات', to: '/purchases', icon: 'mdi-cart-arrow-down', type: 'page', need: 'view:purchases' },
    { title: 'الصندوق', to: '/sales/shifts', icon: 'mdi-safe-square-outline', type: 'page', need: 'view:sales' },
    { title: 'التقارير', to: '/reports/simple', icon: 'mdi-chart-box', type: 'page', need: 'view:reports' },
  ];

  const allowedShortcuts = () =>
    SHORTCUTS.filter((s) => (s.cap ? authStore.can(s.need) : authStore.hasPermission(s.need)));

  const searchResults = computed(() => {
    if (!query.value.trim()) {
      return { pages: allowedShortcuts(), products: [], customers: [], sales: [], suppliers: [] };
    }
    return {
      pages: results.value.filter((r) => r.type === 'page'),
      products: results.value.filter((r) => r.type === 'product'),
      customers: results.value.filter((r) => r.type === 'customer'),
      sales: results.value.filter((r) => r.type === 'sale'),
      suppliers: results.value.filter((r) => r.type === 'supplier'),
    };
  });

  const go = (to) => {
    router.push(to);
    close();
  };

  const whatsapp = (phone) => {
    if (!phone) return;
    const digits = String(phone).replace(/\D/g, '');
    const intl = digits.startsWith('0') ? `964${digits.slice(1)}` : digits;
    window.open(`https://wa.me/${intl}`, '_blank');
    close();
  };

  const performSearch = async () => {
    const term = query.value.trim();
    if (!term) {
      results.value = [];
      return;
    }

    isLoading.value = true;
    try {
      const tasks = [];

      if (authStore.hasPermission('view:products')) {
        tasks.push(
          productStore
            .fetch({ search: term, limit: 5 })
            .then((res) =>
              (res.data || []).map((p) => ({
                id: p.id,
                title: p.name,
                subtitle: `المتوفر: ${p.stock ?? 0} • السعر: ${formatCurrency(p.sellingPrice, p.currency || 'IQD')}`,
                icon: 'mdi-package-variant',
                type: 'product',
                to: `/products/${p.id}/edit`,
                actions: [
                  ...(authStore.can('canUsePOS')
                    ? [{ label: 'إضافة للبيع', icon: 'mdi-cart-plus', handler: () => go(`/sales/pos?product=${p.id}`) }]
                    : []),
                  { label: 'فتح', icon: 'mdi-open-in-new', handler: () => go(`/products/${p.id}/edit`) },
                ],
              }))
            )
            .catch(() => [])
        );
      }

      if (authStore.hasPermission('view:customers')) {
        tasks.push(
          customerStore
            .fetch({ search: term, limit: 5 })
            .then((res) =>
              (res.data || []).map((c) => {
                const debt = Number(c.totalDebt || 0);
                return {
                  id: c.id,
                  title: c.name,
                  subtitle: debt > 0 ? `الدين: ${formatCurrency(debt, 'IQD')}` : c.phone || 'لا يوجد دين',
                  icon: 'mdi-account',
                  type: 'customer',
                  to: `/customers/${c.id}`,
                  actions: [
                    { label: 'فتح', icon: 'mdi-open-in-new', handler: () => go(`/customers/${c.id}`) },
                    ...(authStore.hasPermission('view:sales')
                      ? [{ label: 'قبض دين', icon: 'mdi-hand-coin', handler: () => go(`/collections?customer=${c.id}`) }]
                      : []),
                    ...(authStore.can('canUsePOS')
                      ? [{ label: 'بيع له', icon: 'mdi-cash-register', handler: () => go(`/sales/pos?customer=${c.id}`) }]
                      : []),
                    ...(c.phone ? [{ label: 'واتساب', icon: 'mdi-whatsapp', handler: () => whatsapp(c.phone) }] : []),
                  ],
                };
              })
            )
            .catch(() => [])
        );
      }

      if (authStore.hasPermission('view:sales')) {
        tasks.push(
          saleStore
            .fetch({ search: term, limit: 5 })
            .then((res) =>
              (res.data || []).map((s) => {
                const remaining = Number(s.remainingAmount || 0);
                return {
                  id: s.id,
                  title: `فاتورة ${s.invoiceNumber}`,
                  subtitle: `${s.customer || 'زبون نقدي'} • ${formatCurrency(s.total, s.currency || 'IQD')}${remaining > 0 ? ' • غير مدفوعة' : ''}`,
                  icon: 'mdi-receipt',
                  type: 'sale',
                  to: `/sales/${s.id}`,
                  actions: [
                    { label: 'فتح', icon: 'mdi-open-in-new', handler: () => go(`/sales/${s.id}`) },
                    ...(remaining > 0 && authStore.hasPermission('view:sales')
                      ? [{ label: 'قبض', icon: 'mdi-hand-coin', handler: () => go(`/sales/${s.id}?pay=1`) }]
                      : []),
                    { label: 'طباعة', icon: 'mdi-printer', handler: () => go(`/sales/${s.id}?print=1`) },
                  ],
                };
              })
            )
            .catch(() => [])
        );
      }

      if (authStore.can('canUseSuppliers')) {
        tasks.push(
          supplierStore
            .fetch({ search: term, limit: 5 })
            .then((res) =>
              (res.data || []).map((sup) => {
                const debt = Number(sup.totalDebt || 0);
                return {
                  id: sup.id,
                  title: sup.name,
                  subtitle: debt > 0 ? `المطلوب دفعه: ${formatCurrency(debt, 'IQD')}` : sup.phone || '',
                  icon: 'mdi-truck',
                  type: 'supplier',
                  to: `/suppliers/${sup.id}`,
                  actions: [
                    { label: 'فتح', icon: 'mdi-open-in-new', handler: () => go(`/suppliers/${sup.id}`) },
                    ...(authStore.hasPermission('vouchers:create_payment')
                      ? [{ label: 'دفع له', icon: 'mdi-cash-minus', handler: () => go(`/suppliers/${sup.id}?pay=1`) }]
                      : []),
                  ],
                };
              })
            )
            .catch(() => [])
        );
      }

      const groups = await Promise.all(tasks);
      results.value = groups.flat();
    } catch (error) {
      console.error('Search error:', error);
      results.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const open = () => {
    isOpen.value = true;
    query.value = '';
    results.value = [];
  };

  const close = () => {
    isOpen.value = false;
    query.value = '';
    results.value = [];
  };

  const selectResult = (result) => {
    // Default action = first action's handler, else navigate.
    if (result.actions && result.actions.length) return result.actions[0].handler();
    if (result.to) go(result.to);
  };

  return {
    query,
    isOpen,
    isLoading,
    searchResults,
    performSearch,
    open,
    close,
    selectResult,
  };
}
