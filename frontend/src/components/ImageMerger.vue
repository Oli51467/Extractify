<template>
  <div class="merge-section">
    <div
      class="merge-upload-area"
      :class="{ 'is-dragging': dragHover }"
      @click="openPicker"
      @dragover.prevent="dragHover = true"
      @dragleave.prevent="dragHover = false"
      @drop.prevent="handleDrop"
    >
      <input
        ref="mergeInputRef"
        type="file"
        multiple
        accept="image/*"
        @change="handleInputChange"
      />
      <AppIcon name="upload" class="upload-icon" />
      <p class="upload-title">拖拽图片到此处或点击上传</p>
      <p class="upload-tip">支持 jpg、png、webp 等常见图片格式</p>
      <p v-if="mergeFileList.length > 0" class="upload-count">已选择 {{ mergeFileList.length }} 张图片</p>
    </div>

    <div v-if="hasMergeItems" class="merge-settings">
      <div class="merge-settings-row">
        <div class="setting-item">
          <span class="setting-label">方向</span>
          <div class="segmented-group">
            <button
              type="button"
              class="segment-btn"
              :class="{ 'is-active': mergeDirection === 'vertical' }"
              @click="mergeDirection = 'vertical'"
            >纵向</button>
            <button
              type="button"
              class="segment-btn"
              :class="{ 'is-active': mergeDirection === 'horizontal' }"
              @click="mergeDirection = 'horizontal'"
            >横向</button>
          </div>
        </div>

        <label class="setting-item">
          <span class="setting-label">间距(px)</span>
          <input v-model.number="imageSpacing" type="number" min="0" max="200" />
        </label>

        <label class="setting-item">
          <span class="setting-label">背景色</span>
          <input v-model="backgroundColor" type="color" />
        </label>

        <div class="setting-item">
          <span class="setting-label">水印</span>
          <button
            class="small-switch"
            type="button"
            role="switch"
            :aria-checked="watermarkEnabled ? 'true' : 'false'"
            @click="watermarkEnabled = !watermarkEnabled"
          >
            <span class="small-switch-track"><span class="small-switch-thumb" /></span>
          </button>
        </div>
      </div>

      <div v-if="watermarkEnabled" class="merge-settings-row merge-settings-row--watermark">
        <label class="setting-item setting-item--grow">
          <span class="setting-label">水印文本</span>
          <AppInput v-model="watermarkText" placeholder="请输入水印文字" clearable />
        </label>

        <label class="setting-item">
          <span class="setting-label">字体</span>
          <input v-model.number="watermarkFontSize" type="number" min="10" max="160" />
        </label>

        <label class="setting-item setting-item--grow">
          <span class="setting-label">透明度</span>
          <input v-model.number="watermarkOpacity" type="range" min="0" max="1" step="0.05" />
          <span class="setting-value">{{ watermarkOpacity.toFixed(2) }}</span>
        </label>

        <label class="setting-item">
          <span class="setting-label">颜色</span>
          <input v-model="watermarkColorHex" type="color" />
        </label>

        <label class="setting-item">
          <span class="setting-label">位置</span>
          <select v-model="watermarkPosition">
            <option value="top-left">左上</option>
            <option value="top-right">右上</option>
            <option value="center">居中</option>
            <option value="bottom-left">左下</option>
            <option value="bottom-right">右下</option>
          </select>
        </label>

        <label class="setting-item">
          <span class="setting-label">边距(px)</span>
          <input v-model.number="watermarkMargin" type="number" min="0" max="200" />
        </label>
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
          @drop.prevent="handleDropTo(index)"
          @dragend="handleDragEnd"
        >
          <img :src="item.url" :alt="item.name" @click="openPreview(item.url)" />
          <div class="merge-preview-meta">
            <span class="merge-preview-index">{{ index + 1 }}</span>
            <span class="merge-preview-name">{{ item.name }}</span>
            <button class="merge-remove" type="button" @click.stop="removeItem(index)">x</button>
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
            <AppIcon name="download" />
          </template>
          下载长图
        </AppButton>
      </div>
      <div class="merge-result-image" @click="openPreview(mergedImageUrl)">
        <img :src="mergedImageUrl" alt="merged" />
      </div>
    </div>

    <AppModal v-model="previewVisible" title="图片预览" width="min(1100px, 94vw)">
      <div class="preview-body">
        <img v-if="previewUrl" :src="previewUrl" alt="preview" />
      </div>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { notify } from '../services/notify'
