<template>
  <div class="project-main-header">
    <div class="project-main-title">
      <h2>{{ project?.name }}</h2>
      <p>{{ project?.description || '可在此项目中持续沉淀文档、素材与处理记录' }}</p>
    </div>
    <div class="project-main-actions">
      <AppButton size="sm" variant="outline" tone="neutral" @click="emit('refresh')">
        <template #icon>
          <AppIcon name="refresh" />
        </template>
        刷新
      </AppButton>
      <AppButton size="sm" variant="outline" tone="neutral" @click="emit('rename')">
        重命名
      </AppButton>
      <AppButton size="sm" variant="ghost" tone="danger" @click="emit('delete')">
        <template #icon>
          <AppIcon name="delete" />
        </template>
        删除
      </AppButton>
    </div>
  </div>
</template>

<script setup>
import AppButton from '../ui/AppButton.vue'
import AppIcon from '../ui/AppIcon.vue'

defineProps({
  project: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['refresh', 'rename', 'delete'])
</script>

<style lang="scss" scoped>
.project-main-header {
  background: #fff;
  border: 1px solid #e8edf6;
  border-radius: 12px;
  padding: 0.9rem 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.project-main-title {
  h2 {
    margin: 0;
    color: #22314d;
    font-size: 1.2rem;
  }

  p {
    margin: 0.2rem 0 0;
    color: #7e8aa2;
    font-size: 0.82rem;
  }
}

.project-main-actions {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
}
</style>
