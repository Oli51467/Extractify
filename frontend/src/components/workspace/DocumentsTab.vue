<template>
  <div class="tab-panel">
    <AppCard class="upload-card">
      <template #header>
        <div class="panel-card-header">文档解析</div>
      </template>
      <FileUpload :project-id="projectId" @images-extracted="emit('single-extracted')" />
    </AppCard>

    <AppCard class="batch-card">
      <template #header>
        <div class="panel-card-header">批量处理中心</div>
      </template>
      <div class="batch-create">
        <label class="batch-file-label">
          <input
            :key="batchFileInputKey"
            type="file"
            multiple
            accept=".docx,.doc,.pdf"
            @change="handleBatchFileChange"
          />
          选择文档（可多选）
        </label>
        <div class="batch-config">
          <span>智能去重</span>
          <button
            class="small-switch"
            type="button"
            role="switch"
            :aria-checked="batchDedupeEnabled ? 'true' : 'false'"
            @click="emit('update:batchDedupeEnabled', !batchDedupeEnabled)"
          >
            <span class="small-switch-track">
              <span class="small-switch-thumb" />
            </span>
          </button>
        </div>
        <AppButton
          size="sm"
          :disabled="selectedBatchFileCount === 0 || batchSubmitting"
          :loading="batchSubmitting"
          @click="emit('create-batch')"
        >
          提交批量任务
        </AppButton>
      </div>
      <p v-if="selectedBatchFileCount > 0" class="batch-file-tip">
        已选择 {{ selectedBatchFileCount }} 个文件
      </p>
    </AppCard>

    <AppCard class="list-card">
      <template #header>
        <div class="panel-card-header">项目文档（{{ projectDocuments.length }}）</div>
      </template>
      <div v-if="projectDocuments.length > 0" class="simple-list">
        <div v-for="doc in projectDocuments" :key="doc.id" class="simple-item">
          <div class="simple-item-title">{{ doc.sourceName }}</div>
          <div class="simple-item-meta">
            <span>{{ doc.fileType || '-' }}</span>
            <span>{{ formatSize(doc.fileSize) }}</span>
            <span>{{ formatDate(doc.createdAt) }}</span>
          </div>
        </div>
      </div>
      <AppEmpty v-else description="该项目暂无文档" />
    </AppCard>
  </div>
</template>

<script setup>
import FileUpload from '../FileUpload.vue'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import { formatDate, formatSize } from '../../utils/formatters'

defineProps({
  projectId: {
    type: String,
    required: true
  },
  projectDocuments: {
    type: Array,
    default: () => []
  },
  selectedBatchFileCount: {
    type: Number,
    default: 0
  },
  batchDedupeEnabled: {
    type: Boolean,
    default: true
  },
  batchSubmitting: {
    type: Boolean,
    default: false
  },
  batchFileInputKey: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['single-extracted', 'batch-files-change', 'create-batch', 'update:batchDedupeEnabled'])

const handleBatchFileChange = (event) => {
  const files = Array.from(event.target?.files || [])
  emit('batch-files-change', files)
}
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

.batch-create {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.batch-file-label {
  border: 1px dashed #cad7f1;
  background: #f7faff;
  color: #4f5d7a;
  border-radius: 8px;
  padding: 0.36rem 0.7rem;
  font-size: 0.82rem;
  cursor: pointer;

  input {
    display: none;
  }
}

.batch-config {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #6f7b93;
  font-size: 0.8rem;
}

.small-switch {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.small-switch-track {
  display: inline-block;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: #c8d2e2;
  border: 1px solid #bcc7d9;
  position: relative;
}

.small-switch-thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #fff;
  top: 1.5px;
  left: 1.5px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 5px rgba(48, 62, 92, 0.2);
}

.small-switch[aria-checked='true'] .small-switch-track {
  background: #48b38d;
  border-color: #3ea780;
}

.small-switch[aria-checked='true'] .small-switch-thumb {
  left: calc(100% - 13.5px);
}

.batch-file-tip {
  margin: 0.6rem 0 0;
  color: #7f8ba1;
  font-size: 0.79rem;
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
