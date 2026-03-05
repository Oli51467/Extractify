<template>
  <div class="image-gallery">
    <div class="gallery-header">
      <div class="gallery-actions">
        <div v-if="zipUrls.length > 0" class="zip-actions">
          <select v-model.number="selectedZipIndex" class="zip-select">
            <option :value="ALL_FILES_ZIP_INDEX">全部文件</option>
            <option v-for="(zip, index) in zipUrls" :key="zip.url || index" :value="index">
              {{ zip.name }} ({{ zip.count }}张)
            </option>
          </select>
          <AppButton
            tone="primary"
            variant="outline"
            size="sm"
            :disabled="selectedZipIndex === ALL_FILES_ZIP_INDEX"
            @click="downloadSelectedZip"
          >
            <template #icon>
              <AppIcon name="download" />
            </template>
            下载
          </AppButton>
        </div>

      </div>

      <div class="gallery-filter">
        <AppInput v-model="searchQuery" placeholder="按文件名 / 来源 / OCR 文字搜索..." clearable>
          <template #prefix>
            <AppIcon name="search" />
          </template>
        </AppInput>
      </div>
    </div>

    <div v-if="ocrStatus" class="ocr-status">
      <AppProgress v-if="ocrIndexing" :percentage="ocrProgress" />
      <p>{{ ocrStatus }}</p>
      <p v-if="!ocrIndexing && pendingOcrCount > 0" class="ocr-hint">
        还有 {{ pendingOcrCount }} 张图片未建立 OCR 索引，系统会自动补全。
      </p>
    </div>

    <div v-if="filteredImages.length > 0" class="gallery-grid">
      <div v-for="image in filteredImages" :key="image.id" class="image-card">
        <div class="image-container" @click="openPreview(image)" title="点击查看大图">
          <img :src="image.path" :alt="image.name" />
          <div class="image-overlay-actions">
            <AppButton
              tone="primary"
              variant="ghost"
              size="sm"
              shape="circle"
              @click.stop="downloadImage(image)"
              title="下载"
            >
              <template #icon>
                <AppIcon name="download" />
              </template>
            </AppButton>
            <AppButton
              v-if="canOpenSourceDocument(image)"
              tone="primary"
              variant="ghost"
              size="sm"
              shape="circle"
              @click.stop="openSourceDocument(image)"
              :title="getSourceButtonTitle(image)"
            >
              <template #icon>
                <AppIcon name="external" />
              </template>
            </AppButton>
          </div>
        </div>
        <div v-if="shouldShowImageName" class="image-info">
          <span class="image-name" :title="image.name">{{ image.name }}</span>
        </div>
      </div>
    </div>

    <div v-else class="no-images">
      <AppEmpty description="暂无匹配图片" />
    </div>

    <AppModal v-model="previewVisible" :title="selectedImage?.name || '图片预览'" width="min(1080px, 92vw)">
      <div v-if="selectedImage" class="preview-body">
        <img :src="selectedImage.path" :alt="selectedImage.name" />
      </div>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { notify } from '../services/notify'
import { updateProjectAssetOcr } from '../services/projectApi'
import AppButton from './ui/AppButton.vue'
import AppInput from './ui/AppInput.vue'
import AppIcon from './ui/AppIcon.vue'
import AppEmpty from './ui/AppEmpty.vue'
import AppProgress from './ui/AppProgress.vue'
import AppModal from './ui/AppModal.vue'

const props = defineProps({
  images: {
    type: Array,
    required: true
  },
  projectId: {
    type: String,
    default: ''
  },
  zipUrls: {
    type: Array,
    default: () => []
  }
})

const OCR_PRIMARY_LANG = 'chi_sim+eng'
const OCR_FALLBACK_LANG = 'eng'
const OCR_CACHE_PREFIX = 'extractify:ocr-index:v1'
const ALL_FILES_ZIP_INDEX = -1

const searchQuery = ref('')
const previewVisible = ref(false)
const selectedImage = ref(null)
const selectedZipIndex = ref(ALL_FILES_ZIP_INDEX)

const ocrIndexing = ref(false)
const ocrProgress = ref(0)
const ocrStatus = ref('')
const ocrIndex = ref({})

const activeOcrMeta = ref({
  current: 0,
  total: 1
})

let tesseractModule = null
let ocrWorker = null
let autoOcrRerunQueued = false

const resolveOcrCacheKey = () => `${OCR_CACHE_PREFIX}:${String(props.projectId || 'default')}`

const normalizeOcrIndex = (value) => {
  if (!value || typeof value !== 'object') return {}
  const normalized = {}

  for (const [key, text] of Object.entries(value)) {
    normalized[String(key)] = String(text || '')
  }

  return normalized
}

