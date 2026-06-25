import { reactive } from 'vue';

/**
 * Bind an AppError's per-field validation errors to form inputs (rule 7).
 *
 * Usage:
 *   const formErrors = useFormErrors();
 *   <v-text-field :error-messages="formErrors.messagesFor('name')" />
 *   ...
 *   await runAction(() => service.create(payload), { form: formErrors });
 *
 * `setFromError(appError)` reads `appError.fieldErrors` (`{ field: [msg] }`).
 * Works with `runAction`, which calls `clear()` then `setFromError()` for you.
 */
export function useFormErrors() {
  const fieldErrors = reactive({});

  const clear = () => {
    for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
  };

  const setFromError = (appError) => {
    clear();
    const map = appError?.fieldErrors || {};
    for (const [field, messages] of Object.entries(map)) {
      fieldErrors[field] = Array.isArray(messages) ? messages : [messages];
    }
  };

  const messagesFor = (field) => fieldErrors[field] || [];
  const has = (field) => (fieldErrors[field]?.length || 0) > 0;
  const setField = (field, message) => {
    fieldErrors[field] = Array.isArray(message) ? message : [message];
  };

  return { fieldErrors, clear, setFromError, messagesFor, has, setField };
}
