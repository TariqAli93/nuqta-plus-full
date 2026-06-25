import Customers from './pages/Customers.vue';
import CustomerForm from './pages/CustomerForm.vue';
import CustomerProfile from './pages/CustomerProfile.vue';

/**
 * Customer feature routes (RouteRecordRaw[]).
 *
 * Owned by the feature and spread into the MainLayout children in
 * `@/router/index.js`. RBAC `meta` is unchanged from the original central
 * definitions — moving the declarations here changes nothing about gating.
 *
 * Order note: `/customers/new` is declared before `/customers/:id` for clarity;
 * Vue Router ranks the static segment above the dynamic one regardless.
 */
export const customerRoutes = [
  {
    path: 'customers',
    name: 'Customers',
    component: Customers,
    meta: { permission: 'view:customers' },
  },
  {
    path: 'customers/new',
    name: 'NewCustomer',
    component: CustomerForm,
    meta: { permission: 'customers:create' },
  },
  {
    path: 'customers/:id/edit',
    name: 'EditCustomer',
    component: CustomerForm,
    meta: { permission: 'customers:update' },
  },
  {
    path: 'customers/:id',
    name: 'CustomerProfile',
    component: CustomerProfile,
    meta: { permission: 'view:customers' },
  },
];