const readOcrCache = (cacheKey) => {
  if (typeof window === 'undefined' || !window.localStorage) return {}

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return {}
    return normalizeOcrIndex(JSON.parse(raw))
  } catch (error) {
    console.warn('读取 OCR 缓存失败:', error)
    return {}
  }
}

const writeOcrCache = (cacheKey, indexMap) => {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(normalizeOcrIndex(indexMap)))
  } catch (error) {
    console.warn('写入 OCR 缓存失败:', error)
  }
}

const getImageKey = (image) => {
  if (image?.id) return `asset:${image.id}`
  return `${image?.name || 'image'}::${image?.path || ''}`
}

const hasOcrIndex = (image) => Object.prototype.hasOwnProperty.call(ocrIndex.value, getImageKey(image))

const getIndexedText = (image) => ocrIndex.value[getImageKey(image)] || ''

const indexedImageCount = computed(() => props.images.filter((image) => hasOcrIndex(image)).length)

const pendingOcrCount = computed(() => Math.max(props.images.length - indexedImageCount.value, 0))

const activeZip = computed(() => {
  if (selectedZipIndex.value === ALL_FILES_ZIP_INDEX) return null
  return props.zipUrls[selectedZipIndex.value] || null
})

const shouldShowImageName = computed(() => selectedZipIndex.value === ALL_FILES_ZIP_INDEX)

const scopedImages = computed(() => {
  const selectedZip = activeZip.value
  if (!selectedZip) return props.images

  const targetRunId = String(selectedZip.runId || '').trim()
  const targetJobId = String(selectedZip.jobId || '').trim()
  if (!targetRunId && !targetJobId) return props.images

  return props.images.filter((image) => {
    const imageRunId = String(image?.runId || '').trim()
    const imageJobId = String(image?.jobId || '').trim()
    if (targetRunId && imageRunId === targetRunId) return true
    if (targetJobId && imageJobId === targetJobId) return true
    return false
  })
})

const filteredImages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return scopedImages.value

  return scopedImages.value.filter((image) => {
    const name = (image.name || '').toLowerCase()
    const source = (image.source || '').toLowerCase()
    const ocrText = getIndexedText(image).toLowerCase()

    return name.includes(query) || source.includes(query) || ocrText.includes(query)
  })
})

watch(
  () => resolveOcrCacheKey(),
  (cacheKey) => {
    ocrIndex.value = readOcrCache(cacheKey)
    ocrStatus.value = ''
    ocrProgress.value = 0
    autoOcrRerunQueued = false
  },
  { immediate: true }
)

watch(
  ocrIndex,
  (value) => {
    writeOcrCache(resolveOcrCacheKey(), value)
  },
  { deep: true }
)

watch(
  () => props.images.map((image) => getImageKey(image)),
  (keys) => {
    const keep = new Set(keys)
    const nextIndex = {}

    for (const [key, value] of Object.entries(ocrIndex.value)) {
      if (keep.has(key)) {
        nextIndex[key] = value
      }
    }

    // 优先复用后端自动 OCR 文本，前端可继续补全/重识别
    props.images.forEach((image) => {
      const key = getImageKey(image)
      const backendText = String(image?.ocrText || '').trim()
      const backendIndexed = Boolean(image?.ocrIndexed) || Boolean(backendText)
      if (!backendIndexed) return

      if (!Object.prototype.hasOwnProperty.call(nextIndex, key)) {
        nextIndex[key] = backendText
        return
      }

      if (backendText && !String(nextIndex[key] || '').trim()) {
        nextIndex[key] = backendText
      }
    })

    if (JSON.stringify(nextIndex) !== JSON.stringify(ocrIndex.value)) {
      ocrIndex.value = nextIndex
    }

    if (keys.length === 0) {
      ocrStatus.value = ''
      ocrProgress.value = 0
    }
  },
  { immediate: true }
)

watch(
  () => props.zipUrls.length,
  (length) => {
    if (length === 0) {
      selectedZipIndex.value = ALL_FILES_ZIP_INDEX
      return
    }

    if (selectedZipIndex.value > length - 1) {
      selectedZipIndex.value = ALL_FILES_ZIP_INDEX
    }
  },
  { immediate: true }
)

const handleWorkerLog = (message = {}) => {
  if (!ocrIndexing.value || typeof message.progress !== 'number') return

  const progress = Math.min(1, Math.max(0, message.progress))
  const { current, total } = activeOcrMeta.value
  const overallProgress = ((current + progress) / Math.max(total, 1)) * 100

  if (overallProgress > ocrProgress.value) {
    ocrProgress.value = Number(overallProgress.toFixed(1))
  }
}