import AppButton from './ui/AppButton.vue'
import AppInput from './ui/AppInput.vue'
import AppIcon from './ui/AppIcon.vue'
import AppModal from './ui/AppModal.vue'

const createItemUid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const mergeInputRef = ref(null)
const mergeFileList = ref([])
const mergeDirection = ref('vertical')
const imageSpacing = ref(0)
const backgroundColor = ref('#ffffff')

const watermarkEnabled = ref(false)
const watermarkText = ref('DocPix Studio')
const watermarkFontSize = ref(28)
const watermarkOpacity = ref(0.25)
const watermarkColorHex = ref('#000000')
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
const dragHover = ref(false)

const previewVisible = ref(false)
const previewUrl = ref('')

const hasMergeItems = computed(() => mergeFileList.value.length > 0)

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
      if (!item) return null

      if (item.urlSource) {
        return {
          uid: item.uid || `${item.name || 'image'}-${index}`,
          name: item.name || `image_${index + 1}`,
          url: item.urlSource,
          revokeable: false
        }
      }

      if (!item.raw) return null
      return {
        uid: item.uid || `${item.name}-${index}`,
        name: item.name,
        url: URL.createObjectURL(item.raw),
        revokeable: true
      }
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

const removeItem = (index) => {
  if (index < 0 || index >= mergeFileList.value.length) return
  mergeFileList.value = mergeFileList.value.filter((_, itemIndex) => itemIndex !== index)
  syncMergePreviewItems(mergeFileList.value)
  resetMergedResult()
}

const handleDragStart = (index) => {
  dragSourceIndex.value = index
}

const handleDragOver = (index) => {
  dragOverIndex.value = index
}

const handleDropTo = (index) => {
  reorderMergeFiles(dragSourceIndex.value, index)
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
}

const handleDragEnd = () => {
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
}

const parseFiles = (rawFiles) => {
  const source = Array.from(rawFiles || [])
  const validFiles = source.filter((file) => file.type && file.type.startsWith('image/'))
  const hasInvalidFile = validFiles.length !== source.length

  if (hasInvalidFile) {
    notify.warning('仅支持上传图片文件')
  }

  return validFiles.map((file, index) => ({
    uid: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    raw: file
  }))
}

const appendFiles = (rawFiles) => {
  const items = parseFiles(rawFiles)
  if (items.length === 0) return

  mergeFileList.value = [...mergeFileList.value, ...items]
  syncMergePreviewItems(mergeFileList.value)
  resetMergedResult()
}

const openPicker = () => {
  if (mergeInputRef.value) {
    mergeInputRef.value.click()
  }
}

const handleInputChange = (event) => {
  appendFiles(event.target?.files)
  if (mergeInputRef.value) {
    mergeInputRef.value.value = ''
  }
}

const handleDrop = (event) => {
  dragHover.value = false
  appendFiles(event.dataTransfer?.files)
}

const loadImageFromUrl = (url, fileName = 'image') => {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve(image)
    }

    image.onerror = () => {
      reject(new Error(`无法读取图片：${fileName}`))
    }

    image.src = url
  })
}

