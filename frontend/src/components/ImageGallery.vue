<template>
  <div class="image-gallery">
    <div class="gallery-header">
      <div class="gallery-actions">
        <el-dropdown v-if="zipUrls.length > 0" @command="handleZipDownload">
          <AppButton tone="primary" variant="outline">
            <template #icon>
              <Download />
            </template>
            下载 <ArrowDown class="app-inline-arrow" />
          </AppButton>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="(zip, index) in zipUrls" :key="index" :command="zip">
                {{ zip.name }} ({{ zip.count }}张图片)
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <AppButton
          tone="success"
          :loading="ocrIndexing"
          :disabled="images.length === 0"
          @click="buildOcrIndex"
        >
          <template #icon>
            <Search />
          </template>
          {{ ocrButtonText }}
        </AppButton>
      </div>

      <div class="gallery-filter">
        <el-input
          v-model="searchQuery"
          placeholder="按文件名 / 来源 / OCR 文字搜索..."
          :prefix-icon="Search"
          clearable
        />
      </div>
    </div>

    <div v-if="ocrStatus" class="ocr-status">
      <el-progress v-if="ocrIndexing" :percentage="ocrProgress" :stroke-width="8" />
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
                <Download />
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
      <el-empty description="暂无匹配图片" />
    </div>

    <el-dialog v-model="previewVisible" width="80%" :close-on-click-modal="true" :destroy-on-close="true" center>
      <template #title>
        <div class="preview-title">
          <span>{{ selectedImage?.name || '图片预览' }}</span>
          <span v-if="selectedImage" class="preview-meta">{{ formatSize(selectedImage.size) }}</span>
        </div>
      </template>
      <div v-if="selectedImage" class="preview-body">
        <img :src="selectedImage.path" :alt="selectedImage.name" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Download, ArrowDown, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AppButton from './ui/AppButton.vue'

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
    ElMessage.warning('暂无图片可建立 OCR 索引')
    return
  }

  const shouldReindexAll = indexedImageCount.value > 0 && pendingOcrCount.value === 0
  const targets = shouldReindexAll
    ? props.images
    : props.images.filter((image) => !hasOcrIndex(image))

  if (!targets.length) {
    ElMessage.success('OCR 索引已是最新')
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
    ElMessage.success('OCR 建索引完成，可按图片中文字搜索')
  } catch (error) {
    console.error('OCR 建索引失败:', error)
    ocrStatus.value = `OCR 索引失败：${error.message || '请稍后重试'}`
    ElMessage.error(ocrStatus.value)
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

const handleZipDownload = (zip) => {
  if (!zip || !zip.url) {
    ElMessage.warning('压缩包信息无效')
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
      ElMessage.error(`下载失败: ${error.message}`)
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.gallery-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.app-inline-arrow {
  height: 1em;
  width: 1em;
}

.gallery-filter {
  width: 320px;
  max-width: 100%;
}

.ocr-status {
  margin-bottom: 1rem;

  p {
    margin-top: 0.5rem;
    color: #606266;
    font-size: 0.875rem;
  }

  .ocr-hint {
    color: #909399;
  }
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.image-card {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }
}

.image-container {
  height: 150px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background-color: #f5f7fa;
  cursor: zoom-in;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.image-info {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  .info-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;

    .image-name {
      font-size: 0.875rem;
      color: #303133;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
  }

  .info-meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;

    .image-size {
      font-size: 0.75rem;
      color: #909399;
    }

    .image-source {
      font-size: 0.75rem;
      color: #409eff;
    }
  }
}

.ocr-preview {
  color: #606266;
  font-size: 0.75rem;
  line-height: 1.4;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.no-images {
  padding: 2rem;
  display: flex;
  justify-content: center;
}

.preview-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.preview-meta {
  color: #909399;
  font-size: 0.875rem;
}

.preview-body {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem 0;

  img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  }
}
</style>
