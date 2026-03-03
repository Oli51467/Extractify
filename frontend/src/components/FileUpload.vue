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
        multiple
        accept=".docx,.doc,.pdf"
        :disabled="disabled || isUploading"
        @change="handleFileInput"
      />
      <AppIcon name="upload" class="upload-icon" />
      <p class="upload-title">拖拽文档到此处或点击上传（单文件 / 批量）</p>
      <p class="upload-tip">支持 .docx、.doc 和 .pdf 文件，单个文件不超过 50MB；智能去重默认开启</p>
      <p v-if="selectedFileLabel" class="upload-file">已选择：{{ selectedFileLabel }}</p>
    </div>

    <div v-if="isUploading" class="upload-progress">
      <AppProgress :percentage="formattedProgress" />
      <p>{{ getProgressText() }}</p>
    </div>

    <div v-if="oneClickResult" class="one-click-result">
      <div class="result-title">一键结果已生成</div>
      <div class="result-meta">
        <span>抽图 {{ oneClickResult.imageCount }} 张</span>
        <span>去重 {{ oneClickResult.dedupedCount }} 张</span>
        <span>OCR 命中 {{ oneClickResult.ocrIndexedCount }} 张</span>
      </div>
      <div class="result-actions">
        <AppButton size="sm" variant="outline" tone="neutral" @click="copyShareLink">
          复制分享链接
        </AppButton>
        <AppButton size="sm" :disabled="!oneClickResult.shareUrl" @click="openShareLink">
          打开分享页
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { notify } from '../services/notify'
import AppIcon from './ui/AppIcon.vue'
import AppProgress from './ui/AppProgress.vue'
import AppButton from './ui/AppButton.vue'

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
const uploadMode = ref('single')
const currentJobId = ref('')
const selectedFiles = ref([])
const dragActive = ref(false)
const sessionReady = ref(false)
const oneClickResult = ref(null)
const fileInputRef = ref(null)
let progressPollTimer = null

const generateJobId = () => `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const uploadAction = computed(() => {
  if (props.projectId) {
    return `/api/projects/${encodeURIComponent(props.projectId)}/documents/extract-images`
  }
  return '/api/documents/extract-images'
})

const selectedFileLabel = computed(() => {
  if (!selectedFiles.value.length) return ''
  if (selectedFiles.value.length === 1) return selectedFiles.value[0]
  return `${selectedFiles.value.length} 个文件`
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
  if (uploadMode.value === 'batch') return backendMessage.value || '正在创建批量任务...'
  if (backendMessage.value) return backendMessage.value
  if (uploadTransportProgress.value < 100) return '正在上传文件...'
  return fileType.value === 'pdf' ? '正在处理 PDF...' : '正在处理 Word 文档...'
}

const toAbsoluteUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`
  return `${window.location.origin}/${raw}`
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

const normalizeValidFiles = (files) => {
  const source = Array.from(files || [])
  const validFiles = []
  let hasInvalid = false

  source.forEach((file) => {
    const validation = validateFile(file)
    if (!validation.valid) {
      hasInvalid = true
      return
    }
    validFiles.push({
      file,
      type: validation.type
    })
  })

  if (hasInvalid && validFiles.length > 0) {
    notify.warning('部分文件不符合要求，已自动忽略')
  }

  return validFiles
}

const resetInputValue = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const handleUploadResponse = (response) => {
  stopProgressPolling()

  isUploading.value = false
  uploadMode.value = 'single'
  uploadProgress.value = 100
  backendProgress.value = 100
  backendMessage.value = response.message || '处理完成'

  if (response.success) {
    const dedupedCount = Number(response?.dedupe?.dedupedCount || 0)
    const ocrIndexedCount = Number(response?.ocr?.indexedCount || 0)
    const shareUrl = toAbsoluteUrl(response?.share?.url || '')
    const shareDownloadUrl = toAbsoluteUrl(response?.share?.downloadUrl || '')

    oneClickResult.value = {
      imageCount: Number(response?.images?.length || 0),
      dedupedCount,
      ocrIndexedCount,
      shareUrl,
      shareDownloadUrl
    }

    const successMessage = dedupedCount > 0
      ? `成功提取 ${response.images.length} 张图片，已去重 ${dedupedCount} 张`
      : `成功提取 ${response.images.length} 张图片`
    notify.success(successMessage)

    emit('images-extracted', {
      images: response.images,
      zipUrl: response.zipUrl,
      source: currentFileName.value,
      jobId: response.jobId || currentJobId.value,
      dedupe: response.dedupe || null,
      naming: response.naming || null,
      ocr: response.ocr || null,
      share: response.share || null
    })
  } else {
    notify.error(response.message || '图片提取失败')
  }

  currentJobId.value = ''
  selectedFiles.value = []
  resetInputValue()
}

