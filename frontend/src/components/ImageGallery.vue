<template>
  <div class="image-gallery">
    <div class="gallery-header">
      <div class="gallery-actions">
        <div v-if="zipUrls.length > 0" class="zip-actions">
          <select v-model.number="selectedZipIndex" class="zip-select">
            <option v-for="(zip, index) in zipUrls" :key="zip.url || index" :value="index">
              {{ zip.name }} ({{ zip.count }}张)
            </option>
          </select>
          <AppButton tone="primary" variant="outline" size="sm" @click="downloadSelectedZip">
            <template #icon>
              <AppIcon name="download" />
            </template>
            下载
          </AppButton>
        </div>

        <AppButton
          tone="success"
          :loading="ocrIndexing"
          :disabled="images.length === 0"
          @click="buildOcrIndex"
        >
          <template #icon>
            <AppIcon name="search" />
          </template>
          {{ ocrButtonText }}
        </AppButton>
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
        还有 {{ pendingOcrCount }} 张图片未建立 OCR 索引，可继续补全。
      </p>
    </div>

    <div v-if="filteredImages.length > 0" class="gallery-grid">
      <div v-for="image in filteredImages" :key="image.id" class="image-card">
        <div class="image-container" @click="openPreview(image)" title="点击查看大图">
          <img :src="image.path" :alt="image.name" />
        </div>
        <div class="image-info">
          <div class="info-top">
            <span class="image-name">{{ image.name }}</span>
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
          </div>
          <div class="info-meta">
            <span class="image-size">{{ formatSize(image.size) }}</span>
            <span v-if="image.source" class="image-source">{{ image.source }}</span>
          </div>
          <div v-if="getOcrPreview(image)" class="ocr-preview" :title="getIndexedText(image)">
            OCR：{{ getOcrPreview(image) }}
          </div>
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
  zipUrls: {
    type: Array,
    default: () => []
  }
})

const OCR_PRIMARY_LANG = 'chi_sim+eng'
const OCR_FALLBACK_LANG = 'eng'

const searchQuery = ref('')
const previewVisible = ref(false)
const selectedImage = ref(null)
const selectedZipIndex = ref(0)

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

const getImageKey = (image) => `${image.id || image.name || 'image'}::${image.path || ''}`

const hasOcrIndex = (image) => Object.prototype.hasOwnProperty.call(ocrIndex.value, getImageKey(image))

const getIndexedText = (image) => ocrIndex.value[getImageKey(image)] || ''

const getOcrPreview = (image) => {
  const text = getIndexedText(image)
  if (!text) return ''
  return text.length > 42 ? `${text.slice(0, 42)}...` : text
}

const indexedImageCount = computed(() => props.images.filter((image) => hasOcrIndex(image)).length)

const pendingOcrCount = computed(() => Math.max(props.images.length - indexedImageCount.value, 0))

const ocrButtonText = computed(() => {
  if (ocrIndexing.value) return 'OCR 建索引中'
  if (indexedImageCount.value === 0) return 'OCR 建索引'
  if (pendingOcrCount.value > 0) return `OCR 补全索引 (${pendingOcrCount.value})`
  return 'OCR 重新识别'
})

const filteredImages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.images

  return props.images.filter((image) => {
    const name = (image.name || '').toLowerCase()
    const source = (image.source || '').toLowerCase()
    const ocrText = getIndexedText(image).toLowerCase()

    return name.includes(query) || source.includes(query) || ocrText.includes(query)
  })
})

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

    if (Object.keys(nextIndex).length !== Object.keys(ocrIndex.value).length) {
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
      selectedZipIndex.value = 0
      return
    }

    if (selectedZipIndex.value > length - 1) {
      selectedZipIndex.value = 0
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

const buildOcrIndex = async () => {
  if (ocrIndexing.value) return
  if (!props.images.length) {
    notify.warning('暂无图片可建立 OCR 索引')
    return
  }

  const shouldReindexAll = indexedImageCount.value > 0 && pendingOcrCount.value === 0
  const targets = shouldReindexAll
    ? props.images
    : props.images.filter((image) => !hasOcrIndex(image))

  if (!targets.length) {
    notify.success('OCR 索引已是最新')
    return
  }

  if (shouldReindexAll) {
    ocrIndex.value = {}
  }

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
        successCount += 1
      } catch (error) {
        console.error('OCR 识别失败:', image?.name, error)
        ocrIndex.value[getImageKey(image)] = ''
      }

      const stepProgress = ((index + 1) / total) * 100
      if (stepProgress > ocrProgress.value) {
        ocrProgress.value = Number(stepProgress.toFixed(1))
      }
    }

    ocrStatus.value = `OCR 索引完成：${successCount}/${total} 张已处理，可直接搜索图片文字`
    notify.success('OCR 建索引完成，可按图片中文字搜索')
  } catch (error) {
    console.error('OCR 建索引失败:', error)
    ocrStatus.value = `OCR 索引失败：${error.message || '请稍后重试'}`
    notify.error(ocrStatus.value)
  } finally {
    activeOcrMeta.value = { current: 0, total: 1 }
    ocrIndexing.value = false
  }
}

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
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
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.image-card {
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
  border: 1px solid #e3eaf7;
  border-radius: 12px;
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
  height: 150px;
  justify-content: center;
  overflow: hidden;
}

.image-container img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}

.image-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem;
}

.info-top {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
}

.image-name {
  color: #303133;
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.image-size {
  color: #909399;
  font-size: 0.75rem;
}

.image-source {
  color: #4f8cff;
  font-size: 0.75rem;
}

.ocr-preview {
  color: #606266;
  display: -webkit-box;
  font-size: 0.75rem;
  line-height: 1.4;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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
