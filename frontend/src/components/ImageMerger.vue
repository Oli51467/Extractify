<template>
  <div class="merge-section">
    <el-upload
      ref="mergeUploadRef"
      v-model:file-list="mergeFileList"
      class="upload-area merge-upload-area"
      drag
      multiple
      :auto-upload="false"
      :show-file-list="true"
      accept="image/*"
      :on-change="handleMergeFileChange"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽图片到此处或 <em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip">支持 jpg、png、webp 等常见图片格式</div>
      </template>
    </el-upload>

    <div v-if="hasMergeItems" class="merge-settings">
      <div class="merge-settings-row">
        <div class="setting-item">
          <span class="setting-label">方向</span>
          <el-radio-group v-model="mergeDirection">
            <el-radio-button label="vertical">纵向</el-radio-button>
            <el-radio-button label="horizontal">横向</el-radio-button>
          </el-radio-group>
        </div>
        <div class="setting-item">
          <span class="setting-label">间距(px)</span>
          <el-input-number v-model="imageSpacing" :min="0" :max="200" :step="1" />
        </div>
        <div class="setting-item">
          <span class="setting-label">背景色</span>
          <el-color-picker v-model="backgroundColor" show-alpha />
        </div>
        <div class="setting-item">
          <span class="setting-label">水印</span>
          <el-switch v-model="watermarkEnabled" />
        </div>
      </div>

      <div v-if="watermarkEnabled" class="merge-settings-row merge-settings-row--watermark">
        <div class="setting-item setting-item--grow">
          <span class="setting-label">水印文本</span>
          <el-input v-model="watermarkText" placeholder="请输入水印文字" clearable />
        </div>
        <div class="setting-item">
          <span class="setting-label">字体</span>
          <el-input-number v-model="watermarkFontSize" :min="10" :max="160" :step="1" />
        </div>
        <div class="setting-item">
          <span class="setting-label">透明度</span>
          <el-slider v-model="watermarkOpacity" :min="0" :max="1" :step="0.05" :show-tooltip="true" />
        </div>
        <div class="setting-item">
          <span class="setting-label">颜色</span>
          <el-color-picker v-model="watermarkColor" show-alpha />
        </div>
        <div class="setting-item">
          <span class="setting-label">位置</span>
          <el-select v-model="watermarkPosition" style="width: 130px">
            <el-option label="左上" value="top-left" />
            <el-option label="右上" value="top-right" />
            <el-option label="居中" value="center" />
            <el-option label="左下" value="bottom-left" />
            <el-option label="右下" value="bottom-right" />
          </el-select>
        </div>
        <div class="setting-item">
          <span class="setting-label">边距(px)</span>
          <el-input-number v-model="watermarkMargin" :min="0" :max="200" :step="1" />
        </div>
      </div>
    </div>

    <div v-if="mergePreviewItems.length > 0" class="merge-preview">
      <div class="merge-preview-header">
        <span>上传顺序预览（{{ mergePreviewItems.length }} 张）</span>
        <span class="merge-preview-tip">可拖拽卡片重排顺序，点击图片可放大</span>
      </div>
      <div class="merge-preview-list">
        <div
          v-for="(item, index) in mergePreviewItems"
          :key="item.uid"
          class="merge-preview-item"
          :class="{
            'is-drag-source': dragSourceIndex === index,
            'is-drag-over': dragOverIndex === index
          }"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent="handleDragOver(index)"
          @drop.prevent="handleDrop(index)"
          @dragend="handleDragEnd"
        >
          <el-image :src="item.url" fit="cover" :preview-src-list="mergePreviewSrcList" :initial-index="index" />
          <div class="merge-preview-meta">
            <span class="merge-preview-index">{{ index + 1 }}</span>
            <span class="merge-preview-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="merge-controls">
      <div class="merge-actions">
        <AppButton tone="primary" :loading="isMergingImages" :disabled="mergeFileList.length === 0" @click="handleMergeImages">
          生成长图
        </AppButton>
        <AppButton tone="neutral" variant="outline" :disabled="mergeFileList.length === 0 && !mergedImageUrl" @click="clearMergeState">
          清空
        </AppButton>
      </div>
    </div>

    <div v-if="mergedImageUrl" class="merge-result">
      <div class="merge-result-header">
        <span>拼接结果（{{ mergedImageWidth }} × {{ mergedImageHeight }}）</span>
        <AppButton tone="success" variant="outline" @click="downloadMergedImage">
          <template #icon>
            <Download />
          </template>
          下载长图
        </AppButton>
      </div>
      <div class="merge-result-image">
        <el-image :src="mergedImageUrl" fit="contain" :preview-src-list="[mergedImageUrl]" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { UploadFilled, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AppButton from './ui/AppButton.vue'

const mergeUploadRef = ref(null)
const mergeFileList = ref([])
const mergeDirection = ref('vertical')
const imageSpacing = ref(0)
const backgroundColor = ref('#ffffff')

const watermarkEnabled = ref(false)
const watermarkText = ref('Extractify')
const watermarkFontSize = ref(28)
const watermarkOpacity = ref(0.25)
const watermarkColor = ref('rgba(0, 0, 0, 1)')
const watermarkPosition = ref('bottom-right')
const watermarkMargin = ref(24)

const isMergingImages = ref(false)
const mergedImageUrl = ref('')
const mergedImageName = ref('')
const mergedImageWidth = ref(0)
const mergedImageHeight = ref(0)
const mergePreviewItems = ref([])

const dragSourceIndex = ref(-1)
const dragOverIndex = ref(-1)

const hasMergeItems = computed(() => mergeFileList.value.length > 0)
const mergePreviewSrcList = computed(() => mergePreviewItems.value.map(item => item.url))

const resetMergedResult = () => {
  if (mergedImageUrl.value) {
    URL.revokeObjectURL(mergedImageUrl.value)
    mergedImageUrl.value = ''
  }
  mergedImageName.value = ''
  mergedImageWidth.value = 0
  mergedImageHeight.value = 0
}

const resetMergePreviewItems = () => {
  mergePreviewItems.value.forEach((item) => {
    if (item.revokeable) {
      URL.revokeObjectURL(item.url)
    }
  })
  mergePreviewItems.value = []
}

const syncMergePreviewItems = (files) => {
  resetMergePreviewItems()

  mergePreviewItems.value = files
    .map((item, index) => {
      if (item.raw) {
        return {
          uid: item.uid || `${item.name}-${index}`,
          name: item.name,
          url: URL.createObjectURL(item.raw),
          revokeable: true
        }
      }

      if (item.url) {
        return {
          uid: item.uid || `${item.name}-${index}`,
          name: item.name,
          url: item.url,
          revokeable: false
        }
      }

      return null
    })
    .filter(Boolean)
}

const reorderMergeFiles = (fromIndex, toIndex) => {
  if (fromIndex < 0 || toIndex < 0) return
  if (fromIndex >= mergeFileList.value.length || toIndex >= mergeFileList.value.length) return
  if (fromIndex === toIndex) return

  const next = [...mergeFileList.value]
  const [movedItem] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, movedItem)
  mergeFileList.value = next
  syncMergePreviewItems(next)
  resetMergedResult()
}

