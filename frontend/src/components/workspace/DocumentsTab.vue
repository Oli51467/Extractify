<template>
  <div class="tab-panel">
    <AppCard class="upload-card">
      <FileUpload :project-id="projectId" @images-extracted="emit('upload-finished')" />
    </AppCard>

    <AppCard class="list-card">
      <template #header>
        <div class="panel-card-header">项目文档（{{ projectDocuments.length }}）</div>
      </template>
      <div v-if="projectDocuments.length > 0" class="simple-list">
        <div v-for="doc in projectDocuments" :key="doc.id" class="simple-item">
          <button
            type="button"
            class="simple-item-main"
            :title="`点击在线查看：${doc.sourceName || '未命名文档'}`"
            @click="openDocPreview(doc)"
          >
            <div class="simple-item-title">
              <span>{{ doc.sourceName }}</span>
              <span class="simple-item-type-tag" :class="resolveFileTypeClass(doc.fileType)">
                {{ resolveFileTypeLabel(doc.fileType) }}
              </span>
            </div>
            <div class="simple-item-meta">
              <span>{{ formatSize(doc.fileSize) }}</span>
              <span>{{ formatDate(doc.createdAt) }}</span>
            </div>
          </button>
          <div class="simple-item-actions">
            <AppButton
              size="sm"
              variant="ghost"
              tone="danger"
              @click="emit('delete-document', doc)"
            >
              删除文档
            </AppButton>
          </div>
        </div>
      </div>
      <AppEmpty v-else description="该项目暂无文档" />
    </AppCard>
  </div>
</template>

<script setup>
import FileUpload from '../FileUpload.vue'
import AppCard from '../ui/AppCard.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import AppButton from '../ui/AppButton.vue'
import { formatDate, formatSize } from '../../utils/formatters'
import { notify } from '../../services/notify'

const props = defineProps({
  projectId: {
    type: String,
    required: true
  },
  projectDocuments: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['upload-finished', 'delete-document'])

const normalizeFileExt = (value) => String(value || '').trim().toLowerCase()

const resolveFileTypeLabel = (fileType) => {
  const ext = normalizeFileExt(fileType)
  if (ext === '.pdf' || ext === 'pdf') return 'PDF'
  if (ext === '.md' || ext === '.markdown' || ext === 'md' || ext === 'markdown') return 'MD'
  if (ext === '.ppt' || ext === '.pptx' || ext === 'ppt' || ext === 'pptx') return 'PPT'
  if (ext === '.doc' || ext === '.docx' || ext === 'doc' || ext === 'docx') return 'Word'
  return 'File'
}

const resolveFileTypeClass = (fileType) => {
  const ext = normalizeFileExt(fileType)
  if (ext === '.pdf' || ext === 'pdf') return 'is-pdf'
  if (ext === '.md' || ext === '.markdown' || ext === 'md' || ext === 'markdown') return 'is-md'
  if (ext === '.ppt' || ext === '.pptx' || ext === 'ppt' || ext === 'pptx') return 'is-ppt'
  if (ext === '.doc' || ext === '.docx' || ext === 'doc' || ext === 'docx') return 'is-word'
  return 'is-file'
}

const openDocPreview = (doc) => {
  if (!doc?.id) return
  const baseUrl = doc.previewUrl || `/api/projects/${encodeURIComponent(props.projectId)}/documents/${encodeURIComponent(doc.id)}/preview`
  const cacheKey = encodeURIComponent(String(doc.updatedAt || doc.createdAt || Date.now()))
  const previewUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${cacheKey}`
  const opened = window.open(previewUrl, '_blank', 'noopener')
  if (!opened) {
    notify.warning('新窗口被浏览器拦截，请允许弹窗后重试')
  }
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
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.simple-item:hover {
  border-color: #d5e3fb;
  box-shadow: 0 16px 24px -24px rgba(42, 66, 116, 0.72);
  transform: translateY(-1px);
}

.simple-item-main {
  appearance: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  display: block;
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 0;
}

.simple-item-main:focus-visible {
  outline: 2px solid rgba(79, 140, 255, 0.44);
  outline-offset: 2px;
}

.simple-item-title {
  color: #24324a;
  font-size: 0.87rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.simple-item-type-tag {
  border: 1px solid #e8edf6;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.16rem 0.4rem;
}

.simple-item-type-tag.is-pdf {
  background: #fff1f1;
  border-color: #f8d8d8;
  color: #d14a4a;
}

.simple-item-type-tag.is-word {
  background: #edf4ff;
  border-color: #d8e6ff;
  color: #3f79f3;
}

.simple-item-type-tag.is-ppt {
  background: #fff4eb;
  border-color: #ffe1c8;
  color: #e5852c;
}

.simple-item-type-tag.is-md {
  background: #eff9ef;
  border-color: #d4edd4;
  color: #2f8c4c;
}

.simple-item-type-tag.is-file {
  background: #f2f5fa;
  border-color: #e1e8f4;
  color: #60708f;
}

.simple-item-meta {
  margin-top: 0.2rem;
  color: #7f8ba1;
  font-size: 0.76rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.simple-item-actions {
  display: flex;
  flex-shrink: 0;
}
</style>
