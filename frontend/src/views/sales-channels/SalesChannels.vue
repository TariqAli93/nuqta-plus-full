<template>
  <div class="page-shell">
    <PageHeader
      title="قنوات البيع"
      subtitle="إدارة مصادر الطلبات (فيسبوك، انستغرام، واتساب، الموقع، ...)"
      icon="mdi-bullhorn-variant"
    >
      <v-btn
        v-if="can('sales_channels:create')"
        data-testid="sales-channel-new-btn"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openDialog()"
        >قناة جديدة
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (Recipe A: SmartTable owns search + the active filter +
         pagination and drives fetching via @update:options). The create/edit
         dialog stays page-owned; delete uses the row action's built-in confirm. -->
    <SmartTable
      data-testid="sales-channels-table"
      table-key="sales-channels-table"
      :headers="headers"
      :items="channelStore.channels"
      :loading="channelStore.loading"
      :total-items="channelStore.pagination.total"
      server-side
      :page="channelStore.pagination.page"
      :page-size="channelStore.pagination.limit"
      :filters="filterDefs"
      :row-actions="rowActions"
      show-export
      show-print
      print-title="قائمة قنوات البيع"
      export-file-base="sales-channels"
      :export-fetcher="fetchAllForExport"
      search-placeholder="ابحث بالاسم أو الرمز..."
      empty-title="لا توجد قنوات بيع"
      empty-description="أضف قناة بيع لتصنيف مصادر الطلبات الواردة"
      empty-icon="mdi-bullhorn-variant"
      :empty-actions="
        can('sales_channels:create')
          ? [{ text: 'قناة جديدة', icon: 'mdi-plus', onClick: () => openDialog() }]
          : []
      "
      @update:options="loadChannels"
      @refresh="onRefresh"
    >
      <template #[`item.name`]="{ item }">
        <div class="d-flex align-center gap-2">
          <v-avatar :color="item.color || 'grey-lighten-1'" size="32">
            <v-icon color="white" size="18">{{
              `mdi-${item.icon}` || 'mdi-bullhorn-variant'
            }}</v-icon>
          </v-avatar>
          <span>{{ item.name }}</span>
        </div>
      </template>

      <template #[`item.code`]="{ item }">
        <v-chip size="small" variant="tonal" label>{{ item.code }}</v-chip>
      </template>

      <template #[`item.isActive`]="{ item }">
        <v-chip :color="item.isActive ? 'success' : 'grey'" size="small" variant="tonal">
          {{ item.isActive ? 'مفعّلة' : 'معطّلة' }}
        </v-chip>
      </template>
    </SmartTable>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">{{ isEdit ? 'mdi-pencil' : 'mdi-bullhorn-variant' }}</v-icon>
          <span>{{ isEdit ? 'تعديل قناة بيع' : 'قناة بيع جديدة' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form">
            <v-text-field
              v-model="formData.name"
              label="اسم القناة"
              variant="outlined"
              density="comfortable"
              :rules="[(v) => !!v || 'الاسم مطلوب']"
            ></v-text-field>

            <v-text-field
              v-model="formData.code"
              label="الرمز (بالإنجليزية بدون مسافات)"
              hint="مثال: FACEBOOK — يُستخدم كمعرّف ثابت"
              persistent-hint
              variant="outlined"
              density="comfortable"
              :disabled="isEdit"
              :rules="codeRules"
              @update:model-value="formData.code = ($event || '').toUpperCase()"
            ></v-text-field>

            <div class="d-flex gap-3 mt-2">
              <v-text-field
                v-model="formData.icon"
                label="الأيقونة"
                placeholder="whatsapp"
                variant="outlined"
                density="comfortable"
                class="flex-grow-1"
              >
                <template #prepend-inner>
                  <v-icon :color="formData.color || undefined">{{
                    `mdi-${formData.icon}` || 'mdi-bullhorn-variant'
                  }}</v-icon>
                </template>
              </v-text-field>

              <v-menu :close-on-content-click="false" location="bottom" offset="8">
                <template #activator="{ props }">
                  <v-text-field v-bind="props" v-model="formData.color" label="Color" readonly>
                    <template #prepend-inner>
                      <div
                        :style="{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          backgroundColor: formData.color,
                          border: '1px solid #ccc',
                        }"
                      />
                    </template>
                  </v-text-field>
                </template>

                <v-card elevation="8">
                  <v-color-picker
                    v-model="formData.color"
                    label="اللون"
                    :placeholder="formData.color || 'grey-lighten-1'"
                    mode="hexa"
                    hide-inputs
                  >
                    <template #prepend-inner>
                      <v-avatar :color="formData.color || 'grey-lighten-1'" size="22" />
                    </template>
                  </v-color-picker>
                </v-card>
              </v-menu>
            </div>

            <v-switch
              v-model="formData.isActive"
              color="success"
              :label="formData.isActive ? 'القناة مفعّلة' : 'القناة معطّلة'"
              hide-details
              inset
            ></v-switch>
          </v-form>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="saving" @click="handleSubmit">
            حفظ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { usePermissions } from '@/composables/usePermissions';
import api from '@/plugins/axios';
import SmartTable from '@/components/common/SmartTable';
import PageHeader from '@/components/PageHeader.vue';

const channelStore = useSalesChannelStore();
const { can } = usePermissions();

const dialog = ref(false);
const form = ref(null);
const saving = ref(false);
const selectedChannel = ref(null);

const emptyForm = () => ({
  name: '',
  code: '',
  color: '',
  icon: '',
  isActive: true,
});
const formData = ref(emptyForm());

const headers = [
  { title: 'القناة', key: 'name', minWidth: 200 },
  { title: 'الرمز', key: 'code' },
  { title: 'الحالة', key: 'isActive', exportValue: (r) => (r.isActive ? 'مفعّلة' : 'معطّلة') },
];

// Advanced filter — the backend supports an `isActive` filter, so surface it as
// an auto-rendered SmartTable filter (control + chip handled by SmartTable).
const filterDefs = [
  {
    key: 'isActive',
    type: 'select',
    label: 'الحالة',
    options: [
      { title: 'مفعّلة', value: 'true' },
      { title: 'معطّلة', value: 'false' },
    ],
  },
];

const rowActions = [
  {
    key: 'edit',
    icon: 'mdi-pencil',
    title: 'تعديل',
    primary: true,
    permission: 'sales_channels:update',
    handler: (item) => openDialog(item),
  },
  {
    key: 'delete',
    icon: 'mdi-delete',
    title: 'حذف',
    color: 'error',
    danger: true,
    permission: 'sales_channels:delete',
    handler: (item) => handleDelete(item),
    confirm: (item) => ({
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف قناة البيع؟',
      details: `القناة: ${item.name}`,
      type: 'error',
      confirmText: 'حذف',
    }),
  },
];

const codeRules = [
  (v) => !!v || 'الرمز مطلوب',
  (v) => /^[A-Za-z][A-Za-z0-9_]*$/.test(v || '') || 'حروف وأرقام وشرطة سفلية فقط',
];

const isEdit = computed(() => !!selectedChannel.value);

// Last requested options, so the toolbar refresh button and the export-all
// fetcher reuse the active page/search/filter instead of resetting them.
const lastOptions = ref({
  page: 1,
  itemsPerPage: channelStore.pagination.limit,
  search: '',
  filters: {},
});

const loadChannels = (opts = {}) => {
  lastOptions.value = { ...lastOptions.value, ...opts };
  const { page, itemsPerPage, search, filters } = lastOptions.value;
  const params = {
    page: page || 1,
    limit: itemsPerPage || channelStore.pagination.limit,
  };
  const term = (search || '').trim();
  if (term) params.search = term;
  const active = filters?.isActive;
  if (active === 'true' || active === 'false') params.isActive = active;
  return channelStore.fetchChannels(params);
};

const onRefresh = () => loadChannels();

// Export "all results": fetch the full set without clobbering the visible page
// (the store mutates its own list, so we query the API directly here).
const fetchAllForExport = async () => {
  const params = { page: 1, limit: 10000 };
  const term = (lastOptions.value.search || '').trim();
  if (term) params.search = term;
  const active = lastOptions.value.filters?.isActive;
  if (active === 'true' || active === 'false') params.isActive = active;
  // The axios interceptor unwraps to the JSON body, so `res.data` is the array.
  const res = await api.get('/sales-channels', { params });
  return res?.data || [];
};

const openDialog = (channel = null) => {
  if (channel) {
    selectedChannel.value = channel;
    formData.value = {
      name: channel.name ?? '',
      code: channel.code ?? '',
      color: channel.color ?? '',
      icon: channel.icon ? `mdi-${channel.icon}` : 'mdi-bullhorn-variant',
      isActive: channel.isActive !== false,
    };
  } else {
    selectedChannel.value = null;
    formData.value = emptyForm();
  }
  dialog.value = true;
};

const buildPayload = () => {
  const payload = {
    name: formData.value.name?.trim(),
    color: formData.value.color?.trim() || null,
    icon: formData.value.icon?.trim() || null,
    isActive: formData.value.isActive,
  };
  // Code is immutable after creation — only send it on create.
  if (!isEdit.value) payload.code = formData.value.code?.trim().toUpperCase();
  return payload;
};

const handleSubmit = async () => {
  const { valid } = await form.value.validate();
  if (!valid) return;

  saving.value = true;
  try {
    if (isEdit.value) {
      await channelStore.updateChannel(selectedChannel.value.id, buildPayload());
    } else {
      await channelStore.createChannel(buildPayload());
    }
    dialog.value = false;
  } catch {
    // Error surfaced via notification store
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (channel) => {
  try {
    await channelStore.deleteChannel(channel.id);
  } catch {
    // Error surfaced via notification store
  }
};
</script>
