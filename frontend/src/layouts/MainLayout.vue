<template>
  <!-- The authenticated app now renders inside the native-style Desktop Shell
       (title bar / menu bar / command bar / navigation rail / workspace /
       status bar). MainLayout is kept as the router's layout component so the
       route table and RBAC guard are completely unchanged — it simply delegates
       to <DesktopShell>, which hosts the <router-view> for the child routes. -->
  <DesktopShell />
</template>

<script setup>
import DesktopShell from '@/shell/DesktopShell.vue';
</script>
