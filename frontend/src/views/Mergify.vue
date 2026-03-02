<template>
  <div class="mergify-page">
    <el-card class="merge-card">
      <template #header>
        <div class="merge-header">
          <h2>图片拼接</h2>
        </div>
      </template>
      <ImageMerger />
    </el-card>
  </div>
</template>

<script setup>
import ImageMerger from '../components/ImageMerger.vue'
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

.merge-header {
  h2 {
    margin: 0;
    font-weight: 500;
    color: var(--text-primary);
  }
}
</style>
