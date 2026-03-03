<template>
  <div class="file-upload">
    <el-upload
      ref="uploadRef"
      class="upload-area"
      drag
      action="/api/documents/extract-images"
      :data="uploadData"
      :headers="uploadHeaders"
      :on-success="handleSuccess"
      :on-error="handleError"
      :on-progress="handleProgress"
      :before-upload="beforeUpload"
      :show-file-list="true"
      :limit="1"
      accept=".docx,.doc,.pdf"
      :auto-upload="true"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽文档到此处或 <em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip">支持 .docx、.doc 格式的 Word 文档和 .pdf 格式的 PDF 文件</div>
      </template>
    </el-upload>

    <div class="upload-options">
      <div class="upload-option-text">智能去重</div>
      <button
        class="dedupe-toggle-switch"
        type="button"
        role="switch"
        :aria-checked="dedupeEnabled ? 'true' : 'false'"
        :disabled="isUploading"
        @click="toggleDedupeEnabled"
      >
        <span class="switch-track">
          <span class="switch-thumb" />
        </span>
      </button>
    </div>

    <div v-if="isUploading" class="upload-progress">
      <el-progress :percentage="formattedProgress" :stroke-width="8" />
      <p>{{ getProgressText() }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['images-extracted'])

const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadTransportProgress = ref(0)
const backendProgress = ref(0)
const backendMessage = ref('')
const uploadRef = ref(null)
const currentFileName = ref('')
const fileType = ref('')
const currentJobId = ref('')
const dedupeEnabled = ref(true)
let progressPollTimer = null
const sessionReady = ref(false)

