<script setup lang="ts">
// The 404 page in a main landmark (axe landmark-one-main and region, audit 18): VitePress's NotFound is a <div>, so
// config.mts points VPContent's import of it here, and this draws it inside <main>.
import NotFound from 'vitepress/dist/client/theme-default/NotFound.vue';
</script>

<template>
  <main class="NotFoundMain">
    <NotFound />
  </main>
</template>