const loadTesseractModule = async () => {
  if (tesseractModule) return tesseractModule

  const imported = await import('tesseract.js')
  tesseractModule = imported.default || imported
  return tesseractModule
}

const disposeWorker = async () => {
  if (!ocrWorker || typeof ocrWorker.terminate !== 'function') {
    ocrWorker = null
    return
  }

  try {
    await ocrWorker.terminate()
  } catch (error) {
    console.error('释放 OCR Worker 失败:', error)
  }

  ocrWorker = null
}

const initWorker = async () => {
  if (ocrWorker) return ocrWorker

  const moduleRef = await loadTesseractModule()
  const createWorker = moduleRef.createWorker

  if (typeof createWorker !== 'function') {
    throw new Error('OCR 引擎初始化失败')
  }

  try {
    ocrWorker = await createWorker(OCR_PRIMARY_LANG, 1, { logger: handleWorkerLog })
    return ocrWorker
  } catch (primaryError) {
    try {
      ocrWorker = await createWorker(OCR_FALLBACK_LANG, 1, { logger: handleWorkerLog })
      return ocrWorker
    } catch (fallbackError) {
      throw fallbackError || primaryError || new Error('OCR 引擎启动失败')
    }
  }
}

const syncAssetOcrToBackend = async (image, text, indexed = true) => {
  const projectId = String(props.projectId || '').trim()
  const assetId = String(image?.id || '').trim()
  if (!projectId || !assetId) return

  try {
    await updateProjectAssetOcr(projectId, assetId, {
      ocrText: String(text || ''),
      ocrIndexed: Boolean(indexed)
    })
  } catch (error) {
    console.warn('同步 OCR 到后端失败:', assetId, error)
  }
}

const buildOcrIndex = async () => {
  if (ocrIndexing.value) return
  if (!props.images.length) return

  const targets = props.images.filter((image) => !hasOcrIndex(image))
  if (!targets.length) return

  ocrIndexing.value = true
  ocrProgress.value = 0
  ocrStatus.value = '正在初始化 OCR 引擎...'

  try {
    const worker = await initWorker()

    let successCount = 0
    const total = targets.length

    for (let index = 0; index < total; index++) {
      const image = targets[index]
      activeOcrMeta.value = {
        current: index,
        total
      }
      ocrStatus.value = `正在识别 (${index + 1}/${total})：${image.name}`

      try {
        const result = await worker.recognize(image.path)
        const text = (result?.data?.text || '').replace(/\s+/g, ' ').trim()

        ocrIndex.value[getImageKey(image)] = text
        await syncAssetOcrToBackend(image, text, true)
        successCount += 1
      } catch (error) {
        console.error('OCR 识别失败:', image?.name, error)
        ocrIndex.value[getImageKey(image)] = ''
        await syncAssetOcrToBackend(image, '', true)
      }

      const stepProgress = ((index + 1) / total) * 100
      if (stepProgress > ocrProgress.value) {
        ocrProgress.value = Number(stepProgress.toFixed(1))
      }
    }

    ocrStatus.value = `OCR 索引完成：${successCount}/${total} 张已处理，可直接搜索图片文字`
  } catch (error) {
    console.error('OCR 建索引失败:', error)
    ocrStatus.value = `OCR 索引失败：${error.message || '请稍后重试'}`
    notify.error(ocrStatus.value)
  } finally {
    activeOcrMeta.value = { current: 0, total: 1 }
    ocrIndexing.value = false
  }
}

const requestAutoOcrIndex = () => {
  if (pendingOcrCount.value <= 0) {
    autoOcrRerunQueued = false
    return
  }

  if (ocrIndexing.value) {
    autoOcrRerunQueued = true
    return
  }

  void buildOcrIndex().finally(() => {
    if (!autoOcrRerunQueued) return
    autoOcrRerunQueued = false
    requestAutoOcrIndex()
  })
}

watch(
  () => props.images.map((image) => getImageKey(image)),
  () => {
    requestAutoOcrIndex()
  },
  { immediate: true }
)

const resolveSourcePage = (image) => {
  const pageValue = Number(image?.page)
  if (!Number.isFinite(pageValue) || pageValue <= 0) return null
  return Math.round(pageValue)
}

const canOpenSourceDocument = (image) => {
  const projectId = String(props.projectId || '').trim()
  const documentId = String(image?.documentId || '').trim()
  return Boolean(projectId && documentId)
}

const shouldAttachPageAnchor = (image) => {
  const sourceFileType = String(image?.sourceFileType || '').trim().toLowerCase()
  return !['.md', '.markdown', 'md', 'markdown'].includes(sourceFileType)
}

