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
        <button
          v-for="doc in projectDocuments"
          :key="doc.id"
          type="button"
          class="simple-item"
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
      </div>
      <AppEmpty v-else description="该项目暂无文档" />
    </AppCard>
  </div>
</template>

<script setup>
import FileUpload from '../FileUpload.vue'
import AppCard from '../ui/AppCard.vue'
import AppEmpty from '../ui/AppEmpty.vue'
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

const emit = defineEmits(['upload-finished'])

const normalizeFileExt = (value) => String(value || '').trim().toLowerCase()

const resolveFileTypeLabel = (fileType) => {
  const ext = normalizeFileExt(fileType)
  if (ext === '.pdf' || ext === 'pdf') return 'PDF'
  if (ext === '.doc' || ext === '.docx' || ext === 'doc' || ext === 'docx') return 'Word'
  return 'File'
}

const resolveFileTypeClass = (fileType) => {
  const ext = normalizeFileExt(fileType)
  if (ext === '.pdf' || ext === 'pdf') return 'is-pdf'
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
  appearance: none;
  border: 1px solid #e8edf6;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  display: block;
  text-align: left;
  width: 100%;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  padding: 0.58rem 0.72rem;
}

.simple-item:hover {
  border-color: #d5e3fb;
  box-shadow: 0 16px 24px -24px rgba(42, 66, 116, 0.72);
  transform: translateY(-1px);
}

.simple-item:focus-visible {
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
</style>