const loadImage = async (fileEntry) => {
  if (fileEntry?.raw) {
    const objectUrl = URL.createObjectURL(fileEntry.raw)
    try {
      return await loadImageFromUrl(objectUrl, fileEntry.name)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  if (fileEntry?.urlSource) {
    const response = await fetch(fileEntry.urlSource)
    if (!response.ok) {
      throw new Error(`无法下载图片：${fileEntry.name || 'unknown'}`)
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await loadImageFromUrl(objectUrl, fileEntry.name)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  throw new Error(`图片文件无效：${fileEntry?.name || 'unknown'}`)
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
  context.fillStyle = watermarkColorHex.value || '#000000'
  context.globalAlpha = opacity

  const lineWidths = lines.map((line) => context.measureText(line).width)
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
    notify.warning('请先上传至少一张图片')
    return
  }

  isMergingImages.value = true

  try {
    const loadedImages = await Promise.all(
      mergeFileList.value.map((file) => {
        return loadImage(file)
      })
    )

    const isVertical = mergeDirection.value === 'vertical'
    const spacing = Math.max(0, Number(imageSpacing.value) || 0)
    const gapCount = Math.max(0, loadedImages.length - 1)
    const canvas = document.createElement('canvas')

    canvas.width = isVertical
      ? Math.max(...loadedImages.map((image) => image.width))
      : loadedImages.reduce((sum, image) => sum + image.width, 0) + spacing * gapCount

    canvas.height = isVertical
      ? loadedImages.reduce((sum, image) => sum + image.height, 0) + spacing * gapCount
      : Math.max(...loadedImages.map((image) => image.height))

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

    notify.success('长图生成成功')
  } catch (error) {
    console.error('拼接失败:', error)
    notify.error(error.message || '处理失败，请重试')
  } finally {
    isMergingImages.value = false
  }
}

const downloadMergedImage = () => {
  if (!mergedImageUrl.value) {
    notify.warning('暂无可下载的长图')
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
  mergeFileList.value = []
  resetMergePreviewItems()
  resetMergedResult()
  dragSourceIndex.value = -1
  dragOverIndex.value = -1
  previewVisible.value = false
  previewUrl.value = ''
}

const appendRemoteImages = (items = []) => {
  const normalized = Array.isArray(items)
    ? items
      .map((item) => ({
        uid: createItemUid(),
        name: String(item?.name || 'imported_image').trim() || 'imported_image',
        urlSource: String(item?.url || item?.path || '').trim()
      }))
      .filter((item) => item.urlSource)
    : [];

  if (normalized.length === 0) {
    return 0
  }

  mergeFileList.value = [...mergeFileList.value, ...normalized]
  syncMergePreviewItems(mergeFileList.value)
  resetMergedResult()
  return normalized.length
}

const openPreview = (url) => {
  previewUrl.value = url
  previewVisible.value = true
}

watch(
  [
    mergeDirection,
    imageSpacing,
    backgroundColor,
    watermarkEnabled,
    watermarkText,
    watermarkFontSize,
    watermarkOpacity,
    watermarkColorHex,
    watermarkPosition,
    watermarkMargin
  ],
  () => {
    resetMergedResult()
  }
)

onUnmounted(() => {
  resetMergePreviewItems()
  resetMergedResult()
})

defineExpose({
  appendRemoteImages
})
</script>

<style lang="scss" scoped>
.merge-section {
  width: 100%;
}

.merge-upload-area {
  align-items: center;
  background: linear-gradient(180deg, #fbfdff 0%, #f4f8ff 100%);
  border: 1.5px dashed #c9d6ef;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  justify-content: center;
  min-height: 180px;
  padding: 1rem;
  text-align: center;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.merge-upload-area:hover,
.merge-upload-area.is-dragging {
  border-color: #7ea2ef;
  box-shadow: 0 18px 30px -26px rgba(35, 52, 86, 0.62);
}

.merge-upload-area input {
  display: none;
}

.upload-icon {
  color: #4f8cff;
  font-size: 42px;
}

.upload-title {
  color: #2d3b56;
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.upload-tip,
.upload-count {
  color: #8a96ac;
  font-size: 0.8rem;
  margin: 0;
}

.merge-settings {
  background: #fff;
  border: 1px solid #e7edf8;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.75rem;
}

.merge-settings-row {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.merge-settings-row--watermark {
  border-top: 1px dashed #e6edf8;
  padding-top: 0.75rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.setting-item--grow {
  flex: 1;
  min-width: 220px;
}

.setting-label {
  color: #697a98;
  font-size: 0.79rem;
}

.setting-item input,
.setting-item select {
  background: #fff;
  border: 1px solid #d8e2f5;
  border-radius: 10px;
  color: #415472;
  font-size: 13px;
  min-height: 34px;
  padding: 0 10px;
}

.setting-item input[type='color'] {
  min-width: 44px;
  padding: 2px;
}

.setting-item input[type='range'] {
  accent-color: #4f8cff;
  min-height: auto;
  padding: 0;
}

.setting-value {
  color: #8793ab;
  font-size: 12px;
}

.segmented-group {
  background: #f2f6fd;
  border: 1px solid #dbe4f7;
  border-radius: 11px;
  display: inline-flex;
  padding: 2px;
}

.segment-btn {
  background: transparent;
  border: 0;
  border-radius: 9px;
  color: #687a99;
  cursor: pointer;
  font-size: 13px;
  min-height: 30px;
  min-width: 58px;
}

.segment-btn.is-active {
  background: #fff;
  box-shadow: 0 8px 18px -14px rgba(44, 63, 98, 0.7);
  color: #3f79f3;
}

.small-switch {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}

.small-switch-track {
  background: #c8d2e2;
  border: 1px solid #bcc7d9;
  border-radius: 999px;
  display: inline-block;
  height: 17px;
  position: relative;
  width: 30px;
}

.small-switch-thumb {
  background: #fff;
  border-radius: 999px;
  box-shadow: 0 2px 5px rgba(48, 62, 92, 0.2);
  height: 12px;
  left: 1.5px;
  position: absolute;
  top: 1.5px;
  transition: all 0.2s ease;
  width: 12px;
}

.small-switch[aria-checked='true'] .small-switch-track {
  background: #48b38d;
  border-color: #3ea780;
}

.small-switch[aria-checked='true'] .small-switch-thumb {
  left: calc(100% - 13.5px);
}

.merge-controls {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.merge-actions {
  display: flex;
  gap: 0.5rem;
}

.merge-preview {
  background: #fff;
  border: 1px solid #e7edf8;
  border-radius: 12px;
  margin-top: 1rem;
  padding: 0.75rem;
}

.merge-preview-header {
  align-items: center;
  color: #2f3d58;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.9rem;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.merge-preview-tip {
  color: #8f9bb2;
  font-size: 0.8rem;
}

.merge-preview-list {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.merge-preview-item {
  background: #fafbfd;
  border: 1px solid #e7edf8;
  border-radius: 10px;
  cursor: grab;
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.merge-preview-item img {
  cursor: zoom-in;
  display: block;
  height: 110px;
  object-fit: cover;
  width: 100%;
}

.merge-preview-item.is-drag-source {
  opacity: 0.6;
}

.merge-preview-item.is-drag-over {
  border-color: #7ea3ef;
  box-shadow: 0 0 0 2px rgba(64, 122, 241, 0.22);
}

.merge-preview-meta {
  align-items: center;
  display: flex;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
}

.merge-preview-index {
  align-items: center;
  background: #4f8cff;
  border-radius: 999px;
  color: #fff;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.73rem;
  height: 1.25rem;
  justify-content: center;
  width: 1.25rem;
}

.merge-preview-name {
  color: #64738f;
  flex: 1;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.merge-remove {
  background: transparent;
  border: 0;
  color: #8f9ab0;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.merge-result {
  background: #fafbfd;
  border: 1px solid #e7edf8;
  border-radius: 12px;
  margin-top: 1rem;
  padding: 1rem;
}

.merge-result-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.merge-result-image {
  align-items: center;
  background: #fff;
  border: 1px solid #e8edf6;
  border-radius: 10px;
  cursor: zoom-in;
  display: flex;
  justify-content: center;
  max-height: 520px;
  overflow: auto;
  padding: 0.5rem;
}

.merge-result-image img {
  max-width: 100%;
}

.preview-body {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 220px;
}

.preview-body img {
  border-radius: 10px;
  box-shadow: 0 18px 34px -24px rgba(13, 22, 40, 0.7);
  max-height: 80vh;
  max-width: 100%;
  object-fit: contain;
}

@media (max-width: 720px) {
  .merge-controls {
    justify-content: flex-start;
  }
}
</style>