const buildSourcePreviewUrl = (image) => {
  if (!canOpenSourceDocument(image)) return ''

  const projectId = encodeURIComponent(String(props.projectId || '').trim())
  const documentId = encodeURIComponent(String(image?.documentId || '').trim())
  const timestamp = Date.now()
  let previewUrl = `/api/projects/${projectId}/documents/${documentId}/preview?t=${timestamp}`

  const page = resolveSourcePage(image)
  if (page && shouldAttachPageAnchor(image)) {
    previewUrl += `#page=${page}`
  }

  return previewUrl
}

const getSourceButtonTitle = (image) => {
  const page = resolveSourcePage(image)
  if (page) return `打开原文档第${page}页`
  return '打开原文档'
}

const openSourceDocument = (image) => {
  const previewUrl = buildSourcePreviewUrl(image)
  if (!previewUrl) {
    notify.warning('当前图片缺少源文档信息')
    return
  }

  const popup = window.open(previewUrl, '_blank', 'noopener')
  if (!popup) {
    notify.warning('浏览器拦截了新窗口，请允许弹窗后重试')
  }
}

const downloadImage = (image) => {
  const link = document.createElement('a')
  link.href = image.path
  link.download = image.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const downloadSelectedZip = () => {
  const zip = props.zipUrls[selectedZipIndex.value]
  if (!zip || !zip.url) {
    notify.warning('压缩包信息无效')
    return
  }

  downloadZip(zip.url, zip.fileName)
}

const downloadZip = (url, fileName = 'images.zip') => {
  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      return response.blob()
    })
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.style.display = 'none'
      link.href = blobUrl
      link.download = fileName || 'images.zip'
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(link)
    })
    .catch((error) => {
      console.error('下载失败:', error)
      notify.error(`下载失败: ${error.message}`)
    })
}

const openPreview = (image) => {
  selectedImage.value = image
  previewVisible.value = true
}

onBeforeUnmount(() => {
  disposeWorker().catch(() => {})
})
</script>

<style lang="scss" scoped>
.image-gallery {
  width: 100%;
}

.gallery-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.2rem;
}

.gallery-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.zip-actions {
  align-items: center;
  display: inline-flex;
  gap: 0.55rem;
}

.zip-select {
  background: #fff;
  border: 1px solid #d8e2f5;
  border-radius: 10px;
  color: #536282;
  font-size: 13px;
  min-height: 32px;
  padding: 0 10px;
}

.gallery-filter {
  max-width: 100%;
  width: 320px;
}

.ocr-status {
  margin-bottom: 1rem;
}

.ocr-status p {
  color: #606266;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.ocr-status .ocr-hint {
  color: #909399;
}

.gallery-grid {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: repeat(auto-fill, minmax(118px, 132px));
  justify-content: flex-start;
}

.image-card {
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
  border: 1px solid #e3eaf7;
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.image-card:hover {
  box-shadow: 0 18px 30px -26px rgba(35, 52, 86, 0.6);
  transform: translateY(-1px);
}

.image-container {
  align-items: center;
  background-color: #f4f7fc;
  cursor: zoom-in;
  display: flex;
  height: 88px;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.image-container img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}

.image-overlay-actions {
  align-items: center;
  background: linear-gradient(180deg, rgba(12, 18, 32, 0.52) 0%, rgba(12, 18, 32, 0.18) 100%);
  border-radius: 999px;
  display: flex;
  gap: 0.2rem;
  opacity: 0;
  padding: 0.16rem;
  pointer-events: none;
  position: absolute;
  right: 0.3rem;
  top: 0.3rem;
  transform: translateY(-2px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.image-card:hover .image-overlay-actions,
.image-card:focus-within .image-overlay-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

@media (hover: none), (pointer: coarse) {
  .image-overlay-actions {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}

.image-overlay-actions :deep(.app-btn) {
  min-width: 0;
}

.image-overlay-actions :deep(.app-btn.is-sm.is-circle) {
  border-radius: 999px;
  height: 24px;
  width: 24px;
}

.image-overlay-actions :deep(.app-btn.is-ghost) {
  --btn-bg: rgba(255, 255, 255, 0.9);
  --btn-bg-hover: #ffffff;
  --btn-bg-active: #f2f5ff;
  --btn-color: #365fbe;
  --btn-border: transparent;
  --btn-shadow: none;
  --btn-shadow-hover: none;
}

.image-info {
  padding: 0.33rem 0.42rem 0.4rem;
}

.image-name {
  color: #303133;
  display: block;
  font-size: 0.73rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-images {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.preview-body {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 220px;
  width: 100%;
}

.preview-body img {
  border-radius: 10px;
  box-shadow: 0 18px 36px -28px rgba(11, 18, 36, 0.78);
  max-height: 80vh;
  max-width: 100%;
  object-fit: contain;
}
</style>