const handleDragStart = (index) => {
  dragSourceIndex.value = index
}

const handleDragOver = (index) => {
  dragOverIndex.value = index
}

const handleDrop = (index) => {
  reorderMergeFiles(dragSourceIndex.value, index)
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
}

const handleDragEnd = () => {
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
}

const handleMergeFileChange = (file, uploadFiles) => {
  const validFiles = uploadFiles.filter(item => item.raw && item.raw.type.startsWith('image/'))
  const hasInvalidFile = validFiles.length !== uploadFiles.length || (file.raw && !file.raw.type.startsWith('image/'))

  if (hasInvalidFile) {
    ElMessage.error('仅支持上传图片文件')
  }

  mergeFileList.value = validFiles
  syncMergePreviewItems(mergeFileList.value)
  resetMergedResult()
}

const loadImage = (rawFile) => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(rawFile)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`无法读取图片：${rawFile.name}`))
    }

    image.src = objectUrl
  })
}

const canvasToBlob = (canvas) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('导出拼接图片失败'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

const getWatermarkOrigin = (canvas, textWidth, textHeight, margin, position) => {
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: canvas.width - margin - textWidth, y: margin }
    case 'center':
      return { x: (canvas.width - textWidth) / 2, y: (canvas.height - textHeight) / 2 }
    case 'bottom-left':
      return { x: margin, y: canvas.height - margin - textHeight }
    case 'bottom-right':
    default:
      return { x: canvas.width - margin - textWidth, y: canvas.height - margin - textHeight }
  }
}

const drawWatermark = (context, canvas) => {
  if (!watermarkEnabled.value) return

  const text = (watermarkText.value || '').trim()
  if (!text) return

  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return

  const fontSize = Math.max(10, Number(watermarkFontSize.value) || 28)
  const lineHeight = Math.round(fontSize * 1.25)
  const opacity = Math.min(1, Math.max(0, Number(watermarkOpacity.value) || 0))
  const margin = Math.max(0, Number(watermarkMargin.value) || 0)

  context.save()
  context.font = `${fontSize}px sans-serif`
  context.textBaseline = 'top'
  context.fillStyle = watermarkColor.value || 'rgba(0, 0, 0, 1)'
  context.globalAlpha = opacity

  const lineWidths = lines.map(line => context.measureText(line).width)
  const textWidth = Math.max(...lineWidths)
  const textHeight = lineHeight * lines.length
  const origin = getWatermarkOrigin(canvas, textWidth, textHeight, margin, watermarkPosition.value)
  const baseX = Math.max(0, origin.x)
  const baseY = Math.max(0, origin.y)

  lines.forEach((line, lineIndex) => {
    const lineX = baseX + (textWidth - lineWidths[lineIndex]) / 2
    const lineY = baseY + lineIndex * lineHeight
    context.fillText(line, lineX, lineY)
  })

  context.restore()
}