const generateJobId = () => `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const stopProgressPolling = () => {
  if (progressPollTimer) {
    clearInterval(progressPollTimer)
    progressPollTimer = null
  }
}

const updateDisplayProgress = () => {
  if (!isUploading.value) return

  const transportWeight = Math.min(uploadTransportProgress.value, 100) * 0.45
  const backendWeight = backendProgress.value > 0
    ? 45 + Math.min(backendProgress.value, 100) * 0.5
    : 0

  const nextProgress = Math.min(99, Math.max(5, transportWeight, backendWeight))
  if (nextProgress > uploadProgress.value) {
    uploadProgress.value = nextProgress
  }
}

const fetchJobProgress = async () => {
  if (!currentJobId.value) return

  try {
    const response = await fetch(`/api/documents/jobs/${encodeURIComponent(currentJobId.value)}`)
    if (!response.ok) return

    const data = await response.json()
    if (!data.success || !data.job) return

    backendProgress.value = Number(data.job.progress || 0)
    backendMessage.value = data.job.message || backendMessage.value

    if (data.job.status === 'failed' && data.job.message) {
      ElMessage.error(data.job.message)
      stopProgressPolling()
    }

    updateDisplayProgress()
  } catch (error) {
    // 进度接口短暂失败不影响主流程
  }
}

const startProgressPolling = () => {
  stopProgressPolling()
  fetchJobProgress()
  progressPollTimer = setInterval(fetchJobProgress, 800)
}

const getProgressText = () => {
  if (backendMessage.value) return backendMessage.value
  if (uploadTransportProgress.value < 100) return '正在上传文件...'
  return fileType.value === 'pdf' ? '正在处理 PDF...' : '正在处理 Word 文档...'
}

const uploadHeaders = computed(() => ({
  'X-Requested-With': 'XMLHttpRequest',
  'X-Job-Id': currentJobId.value || ''
}))

const uploadData = computed(() => ({
  dedupe: dedupeEnabled.value ? '1' : '0'
}))

const toggleDedupeEnabled = () => {
  if (isUploading.value) return
  dedupeEnabled.value = !dedupeEnabled.value
}

const ensureSessionReady = async () => {
  if (sessionReady.value) return true

  const response = await fetch('/api/session')
  if (!response.ok) {
    throw new Error('初始化会话失败')
  }

  sessionReady.value = true
  return true
}

const beforeUpload = async (file) => {
  const dotIndex = file.name.lastIndexOf('.')
  const ext = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : ''

  const isWordDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  const isPdfDoc = file.type === 'application/pdf' || ext === '.pdf'

  if (!isWordDoc && !isPdfDoc) {
    ElMessage.error('只能上传 Word 文档或 PDF 文件!')
    return false
  }

  fileType.value = isPdfDoc ? 'pdf' : 'word'

  const isLt50M = file.size / 1024 / 1024 < 50
  if (!isLt50M) {
    ElMessage.error('文件大小不能超过50MB!')
    return false
  }

  currentFileName.value = file.name.replace(/\.[^/.]+$/, '')

  try {
    await ensureSessionReady()
  } catch (error) {
    ElMessage.error(error.message || '会话初始化失败，请重试')
    return false
  }

  currentJobId.value = generateJobId()
  isUploading.value = true
  uploadProgress.value = 5
  uploadTransportProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = '正在上传文件...'

  startProgressPolling()
  return true
}

const handleProgress = (event) => {
  if (!event.percent) return

  uploadTransportProgress.value = Math.max(uploadTransportProgress.value, Math.floor(event.percent))
  backendMessage.value = uploadTransportProgress.value >= 100
    ? '上传完成，等待后端处理...'
    : '正在上传文件...'
  updateDisplayProgress()
}

const handleSuccess = (response) => {
  stopProgressPolling()

  isUploading.value = false
  uploadProgress.value = 100
  backendProgress.value = 100
  backendMessage.value = response.message || '处理完成'

  if (response.success) {
    const dedupedCount = Number(response?.dedupe?.dedupedCount || 0)
    const successMessage = dedupedCount > 0
      ? `成功提取 ${response.images.length} 张图片，已去重 ${dedupedCount} 张`
      : `成功提取 ${response.images.length} 张图片`
    ElMessage.success(successMessage)

    emit('images-extracted', {
      images: response.images,
      zipUrl: response.zipUrl,
      source: currentFileName.value,
      jobId: response.jobId || currentJobId.value,
      dedupe: response.dedupe || null
    })

    if (uploadRef.value) {
      uploadRef.value.clearFiles()
    }
  } else {
    ElMessage.error(response.message || '图片提取失败')
  }

  currentJobId.value = ''
}

const handleError = (error) => {
  stopProgressPolling()

  isUploading.value = false
  uploadProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = ''
  currentJobId.value = ''

  console.error('上传错误:', error)
  ElMessage.error('上传失败，请重试')
}

onUnmounted(() => {
  stopProgressPolling()
})

const formattedProgress = computed(() => Number(uploadProgress.value.toFixed(1)))
</script>

<style lang="scss" scoped>
.file-upload {
  width: 100%;
}

.upload-area {
  width: 100%;

  :deep(.el-upload) {
    width: 100%;
  }

  :deep(.el-upload-dragger) {
    width: 100%;
    height: 220px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
}

.el-icon--upload {
  font-size: 48px;
  color: var(--primary-color);
  margin-bottom: 16px;
}

.upload-options {
  margin-top: 0.75rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid #e6ebf5;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  max-width: 100%;
}

.upload-option-text {
  color: #6c7890;
  font-size: 0.78rem;
  line-height: 1.2;
}

.dedupe-toggle-switch {
  background: none;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  padding: 0;
}

.dedupe-toggle-switch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.dedupe-toggle-switch .switch-track {
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: #c8d2e2;
  border: 1px solid #bcc7d9;
  position: relative;
  transition: all 0.2s ease;
}

.dedupe-toggle-switch .switch-thumb {
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: #fff;
  position: absolute;
  top: 1.5px;
  left: 1.5px;
  box-shadow: 0 2px 6px rgba(48, 62, 92, 0.22);
  transition: all 0.2s ease;
}

.dedupe-toggle-switch[aria-checked='true'] .switch-track {
  background: #48b38d;
  border-color: #3ea780;
}

.dedupe-toggle-switch[aria-checked='true'] .switch-thumb {
  left: calc(100% - 14.5px);
}

@media (max-width: 640px) {
  .upload-options {
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
  }
}

.upload-progress {
  margin-top: 1.5rem;

  p {
    margin-top: 0.5rem;
    text-align: center;
    color: var(--text-secondary);
  }
}
</style>
