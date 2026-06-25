<template>
  <!-- Shell-scoped global overlays. The command palette / quick search belongs
       to the authenticated desktop shell (it navigates between modules), so it
       lives here rather than in App.vue.

       App-wide overlays that must also appear on the Login / ServerSetup /
       Activation screens — AppSnackbar (toasts), AppErrorDialog
       (confirmations / errors), LoadingSpinner and UpdateNotification — stay
       mounted in App.vue and are intentionally NOT duplicated here.

       Two complementary palettes:
       - QuickSearch    (Ctrl+K)       → quick navigation / entity search
       - CommandPalette (Ctrl+Shift+P) → run any registered command -->
  <QuickSearch />
  <CommandPalette />
</template>

<script setup>
import QuickSearch from '@/components/QuickSearch.vue';
import CommandPalette from './CommandPalette.vue';
</script>
