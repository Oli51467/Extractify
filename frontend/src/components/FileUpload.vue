<template>
  <div class="file-upload">
    <div
      class="upload-area"
      :class="{ 'is-active': dragActive, 'is-disabled': disabled || isUploading }"
      @click="openPicker"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".docx,.doc,.pdf"
        :disabled="disabled || isUploading"
        @change="handleFileInput"
      />
      <AppIcon name="upload" class="upload-icon" />
      <p class="upload-title">拖拽文档到此处或点击上传</p>
      <p class="upload-tip">支持 .docx、.doc 和 .pdf 文件，单个文件不超过 50MB</p>
      <p v-if="selectedFileName" class="upload-file">已选择：{{ selectedFileName }}</p>
    </div>

    <div class="upload-options">
      <div class="upload-option-text">智能去重</div>
      <button
        class="dedupe-toggle-switch"
        type="button"
        role="switch"
        :aria-checked="dedupeEnabled ? 'true' : 'false'"
        :disabled="isUploading || disabled"
        @click="toggleDedupeEnabled"
      >
        <span class="switch-track">
          <span class="switch-thumb" />
        </span>
      </button>
    </div>

    <div v-if="isUploading" class="upload-progress">
      <AppProgress :percentage="formattedProgress" />
      <p>{{ getProgressText() }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { notify } from '../services/notify'
import AppIcon from './ui/AppIcon.vue'
import AppProgress from './ui/AppProgress.vue'

const props = defineProps({
  projectId: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['images-extracted'])

const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadTransportProgress = ref(0)
const backendProgress = ref(0)
const backendMessage = ref('')
const currentFileName = ref('')
const fileType = ref('')
const currentJobId = ref('')
const selectedFileName = ref('')
const dedupeEnabled = ref(true)
const dragActive = ref(false)
const sessionReady = ref(false)
const fileInputRef = ref(null)
let progressPollTimer = null

const generateJobId = () => `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const uploadAction = computed(() => {
  if (props.projectId) {
    return `/api/projects/${encodeURIComponent(props.projectId)}/documents/extract-images`
  }
  return '/api/documents/extract-images'
})

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
      notify.error(data.job.message)
      stopProgressPolling()
    }

    updateDisplayProgress()
  } catch (error) {
    // ignore poll failures
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

const toggleDedupeEnabled = () => {
  if (isUploading.value || props.disabled) return
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

const validateFile = (file) => {
  if (!file) return { valid: false }

  const dotIndex = file.name.lastIndexOf('.')
  const ext = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : ''

  const isWordDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  const isPdfDoc = file.type === 'application/pdf' || ext === '.pdf'

  if (!isWordDoc && !isPdfDoc) {
    notify.error('只能上传 Word 文档或 PDF 文件')
    return { valid: false }
  }

  const isLt50M = file.size / 1024 / 1024 < 50
  if (!isLt50M) {
    notify.error('文件大小不能超过 50MB')
    return { valid: false }
  }

  return {
    valid: true,
    type: isPdfDoc ? 'pdf' : 'word'
  }
}

const resetInputValue = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const handleUploadResponse = (response) => {
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
    notify.success(successMessage)

    emit('images-extracted', {
      images: response.images,
      zipUrl: response.zipUrl,
      source: currentFileName.value,
      jobId: response.jobId || currentJobId.value,
      dedupe: response.dedupe || null
    })
  } else {
    notify.error(response.message || '图片提取失败')
  }

  currentJobId.value = ''
  selectedFileName.value = ''
  resetInputValue()
}

const handleUploadError = (error) => {
  stopProgressPolling()

  isUploading.value = false
  uploadProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = ''
  currentJobId.value = ''

  console.error('上传错误:', error)
  notify.error(error?.message || '上传失败，请重试')
}

const submitFile = async (file) => {
  const validation = validateFile(file)
  if (!validation.valid) {
    resetInputValue()
    selectedFileName.value = ''
    return
  }

  fileType.value = validation.type
  currentFileName.value = file.name.replace(/\.[^/.]+$/, '')
  selectedFileName.value = file.name

  try {
    await ensureSessionReady()
  } catch (error) {
    notify.error(error.message || '会话初始化失败，请重试')
    return
  }

  currentJobId.value = generateJobId()
  isUploading.value = true
  uploadProgress.value = 5
  uploadTransportProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = '正在上传文件...'

  startProgressPolling()

  const formData = new FormData()
  formData.append('file', file)
  formData.append('dedupe', dedupeEnabled.value ? '1' : '0')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', uploadAction.value, true)
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
  xhr.setRequestHeader('X-Job-Id', currentJobId.value)

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return

    uploadTransportProgress.value = Math.max(
      uploadTransportProgress.value,
      Math.floor((event.loaded / event.total) * 100)
    )

    backendMessage.value = uploadTransportProgress.value >= 100
      ? '上传完成，等待后端处理...'
      : '正在上传文件...'

    updateDisplayProgress()
  }

  xhr.onerror = () => {
    handleUploadError(new Error('网络异常'))
  }

  xhr.onload = () => {
    let response = {}
    try {
      response = JSON.parse(xhr.responseText || '{}')
    } catch (error) {
      handleUploadError(new Error('服务响应异常'))
      return
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      handleUploadResponse(response)
      return
    }

    handleUploadError(new Error(response.message || `请求失败 (${xhr.status})`))
  }

  xhr.send(formData)
}

const openPicker = () => {
  if (props.disabled || isUploading.value) return
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileInput = (event) => {
  const file = event.target?.files?.[0]
  if (file) {
    submitFile(file)
  }
}

const handleDragOver = () => {
  if (props.disabled || isUploading.value) return
  dragActive.value = true
}

const handleDragLeave = () => {
  dragActive.value = false
}

const handleDrop = (event) => {
  dragActive.value = false
  if (props.disabled || isUploading.value) return

  const file = event.dataTransfer?.files?.[0]
  if (file) {
    submitFile(file)
  }
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
  align-items: center;
  background: linear-gradient(180deg, #fbfdff 0%, #f4f8ff 100%);
  border: 1.5px dashed #c9d6ef;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  justify-content: center;
  min-height: 220px;
  padding: 1.2rem;
  text-align: center;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.upload-area:hover,
.upload-area.is-active {
  border-color: #7fa3ef;
  box-shadow: 0 20px 34px -30px rgba(34, 58, 102, 0.62);
  transform: translateY(-1px);
}

.upload-area.is-disabled {
  cursor: not-allowed;
  opacity: 0.64;
  transform: none;
}

.upload-area input {
  display: none;
}

.upload-icon {
  color: #4f8cff;
  font-size: 44px;
}

.upload-title {
  color: #2d3b56;
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.upload-tip {
  color: #8a96ac;
  font-size: 0.78rem;
  margin: 0;
}

.upload-file {
  color: #5f6f8c;
  font-size: 0.8rem;
  margin: 0.2rem 0 0;
}

.upload-options {
  align-items: center;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #e6ebf5;
  border-radius: 999px;
  display: inline-flex;
  gap: 0.5rem;
  justify-content: flex-start;
  margin-top: 0.75rem;
  max-width: 100%;
  padding: 0.4rem 0.6rem;
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
  background: #c8d2e2;
  border: 1px solid #bcc7d9;
  border-radius: 999px;
  height: 18px;
  position: relative;
  transition: all 0.2s ease;
  width: 32px;
}

.dedupe-toggle-switch .switch-thumb {
  background: #fff;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(48, 62, 92, 0.22);
  height: 13px;
  left: 1.5px;
  position: absolute;
  top: 1.5px;
  transition: all 0.2s ease;
  width: 13px;
}

.dedupe-toggle-switch[aria-checked='true'] .switch-track {
  background: #48b38d;
  border-color: #3ea780;
}

.dedupe-toggle-switch[aria-checked='true'] .switch-thumb {
  left: calc(100% - 14.5px);
}

.upload-progress {
  margin-top: 1rem;
}

.upload-progress p {
  color: var(--text-secondary);
  margin-top: 0.5rem;
  text-align: center;
}

@media (max-width: 640px) {
  .upload-options {
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
