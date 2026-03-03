<template>
  <div class="mergify-page">
    <WorkbenchSwitcher />

    <AppCard class="merge-card">
      <ImageMerger />
    </AppCard>
  </div>
</template>

<script setup>
import ImageMerger from '../components/ImageMerger.vue'
import AppCard from '../components/ui/AppCard.vue'
import WorkbenchSwitcher from '../components/workspace/WorkbenchSwitcher.vue'
</script>

<style lang="scss" scoped>
.mergify-page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.merge-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
</style>
