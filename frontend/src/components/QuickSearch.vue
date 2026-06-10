<template>
  <v-dialog
    v-model="isOpen"
    max-width="700"
    role="dialog"
    aria-labelledby="quick-search-title"
    @update:model-value="onDialogUpdate"
    @keydown.escape="close"
  >
    <v-card>
      <v-card-title id="quick-search-title" class="d-flex align-center gap-2">
        <v-icon>mdi-magnify</v-icon>
        <span>بحث سريع</span>
        <v-spacer />
        <v-chip size="small" variant="outlined">Ctrl+K</v-chip>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0">
        <v-text-field
          v-model="query"
          placeholder="ابحث عن منتج، عميل، فاتورة، مورد، أو شاشة..."
          prepend-inner-icon="mdi-magnify"
          variant="solo"
          flat
          hide-details
          autofocus
          class="search-input"
          :aria-label="'بحث سريع'"
          @input="handleSearch"
          @keydown.down.prevent="navigateResults(1)"
          @keydown.up.prevent="navigateResults(-1)"
          @keydown.enter.prevent="selectCurrent"
        />

        <v-divider />

        <div class="search-results" style="max-height: 400px; overflow-y: auto">
          <div v-if="isLoading" class="pa-4 text-center">
            <v-progress-circular indeterminate color="primary" size="32" />
            <p class="mt-2 text-body-2">جاري البحث...</p>
          </div>

          <div v-else-if="!query.trim()" class="pa-4">
            <p class="text-body-2 text-medium-emphasis mb-2">ابدأ الكتابة للبحث...</p>
            <div class="quick-actions">
              <v-chip
                v-for="page in searchResults.pages"
                :key="page.to"
                :prepend-icon="page.icon"
                variant="outlined"
                class="ma-1"
                @click="selectResult(page)"
              >
                {{ page.title }}
              </v-chip>
            </div>
          </div>

          <div v-else-if="hasResults" class="pa-2">
            <!-- Pages / screens (navigate) -->
            <div v-if="searchResults.pages.length > 0" class="result-section">
              <div class="result-section-title">شاشات</div>
              <v-list density="compact">
                <v-list-item
                  v-for="(item, index) in searchResults.pages"
                  :key="`page-${index}`"
                  :class="{ 'bg-primary-lighten-5': selectedIndex === `page-${index}` }"
                  @click="selectResult(item)"
                >
                  <template #prepend>
                    <v-icon>{{ item.icon }}</v-icon>
                  </template>
                  <v-list-item-title>{{ item.title }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </div>

            <!-- Entity groups with direct actions -->
            <div
              v-for="grp in entityGroups"
              v-show="grp.items.length > 0"
              :key="grp.key"
              class="result-section"
            >
              <div class="result-section-title">{{ grp.label }}</div>
              <v-list density="compact">
                <v-list-item
                  v-for="item in grp.items"
                  :key="`${grp.key}-${item.id}`"
                  :class="{ 'bg-primary-lighten-5': selectedIndex === `${grp.key}-${item.id}` }"
                >
                  <template #prepend>
                    <v-icon>{{ item.icon }}</v-icon>
                  </template>
                  <v-list-item-title>{{ item.title }}</v-list-item-title>
                  <v-list-item-subtitle>{{ item.subtitle }}</v-list-item-subtitle>
                  <template #append>
                    <div class="d-flex flex-wrap gap-1 justify-end">
                      <v-btn
                        v-for="(act, ai) in item.actions"
                        :key="ai"
                        size="x-small"
                        :variant="ai === 0 ? 'tonal' : 'text'"
                        color="primary"
                        :prepend-icon="act.icon"
                        @click.stop="act.handler()"
                      >
                        {{ act.label }}
                      </v-btn>
                    </div>
                  </template>
                </v-list-item>
              </v-list>
            </div>
          </div>

          <div v-else class="pa-4 text-center text-medium-emphasis">
            <v-icon size="48" color="grey">mdi-magnify</v-icon>
            <p class="mt-2">لا توجد نتائج</p>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuickSearch } from '@/composables/useQuickSearch';