const handleMergeImages = async () => {
  if (mergeFileList.value.length === 0) {
    ElMessage.warning('请先上传至少一张图片')
    return
  }

  isMergingImages.value = true

  try {
    const loadedImages = await Promise.all(
      mergeFileList.value.map((file) => {
        if (!file.raw) {
          throw new Error(`图片文件无效：${file.name}`)
        }
        return loadImage(file.raw)
      })
    )

    const isVertical = mergeDirection.value === 'vertical'
    const spacing = Math.max(0, Number(imageSpacing.value) || 0)
    const gapCount = Math.max(0, loadedImages.length - 1)
    const canvas = document.createElement('canvas')

    canvas.width = isVertical
      ? Math.max(...loadedImages.map(image => image.width))
      : loadedImages.reduce((sum, image) => sum + image.width, 0) + spacing * gapCount

    canvas.height = isVertical
      ? loadedImages.reduce((sum, image) => sum + image.height, 0) + spacing * gapCount
      : Math.max(...loadedImages.map(image => image.height))

    if (canvas.width > 32767 || canvas.height > 32767) {
      throw new Error('拼接结果尺寸过大，请减少图片数量或分辨率')
    }

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建画布上下文')
    }

    context.fillStyle = backgroundColor.value || '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    let offset = 0
    loadedImages.forEach((image, imageIndex) => {
      if (isVertical) {
        const x = Math.floor((canvas.width - image.width) / 2)
        context.drawImage(image, x, offset)
        offset += image.height
      } else {
        const y = Math.floor((canvas.height - image.height) / 2)
        context.drawImage(image, offset, y)
        offset += image.width
      }

      if (imageIndex < loadedImages.length - 1) {
        offset += spacing
      }
    })

    drawWatermark(context, canvas)

    const blob = await canvasToBlob(canvas)
    const newImageUrl = URL.createObjectURL(blob)

    resetMergedResult()
    mergedImageUrl.value = newImageUrl
    mergedImageWidth.value = canvas.width
    mergedImageHeight.value = canvas.height
    mergedImageName.value = `merged_${mergeDirection.value}_${Date.now()}.png`

    ElMessage.success('长图生成成功')
  } catch (error) {
    console.error('拼接失败:', error)
    ElMessage.error(error.message || '处理失败，请重试')
  } finally {
    isMergingImages.value = false
  }
}

const downloadMergedImage = () => {
  if (!mergedImageUrl.value) {
    ElMessage.warning('暂无可下载的长图')
    return
  }

  const link = document.createElement('a')
  link.href = mergedImageUrl.value
  link.download = mergedImageName.value || `merged_${Date.now()}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const clearMergeState = () => {
  if (mergeUploadRef.value) {
    mergeUploadRef.value.clearFiles()
  }
  mergeFileList.value = []
  resetMergePreviewItems()
  resetMergedResult()
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
}

watch([mergeDirection, imageSpacing, backgroundColor, watermarkEnabled, watermarkText, watermarkFontSize, watermarkOpacity, watermarkColor, watermarkPosition, watermarkMargin], () => {
  resetMergedResult()
})

onUnmounted(() => {
  resetMergePreviewItems()
  resetMergedResult()
})
</script>

<style lang="scss" scoped>
.merge-section {
  width: 100%;
}

.upload-area {
  width: 100%;

  :deep(.el-upload) {
    width: 100%;
  }

  :deep(.el-upload-dragger) {
    width: 100%;
    height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
}

.merge-upload-area {
  :deep(.el-upload-dragger) {
    height: 180px;
  }
}

.el-icon--upload {
  font-size: 48px;
  color: var(--primary-color);
  margin-bottom: 16px;
}

.merge-settings {
  margin-top: 1rem;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.merge-settings-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.merge-settings-row--watermark {
  border-top: 1px dashed #ebeef5;
  padding-top: 0.75rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.setting-item--grow {
  min-width: 220px;
  flex: 1;
}

.setting-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.merge-controls {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.merge-actions {
  display: flex;
  gap: 0.5rem;
}

.merge-preview {
  margin-top: 1rem;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  padding: 0.75rem;
}

.merge-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  flex-wrap: wrap;
}

.merge-preview-tip {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

.merge-preview-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}

.merge-preview-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  background: #fafafa;
  cursor: grab;
  transition: border-color 0.2s, box-shadow 0.2s, opacity 0.2s;

  .el-image {
    display: block;
    width: 100%;
    height: 110px;
    cursor: zoom-in;
  }
}

.merge-preview-item.is-drag-source {
  opacity: 0.6;
}

.merge-preview-item.is-drag-over {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.35);
}

.merge-preview-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
}

.merge-preview-index {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  text-align: center;
  line-height: 1.25rem;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.merge-preview-name {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.merge-result {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafafa;
}

.merge-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.merge-result-image {
  max-height: 500px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fff;
  padding: 0.5rem;

  .el-image {
    display: block;
    width: 100%;
    cursor: zoom-in;
  }

  :deep(.el-image__inner) {
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }
}
</style>
