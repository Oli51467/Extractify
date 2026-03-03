<template>
  <div class="tab-panel">
    <AppCard class="list-card">
      <template #header>
        <div class="panel-card-header">
          <span>任务中心（{{ mergedTasks.length }}）</span>
          <div class="header-stats">
            <span class="header-pill is-run">历史 {{ runTaskCount }}</span>
            <span class="header-pill is-batch">批量 {{ batchTaskCount }}</span>
          </div>
        </div>
      </template>

      <div v-if="mergedTasks.length > 0" class="task-list">
        <div
          v-for="task in mergedTasks"
          :key="task.key"
          class="task-card"
          :class="{ 'is-batch': task.type === 'batch' }"
        >
          <div class="task-main-row">
            <div class="task-title-wrap">
              <div class="task-title-line">
                <span class="task-title">{{ task.title }}</span>
                <span class="type-tag" :class="`is-${task.type}`">{{ task.type === 'batch' ? '批量任务' : '历史任务' }}</span>
                <StatusChip :status="task.status" />
              </div>
              <div class="task-meta">
                <span>{{ formatDate(task.createdAt) }}</span>
                <span>{{ task.metaPrimary }}</span>
                <span class="task-meta-message" :title="task.metaSecondary">{{ task.metaSecondary }}</span>
              </div>
            </div>

            <div v-if="task.type === 'run' && (task.zipUrl || task.shareUrl)" class="task-actions">
              <AppButton
                v-if="task.zipUrl"
                size="sm"
                shape="circle"
                variant="ghost"
                tone="neutral"
                title="下载结果"
                aria-label="下载结果"
                @click="downloadTaskZip(task)"
              >
                <template #icon>
                  <AppIcon name="download" />
                </template>
              </AppButton>
              <AppButton
                v-if="task.shareUrl"
                size="sm"
                shape="circle"
                variant="ghost"
                tone="primary"
                title="打开分享入口"
                aria-label="打开分享入口"
                @click="openTaskShare(task)"
              >
                <template #icon>
                  <AppIcon name="share" />
                </template>
              </AppButton>
            </div>
          </div>

          <div v-if="task.type === 'run' && task.summary" class="task-summary">
            <div class="summary-item">
              <span>抽图</span>
              <strong>{{ task.summary.imageCount }}</strong>
            </div>
            <div class="summary-item">
              <span>去重</span>
              <strong>{{ task.summary.dedupedCount }}</strong>
            </div>
            <div class="summary-item">
              <span>OCR</span>
              <strong>{{ task.summary.ocrCount }}</strong>
            </div>
            <div class="summary-item">
              <span>命名</span>
              <strong>{{ task.summary.renameCount }}</strong>
            </div>
          </div>

          <div v-if="task.type === 'batch'" class="batch-panel">
            <div class="batch-actions">
              <AppButton size="sm" variant="outline" tone="neutral" @click="emit('toggle-detail', task.id)">
                {{ props.expandedBatchId === task.id ? '收起明细' : '查看明细' }}
              </AppButton>
              <AppButton
                v-if="task.failedItems > 0"
                size="sm"
                variant="outline"
                tone="success"
                @click="emit('retry-batch', task.id)"
              >
                重试失败项
              </AppButton>
              <AppButton
                v-if="task.queuedItems > 0"
                size="sm"
                variant="ghost"
                tone="danger"
                @click="emit('cancel-batch', task.id)"
              >
                取消排队项
              </AppButton>
            </div>

            <div v-if="props.expandedBatchId === task.id" class="batch-detail">
              <div v-for="item in props.expandedBatchItems" :key="item.id" class="batch-item">
                <span :title="item.sourceName || item.originalFilename">{{ item.sourceName || item.originalFilename }}</span>
                <StatusChip :status="item.status" />
                <span>{{ item.progress }}%</span>
                <span :title="item.message || '-'">{{ item.message || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AppEmpty v-else description="暂无任务" />
    </AppCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { notify } from '../../services/notify'
import StatusChip from './StatusChip.vue'
import AppCard from '../ui/AppCard.vue'
import AppButton from '../ui/AppButton.vue'
import AppIcon from '../ui/AppIcon.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import { formatDate } from '../../utils/formatters'

const props = defineProps({
  projectRuns: {
    type: Array,
    default: () => []
  },
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

const toAbsoluteUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`
  return `${window.location.origin}/${raw}`
}

const toTaskTime = (value) => {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : 0
}

const runSummary = (result = {}) => ({
  imageCount: Number(result?.imageCount || 0),
  dedupedCount: Number(result?.dedupe?.dedupedCount || 0),
  ocrCount: Number(result?.ocr?.indexedCount || 0),
  renameCount: Number(result?.naming?.renamedCount || 0)
})

const resolveRunShareUrl = (run) => toAbsoluteUrl(
  run?.result?.share?.url
  || run?.result?.share?.sharePath
  || (run?.result?.share?.token ? `/share/${encodeURIComponent(run.result.share.token)}` : '')
)

const mergedTasks = computed(() => {
  const runTasks = (props.projectRuns || []).map((run) => {
    const result = run?.result || {}
    return {
      key: `run_${run.id}`,
      id: run.id,
      type: 'run',
      title: run.sourceName || '未命名任务',
      status: run.status || '',
      createdAt: run.createdAt,
      zipUrl: toAbsoluteUrl(result.zipUrl),
      shareUrl: resolveRunShareUrl(run),
      summary: runSummary(result),
      metaPrimary: `进度 ${Number(run.progress || 0)}%`,
      metaSecondary: run.message || '-'
    }
  })

  const batchTasks = (props.projectBatches || []).map((batch) => ({
    key: `batch_${batch.id}`,
    id: batch.id,
    type: 'batch',
    title: batch.name || '未命名批量任务',
    status: batch.status || '',
    createdAt: batch.createdAt,
    failedItems: Number(batch.failedItems || 0),
    queuedItems: Number(batch.queuedItems || 0),
    metaPrimary: `${Number(batch.completedItems || 0)}/${Number(batch.totalItems || 0)} 完成`,
    metaSecondary: `${Number(batch.failedItems || 0)} 失败 · ${Number(batch.processingItems || 0)} 处理中`
  }))

  return [...runTasks, ...batchTasks]
    .sort((a, b) => toTaskTime(b.createdAt) - toTaskTime(a.createdAt))
})

const runTaskCount = computed(() => mergedTasks.value.filter((item) => item.type === 'run').length)
const batchTaskCount = computed(() => mergedTasks.value.filter((item) => item.type === 'batch').length)

const downloadTaskZip = (task) => {
  if (!task?.zipUrl) {
    notify.warning('该任务暂无可下载结果')
    return
  }
  const link = document.createElement('a')
  link.href = task.zipUrl
  link.download = `${task.title || 'images'}.zip`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const openTaskShare = (task) => {
  if (!task?.shareUrl) {
    notify.warning('该任务暂无分享入口')
    return
  }
  window.open(task.shareUrl, '_blank', 'noopener')
}
</script>

<style lang="scss" scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.panel-card-header {
  align-items: center;
  color: #24324a;
  display: flex;
  font-weight: 600;
  gap: 0.5rem;
  justify-content: space-between;
}

.header-stats {
  align-items: center;
  display: inline-flex;
  gap: 0.35rem;
}

.header-pill {
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.68rem;
  line-height: 1;
  padding: 0.16rem 0.45rem;
}

.header-pill.is-run {
  background: #eef6ff;
  border-color: #d5e6fd;
  color: #3f79f3;
}

.header-pill.is-batch {
  background: #f1f4ff;
  border-color: #dce3fb;
  color: #5d6ac8;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.task-card {
  background: linear-gradient(180deg, #ffffff 0%, #fdfefe 100%);
  border: 1px solid #e5ecf8;
  border-radius: 12px;
  padding: 0.72rem 0.8rem;
}

.task-card.is-batch {
  background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
}

.task-main-row {
  align-items: flex-start;
  display: flex;
  gap: 0.45rem;
  justify-content: space-between;
}

.task-title-wrap {
  flex: 1;
  min-width: 0;
}

.task-title-line {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.task-title {
  color: #253450;
  display: block;
  font-size: 0.88rem;
  font-weight: 700;
  max-width: 48ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-actions {
  align-items: center;
  display: inline-flex;
  gap: 0.22rem;
  padding-top: 0.04rem;
}

.type-tag {
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.68rem;
  line-height: 1;
  padding: 0.17rem 0.44rem;
}

.type-tag.is-run {
  background: #eef6ff;
  border-color: #d5e6fd;
  color: #3f79f3;
}

.type-tag.is-batch {
  background: #f1f4ff;
  border-color: #dce3fb;
  color: #5d6ac8;
}

.task-meta {
  color: #73819a;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.75rem;
  gap: 0.5rem;
  margin-top: 0.34rem;
}

.task-meta-message {
  max-width: 38ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-summary {
  border-top: 1px dashed #e8eef8;
  display: grid;
  gap: 0.35rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 0.48rem;
  padding-top: 0.45rem;
}

.summary-item {
  background: #f6f9ff;
  border: 1px solid #e6edfb;
  border-radius: 8px;
  color: #61708c;
  display: flex;
  font-size: 0.72rem;
  justify-content: space-between;
  padding: 0.32rem 0.44rem;
}

.summary-item strong {
  color: #2d3f5f;
  font-size: 0.76rem;
}

.batch-panel {
  margin-top: 0.45rem;
}

.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.batch-detail {
  border-top: 1px dashed #e4ebf8;
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
  margin-top: 0.5rem;
  padding-top: 0.45rem;
}

.batch-item {
  align-items: center;
  color: #6f7b93;
  display: grid;
  font-size: 0.75rem;
  gap: 0.45rem;
  grid-template-columns: minmax(0, 2fr) auto auto minmax(0, 2fr);

  span:first-child,
  span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

:deep(.app-btn.is-sm.is-circle) {
  border-radius: 8px;
  height: 26px;
  width: 26px;
}

@media (max-width: 900px) {
  .task-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .panel-card-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .task-meta-message {
    max-width: 100%;
  }
}
</style>
