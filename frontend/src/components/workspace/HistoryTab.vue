<template>
  <div class="tab-panel">
    <AppCard class="list-card">
      <template #header>
        <div class="panel-card-header">处理历史（{{ projectRuns.length }}）</div>
      </template>
      <div v-if="projectRuns.length > 0" class="simple-list">
        <div v-for="run in projectRuns" :key="run.id" class="simple-item">
          <div class="simple-item-title">
            <span>{{ run.sourceName || '未命名任务' }}</span>
            <StatusChip :status="run.status" />
          </div>
          <div class="simple-item-meta">
            <span>进度 {{ run.progress }}%</span>
            <span>{{ run.message || '-' }}</span>
            <span>{{ formatDate(run.createdAt) }}</span>
          </div>
        </div>
      </div>
      <AppEmpty v-else description="暂无处理历史" />
    </AppCard>
  </div>
</template>

<script setup>
import StatusChip from './StatusChip.vue'
import AppCard from '../ui/AppCard.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import { formatDate } from '../../utils/formatters'

defineProps({
  projectRuns: {
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

.simple-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.simple-item {
  border: 1px solid #e8edf6;
  border-radius: 10px;
  padding: 0.58rem 0.72rem;
  background: #fff;
}

.simple-item-title {
  color: #24324a;
  font-size: 0.87rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.simple-item-meta {
  margin-top: 0.2rem;
  color: #7f8ba1;
  font-size: 0.76rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
