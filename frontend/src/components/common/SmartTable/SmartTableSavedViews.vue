<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="6">
    <template #activator="{ props: act }">
      <v-btn v-bind="act" size="small" variant="text" prepend-icon="mdi-bookmark-multiple-outline" class="st-tool-btn">
        {{ activeView ? activeView.name : 'العروض' }}
        <v-icon size="16" class="ms-1">mdi-menu-down</v-icon>
      </v-btn>
    </template>

    <v-card min-width="280" max-width="340">
      <v-list density="compact" class="py-1">
        <v-list-item
          prepend-icon="mdi-table"
          title="العرض الافتراضي"
          :active="!activeViewId"
          @click="$emit('reset')"
        />
        <v-divider v-if="views.length" class="my-1" />

        <v-list-item
          v-for="v in views"
          :key="v.id"
          :active="v.id === activeViewId"
          @click="$emit('apply', v.id)"
        >
          <template #prepend>
            <v-icon size="18">{{ v.isDefault ? 'mdi-star' : 'mdi-bookmark-outline' }}</v-icon>
          </template>
          <v-list-item-title class="st-views__title">{{ v.name }}</v-list-item-title>
          <template #append>
            <v-menu location="bottom end">
              <template #activator="{ props: m }">
                <v-btn v-bind="m" icon="mdi-dots-horizontal" size="x-small" variant="text" @click.stop />
              </template>
              <v-list density="compact">
                <v-list-item
                  prepend-icon="mdi-star-outline"
                  title="تعيين كافتراضي"
                  @click="$emit('set-default', v.id)"
                />
                <v-list-item prepend-icon="mdi-pencil-outline" title="إعادة تسمية" @click="startRename(v)" />
                <v-list-item
                  prepend-icon="mdi-delete-outline"
                  title="حذف"
                  class="text-error"
                  @click="$emit('delete', v.id)"
                />
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </v-list>

      <v-divider />
      <div class="pa-2">
        <v-text-field
          v-if="creating || renaming"
          v-model="draftName"
          :label="renaming ? 'الاسم الجديد' : 'اسم العرض الجديد'"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          append-inner-icon="mdi-check"
          @keyup.enter="commit"
          @click:append-inner="commit"
        />
        <v-btn
          v-else
          block
          size="small"
          variant="tonal"
          prepend-icon="mdi-content-save-plus-outline"
          @click="creating = true"
        >
          حفظ العرض الحالي
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref, computed } from 'vue';

/**
 * SmartTableSavedViews (req #5) — named snapshots of columns + density +
 * filters + search + sort + page size. Stateless UI over useSmartTable's view
 * API; the parent persists. Lets the user create / apply / rename / delete /
 * set-default a view, or return to the factory default layout.
 */
const props = defineProps({
  views: { type: Array, default: () => [] },
  activeViewId: { type: String, default: null },
});

const emit = defineEmits(['apply', 'create', 'rename', 'delete', 'set-default', 'reset']);

const open = ref(false);
const creating = ref(false);
const renaming = ref(null); // view id being renamed
const draftName = ref('');

const activeView = computed(() => props.views.find((v) => v.id === props.activeViewId) || null);

const startRename = (v) => {
  renaming.value = v.id;
  creating.value = false;
  draftName.value = v.name;
};

const commit = () => {
  const name = draftName.value.trim();
  if (!name) return;
  if (renaming.value) {
    emit('rename', { id: renaming.value, name });
  } else {
    emit('create', name);
  }
  draftName.value = '';
  creating.value = false;
  renaming.value = null;
};
</script>

<style scoped lang="scss">
.st-views__title {
  font-size: 13px;
}
</style>
