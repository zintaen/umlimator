<script setup lang="ts">
// The home page in a main landmark (axe landmark-one-main and region, audit 17): VitePress's VPHome is a <div>, so
// config.mts points VPContent's import of it here, and this draws it, with its slots, inside <main>.
import VPHome from 'vitepress/dist/client/theme-default/components/VPHome.vue';
</script>

<template>
  <main class="VPHomeMain">
    <VPHome>
      <template v-for="(_, name) in $slots" #[name]><slot :name="name" /></template>
    </VPHome>
  </main>
</template>
