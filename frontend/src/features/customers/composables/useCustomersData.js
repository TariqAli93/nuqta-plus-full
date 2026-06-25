import { ref } from 'vue';
import { customersService } from '../services/customers.service.js';

/**
 * Customer data-access composable.
 *
 * Orchestrates the customers service for the pages (rule 10: data fetching lives
 * here, not inline in the view). Error toasts come from the shared axios
 * interceptor, so this layer only tracks local loading/error and returns data.
 */
export function useCustomersData() {
  const loading = ref(false);
  const error = ref(null);

  const run = async (fn) => {
    loading.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /** Load a single customer record (for the edit form). */
  const loadCustomer = (id) => run(async () => (await customersService.get(id))?.data || null);

  /** Load the full customer 360 profile payload. */
  const loadProfile = (id) => run(async () => (await customersService.profile(id))?.data || null);

  /** Load the customer aging buckets. */
  const loadAging = (id) => run(async () => (await customersService.aging(id))?.data || null);

  return { loading, error, loadCustomer, loadProfile, loadAging };
}
