<template>
  <DesktopTitleBar :is-menu-visible="0" class="desktop-shell__titlebar" />
  <v-app>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import DesktopTitleBar from '../shell/DesktopTitleBar.vue';
</script>

<style scoped></style>
