<template>
  <div class="dt-context-host" @contextmenu.prevent="onContextMenu">
    <slot />
  </div>

  <v-menu v-model="open" :target="target" location="end" :close-on-content-click="true">
    <v-list density="compact" min-width="200" class="dt-context-menu">
      <slot name="menu" :close="close">
        <template v-for="(item, i) in items" :key="item.id || i">
          <v-divider v-if="item.divider" class="my-1" />
          <v-list-item
            v-else
            :disabled="item.disabled"
            :prepend-icon="item.icon"
            @click="run(item)"
          >
            <v-list-item-title :class="{ 'text-error': item.danger }">
              {{ item.title }}
            </v-list-item-title>
            <template v-if="item.shortcut" #append>
              <span class="dt-context-menu__kbd">{{ item.shortcut }}</span>
            </template>
          </v-list-item>
        </template>
      </slot>
    </v-list>
  </v-menu>
</template>

<script setup>
import { ref } from 'vue';

/**
 * Native-feeling right-click context menu (a desktop convention the app was
 * missing). Wrap any content; right-clicking it opens a menu at the pointer.
 *
 * Provide either `items` (array) or the `menu` slot (gets a `close` fn). Each
 * item: { title, icon?, shortcut?, disabled?, danger?, divider?, handler? }.
 * Handlers + disabled (e.g. from permissions/commands) are the caller's job —
 * this component carries no business logic. Pairs naturally with the command
 * system: an item's `handler` can be `() => execute('some.command.id')`.
 *
 * @prop {Array} items
 */
defineProps({
  items: { type: Array, default: () => [] },
});

const open = ref(false);
const target = ref([0, 0]);

const onContextMenu = (e) => {
  target.value = [e.clientX, e.clientY];
  open.value = true;
};
const close = () => {
  open.value = false;
};
const run = (item) => {
  if (item.disabled) return;
  close();
  item.handler?.();
};
</script>

<style scoped lang="scss">
.dt-context-host {
  display: contents;
}
.dt-context-menu__kbd {
  font-size: 10.5px;
  opacity: 0.6;
}
</style>
