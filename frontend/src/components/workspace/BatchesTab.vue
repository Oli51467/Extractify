<template>
  <div class="tab-panel">
    <AppCard class="list-card">
      <template #header>
        <div class="panel-card-header">批量任务（{{ projectBatches.length }}）</div>
      </template>

      <div v-if="projectBatches.length > 0" class="simple-list">
        <div v-for="batch in projectBatches" :key="batch.id" class="simple-item">
          <div class="simple-item-title">
            <span>{{ batch.name }}</span>
            <StatusChip :status="batch.status" />
          </div>
          <div class="simple-item-meta">
            <span>{{ batch.completedItems }}/{{ batch.totalItems }} 完成</span>
            <span>{{ batch.failedItems }} 失败</span>
            <span>{{ formatDate(batch.createdAt) }}</span>
          </div>
          <div class="batch-row-actions">
            <AppButton size="sm" variant="outline" tone="neutral" @click="emit('toggle-detail', batch.id)">
              {{ expandedBatchId === batch.id ? '收起明细' : '查看明细' }}
            </AppButton>
            <AppButton
              v-if="batch.failedItems > 0"
              size="sm"
              variant="outline"
              tone="success"
              @click="emit('retry-batch', batch.id)"
            >
              重试失败项
            </AppButton>
            <AppButton
              v-if="batch.queuedItems > 0"
              size="sm"
              variant="ghost"
              tone="danger"
              @click="emit('cancel-batch', batch.id)"
            >
              取消排队项
            </AppButton>
          </div>
          <div v-if="expandedBatchId === batch.id" class="batch-item-detail">
            <div v-for="item in expandedBatchItems" :key="item.id" class="batch-item">
              <span>{{ item.sourceName || item.originalFilename }}</span>
              <StatusChip :status="item.status" />
              <span>{{ item.progress }}%</span>
              <span>{{ item.message || '-' }}</span>
            </div>
          </div>
        </div>
      </div>
      <AppEmpty v-else description="暂无批量任务" />
    </AppCard>
  </div>
</template>

<script setup>
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import StatusChip from './StatusChip.vue'
import { formatDate } from '../../utils/formatters'

defineProps({
  projectBatches: {
    type: Array,
    default: () => []
  },
  expandedBatchId: {
    type: String,
    default: ''
  },
  expandedBatchItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['toggle-detail', 'retry-batch', 'cancel-batch'])
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

.batch-row-actions {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.batch-item-detail {
  margin-top: 0.5rem;
  border-top: 1px dashed #e4eaf5;
  padding-top: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.batch-item {
  display: grid;
  grid-template-columns: minmax(0, 2fr) auto auto minmax(0, 2fr);
  gap: 0.45rem;
  align-items: center;
  font-size: 0.75rem;
  color: #6f7b93;

  span:first-child,
  span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
