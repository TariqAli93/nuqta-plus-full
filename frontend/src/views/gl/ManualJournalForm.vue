<template>
  <v-dialog :model-value="modelValue" max-width="820" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="dialog-title">
        <v-icon>mdi-pencil-plus</v-icon>
        <span>تسجيل يدوي</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pt-4">
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="entryDate"
              type="date"
              label="تاريخ التسجيل"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="description"
              label="البيان"
              variant="outlined"
              density="comfortable"
              hide-details
              placeholder="وصف التسجيل"
            />
          </v-col>
        </v-row>

        <v-table density="compact" class="mt-3">
          <thead>
            <tr>
              <th class="text-start" style="min-width: 220px">الحساب</th>
              <th class="text-end" style="width: 150px">داخل</th>
              <th class="text-end" style="width: 150px">خارج</th>
              <th style="width: 40px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, idx) in lines" :key="idx">
              <td>
                <v-autocomplete
                  v-model="line.accountId"
                  :items="accounts"
                  :item-title="accountTitle"
                  item-value="id"
                  variant="outlined"
                  density="compact"
                  hide-details
                  placeholder="اختر حساباً"
                />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.debit"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                  min="0"
                  @update:model-value="line.credit = 0"
                />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.credit"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                  min="0"
                  @update:model-value="line.debit = 0"
                />
              </td>
              <td class="text-center">
                <v-btn
                  v-if="lines.length > 2"
                  size="x-small"
                  variant="text"
                  icon="mdi-close"
                  color="error"
                  @click="lines.splice(idx, 1)"
                />
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-weight-bold">
              <td>
                <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addLine">سطر</v-btn>
              </td>
              <td class="text-end font-mono" :class="balanced ? '' : 'text-error'">
                {{ totalDebit.toLocaleString() }}
              </td>
              <td class="text-end font-mono" :class="balanced ? '' : 'text-error'">
                {{ totalCredit.toLocaleString() }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </v-table>

        <v-alert
          v-if="!balanced"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
          text="التسجيل غير متوازن — مجموع «داخل» يجب أن يساوي مجموع «خارج»."
        />
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">إلغاء</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="!canSave" @click="save">حفظ التسجيل</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGlStore } from '@/stores/gl';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue', 'saved']);

const glStore = useGlStore();

const entryDate = ref(new Date().toISOString().slice(0, 10));
const description = ref('');
const lines = reactive([
  { accountId: null, debit: 0, credit: 0 },
  { accountId: null, debit: 0, credit: 0 },
]);
const saving = ref(false);

const accountTitle = (a) => `${a.code} — ${a.name}`;

const totalDebit = computed(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
const totalCredit = computed(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
const balanced = computed(
  () => Math.abs(totalDebit.value - totalCredit.value) < 0.005 && totalDebit.value > 0
);
const canSave = computed(
  () => balanced.value && lines.every((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
);

function addLine() {
  lines.push({ accountId: null, debit: 0, credit: 0 });
}

function resetForm() {
  entryDate.value = new Date().toISOString().slice(0, 10);
  description.value = '';
  lines.splice(0, lines.length, { accountId: null, debit: 0, credit: 0 }, { accountId: null, debit: 0, credit: 0 });
}

// Reset whenever the dialog re-opens.
watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  }
);

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    await glStore.createManualEntry({
      entryDate: entryDate.value,
      description: description.value || undefined,
      lines: lines
        .filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
        .map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
    });
    emit('saved');
  } catch (err) {
    console.error('Failed to post manual entry', err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