const handleUploadError = (error) => {
  stopProgressPolling()

  isUploading.value = false
  uploadMode.value = 'single'
  uploadProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = ''
  currentJobId.value = ''
  selectedFiles.value = []
  oneClickResult.value = null

  console.error('上传错误:', error)
  notify.error(error?.message || '上传失败，请重试')
  resetInputValue()
}

const submitSingleFile = async (file, type) => {
  fileType.value = type
  uploadMode.value = 'single'
  currentFileName.value = file.name.replace(/\.[^/.]+$/, '')
  selectedFiles.value = [file.name]

  try {
    await ensureSessionReady()
  } catch (error) {
    notify.error(error.message || '会话初始化失败，请重试')
    return
  }

  currentJobId.value = generateJobId()
  oneClickResult.value = null
  isUploading.value = true
  uploadProgress.value = 5
  uploadTransportProgress.value = 0
  backendProgress.value = 0
  backendMessage.value = '正在上传文件...'

  startProgressPolling()

  const formData = new FormData()
  formData.append('file', file)
  formData.append('dedupe', '1')
  formData.append('ocr', '1')
  formData.append('autoNaming', '1')
  formData.append('share', '1')

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

const submitBatchFiles = async (fileEntries) => {
  if (!props.projectId) {
    notify.warning('当前入口仅支持单文件解析，已自动处理第一个文件')
    const first = fileEntries[0]
    if (first) {
      await submitSingleFile(first.file, first.type)
    }
    return
  }

  uploadMode.value = 'batch'
  selectedFiles.value = fileEntries.map((item) => item.file.name)
  oneClickResult.value = null
  isUploading.value = true
  uploadProgress.value = 10
  uploadTransportProgress.value = 100
  backendProgress.value = 10
  backendMessage.value = '正在创建批量任务...'

  try {
    await ensureSessionReady()
    const formData = new FormData()
    fileEntries.forEach((item) => {
      formData.append('files', item.file)
    })
    formData.append('dedupe', '1')
    formData.append('name', `批处理 ${new Date().toLocaleString()}`)

    const response = await fetch(`/api/projects/${encodeURIComponent(props.projectId)}/batches/extract-images`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `请求失败 (${response.status})`)
    }

    backendProgress.value = 100
    uploadProgress.value = 100
    backendMessage.value = '批量任务创建成功'
    isUploading.value = false

    notify.success(`批量任务已提交，共 ${fileEntries.length} 个文件`)
    emit('images-extracted', {
      mode: 'batch',
      batch: data.batch || null,
      items: data.items || []
    })
  } catch (error) {
    handleUploadError(error)
    return
  }

  selectedFiles.value = []
  resetInputValue()
  uploadMode.value = 'single'
}

const submitFiles = async (files) => {
  const validEntries = normalizeValidFiles(files)
  if (!validEntries.length) {
    selectedFiles.value = []
    resetInputValue()
    return
  }

  if (validEntries.length === 1) {
    await submitSingleFile(validEntries[0].file, validEntries[0].type)
    return
  }

  await submitBatchFiles(validEntries)
}

const openPicker = () => {
  if (props.disabled || isUploading.value) return
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileInput = (event) => {
  const files = Array.from(event.target?.files || [])
  if (files.length > 0) {
    submitFiles(files)
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

  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    submitFiles(files)
  }
}

const copyShareLink = async () => {
  const url = oneClickResult.value?.shareUrl || ''
  if (!url) {
    notify.warning('暂无可复制的分享链接')
    return
  }

  try {
    await navigator.clipboard.writeText(url)
    notify.success('分享链接已复制')
  } catch (error) {
    notify.warning('复制失败，请手动复制链接')
  }
}

const openShareLink = () => {
  const url = oneClickResult.value?.shareUrl || ''
  if (!url) {
    notify.warning('分享链接不可用')
    return
  }
  window.open(url, '_blank', 'noopener')
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

.upload-progress {
  margin-top: 1rem;
}

.upload-progress p {
  color: var(--text-secondary);
  margin-top: 0.5rem;
  text-align: center;
}

.one-click-result {
  background: linear-gradient(180deg, #ffffff 0%, #f6faff 100%);
  border: 1px solid #dfe9fb;
  border-radius: 12px;
  margin-top: 0.95rem;
  padding: 0.72rem 0.82rem;
}

.result-title {
  color: #2a3a57;
  font-size: 0.85rem;
  font-weight: 700;
}

.result-meta {
  color: #667794;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.77rem;
  gap: 0.55rem;
  margin-top: 0.3rem;
}

.result-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.55rem;
}

@media (max-width: 640px) {
  .result-actions {
    flex-wrap: wrap;
  }
}
</style>
