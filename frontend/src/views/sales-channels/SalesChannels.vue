<template>
  <div class="page-shell">
    <PageHeader
      title="قنوات البيع"
      subtitle="إدارة مصادر الطلبات (فيسبوك، انستغرام، واتساب، الموقع، ...)"
      icon="mdi-bullhorn-variant"
    >
      <v-btn
        v-if="can('sales_channels:create')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openDialog()"
        >قناة جديدة
      </v-btn>
    </PageHeader>

    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="channelStore.channels"
        :loading="channelStore.loading"
        :items-per-page="channelStore.pagination.limit"
        :page="channelStore.pagination.page"
        :items-length="channelStore.pagination.total"
        server-items-length
        density="comfortable"
        hide-default-footer
        @update:items-per-page="changeItemsPerPage"
      >
        <template #[`item.name`]="{ item }">
          <div class="d-flex align-center gap-2">
            <v-avatar :color="item.color || 'grey-lighten-1'" size="32">
              <v-icon color="white" size="18">{{ item.icon || 'mdi-bullhorn-variant' }}</v-icon>
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

        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="can('sales_channels:update')"
            icon="mdi-pencil"
            size="small"
            variant="text"
            @click="openDialog(item)"
          ></v-btn>
          <v-btn
            v-if="can('sales_channels:delete')"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            @click="confirmDelete(item)"
          ></v-btn>
        </template>
      </v-data-table>

      <PaginationControls
        :pagination="channelStore.pagination"
        @update:page="changePage"
        @update:items-per-page="changeItemsPerPage"
      />
    </v-card>

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
                label="الأيقونة (mdi)"
                placeholder="mdi-whatsapp"
                variant="outlined"
                density="comfortable"
                class="flex-grow-1"
              >
                <template #prepend-inner>
                  <v-icon :color="formData.color || undefined">{{
                    formData.icon || 'mdi-bullhorn-variant'
                  }}</v-icon>
                </template>
              </v-text-field>

              <v-text-field
                v-model="formData.color"
                label="اللون"
                placeholder="#25D366"
                variant="outlined"
                density="comfortable"
                style="max-width: 160px"
              >
                <template #prepend-inner>
                  <v-avatar :color="formData.color || 'grey-lighten-1'" size="22" />
                </template>
              </v-text-field>
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

    <ConfirmDialog
      v-model="deleteDialog"
      title="تأكيد الحذف"
      message="هل أنت متأكد من حذف قناة البيع؟"
      :details="selectedChannel ? `القناة: ${selectedChannel.name}` : ''"
      type="error"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="handleDelete"
      @cancel="deleteDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { usePermissions } from '@/composables/usePermissions';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import PageHeader from '@/components/PageHeader.vue';

const channelStore = useSalesChannelStore();
const { can } = usePermissions();

const dialog = ref(false);
const deleteDialog = ref(false);
const form = ref(null);
const saving = ref(false);
const selectedChannel = ref(null);

const emptyForm = () => ({ name: '', code: '', color: '', icon: '', isActive: true });
const formData = ref(emptyForm());

const headers = [
  { title: 'القناة', key: 'name' },
  { title: 'الرمز', key: 'code' },
  { title: 'الحالة', key: 'isActive' },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const codeRules = [
  (v) => !!v || 'الرمز مطلوب',
  (v) => /^[A-Za-z][A-Za-z0-9_]*$/.test(v || '') || 'حروف وأرقام وشرطة سفلية فقط',
];

const isEdit = computed(() => !!selectedChannel.value);

const openDialog = (channel = null) => {
  if (channel) {
    selectedChannel.value = channel;
    formData.value = {
      name: channel.name ?? '',
      code: channel.code ?? '',
      color: channel.color ?? '',
      icon: channel.icon ?? '',
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

const confirmDelete = (channel) => {
  selectedChannel.value = channel;
  deleteDialog.value = true;
};

const handleDelete = async () => {
  try {
    await channelStore.deleteChannel(selectedChannel.value.id);
    deleteDialog.value = false;
  } catch {
    // Error surfaced via notification store
  }
};

const changePage = (page) => {
  const pageNum = Number(page);
  if (isNaN(pageNum) || pageNum < 1) return;
  if (pageNum === channelStore.pagination.page) return;
  channelStore.pagination.page = pageNum;
  channelStore.fetchChannels({ page: pageNum, limit: channelStore.pagination.limit });
};

const changeItemsPerPage = (limit) => {
  const limitNum = Number(limit);
  channelStore.pagination.limit = limitNum;
  channelStore.pagination.page = 1;
  channelStore.fetchChannels({ page: 1, limit: limitNum });
};

onMounted(() => {
  channelStore.fetchChannels({ page: 1, limit: channelStore.pagination.limit });
});
</script>