const { query, isOpen, isLoading, searchResults, performSearch, open, close, selectResult } =
  useQuickSearch();

const selectedIndex = ref(null);

// Entity groups (with direct actions) rendered after the screens section.
const entityGroups = computed(() => [
  { key: 'product', label: 'منتجات', items: searchResults.value.products },
  { key: 'customer', label: 'عملاء', items: searchResults.value.customers },
  { key: 'sale', label: 'فواتير', items: searchResults.value.sales },
  { key: 'supplier', label: 'موردون', items: searchResults.value.suppliers },
]);

const hasResults = computed(() => {
  return (
    searchResults.value.pages.length > 0 ||
    searchResults.value.products.length > 0 ||
    searchResults.value.customers.length > 0 ||
    searchResults.value.sales.length > 0 ||
    searchResults.value.suppliers.length > 0
  );
});

let searchTimer = null;
const handleSearch = () => {
  selectedIndex.value = null;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => performSearch(), 220);
};

const navigateResults = (direction) => {
  const allResults = [
    ...searchResults.value.pages.map((r, i) => ({ ...r, key: `page-${i}` })),
    ...searchResults.value.products.map((r) => ({ ...r, key: `product-${r.id}` })),
    ...searchResults.value.customers.map((r) => ({ ...r, key: `customer-${r.id}` })),
    ...searchResults.value.sales.map((r) => ({ ...r, key: `sale-${r.id}` })),
    ...searchResults.value.suppliers.map((r) => ({ ...r, key: `supplier-${r.id}` })),
  ];

  if (allResults.length === 0) return;

  const currentIdx = selectedIndex.value
    ? allResults.findIndex((r) => r.key === selectedIndex.value)
    : -1;

  let newIdx = currentIdx + direction;
  if (newIdx < 0) newIdx = allResults.length - 1;
  if (newIdx >= allResults.length) newIdx = 0;

  selectedIndex.value = allResults[newIdx].key;
};

const selectCurrent = () => {
  if (!selectedIndex.value) {
    const firstResult =
      searchResults.value.pages[0] ||
      searchResults.value.products[0] ||
      searchResults.value.customers[0] ||
      searchResults.value.sales[0] ||
      searchResults.value.suppliers[0];
    if (firstResult) {
      selectResult(firstResult);
    }
    return;
  }

  const allResults = [
      ...searchResults.value.pages.map((r, i) => ({ ...r, key: `page-${i}` })),
      ...searchResults.value.products.map((r) => ({ ...r, key: `product-${r.id}` })),
      ...searchResults.value.customers.map((r) => ({ ...r, key: `customer-${r.id}` })),
      ...searchResults.value.sales.map((r) => ({ ...r, key: `sale-${r.id}` })),
      ...searchResults.value.suppliers.map((r) => ({ ...r, key: `supplier-${r.id}` })),
    ],
    result = allResults.find((r) => r.key === selectedIndex.value);

  if (result) {
    selectResult(result);
  }
};

const onDialogUpdate = (value) => {
  if (!value) {
    close();
  }
};

const handleOpenEvent = () => {
  open();
};

onMounted(() => {
  window.addEventListener('open-quick-search', handleOpenEvent);
  // WorkHub's "بحث سريع" button dispatches this name.
  window.addEventListener('open-command-palette', handleOpenEvent);
});

onUnmounted(() => {
  window.removeEventListener('open-quick-search', handleOpenEvent);
  window.removeEventListener('open-command-palette', handleOpenEvent);
});
</script>

<style scoped lang="scss">
.search-input {
  :deep(.v-field__input) {
    padding: 1rem;
    font-size: 1rem;
  }
}

.search-results {
  .result-section {
    margin-bottom: 0.5rem;
  }

  .result-section-title {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    color: rgb(var(--v-theme-on-surface-variant));
    background-color: rgb(var(--v-theme-surface-variant));
  }
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
