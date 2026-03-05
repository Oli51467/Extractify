<template>
  <div class="tab-panel">
    <AppCard class="gallery-card">
      <template #header>
        <div class="panel-card-header">素材库（{{ galleryImages.length }}）</div>
      </template>
      <ImageGallery :images="galleryImages" :project-id="projectId" :zip-urls="zipUrls" />
    </AppCard>
  </div>
</template>

<script setup>
import ImageGallery from '../ImageGallery.vue'
import AppCard from '../ui/AppCard.vue'

defineProps({
  projectId: {
    type: String,
    default: ''
  },
  galleryImages: {
    type: Array,
    default: () => []
  },
  zipUrls: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="scss" scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.panel-card-header {
  font-weight: 600;
  color: #24324a;
}
</style>
