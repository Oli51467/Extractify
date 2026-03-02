<template>
  <div class="merge-section">
    <p class="merge-intro">上传 1-n 张图片，按上传顺序进行横向或纵向拼接。</p>

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

    <div v-if="mergePreviewItems.length > 0" class="merge-preview">
      <div class="merge-preview-header">
        <span>上传顺序预览（{{ mergePreviewItems.length }} 张）</span>
        <span class="merge-preview-tip">点击图片可放大查看</span>
      </div>
      <div class="merge-preview-list">
        <div v-for="(item, index) in mergePreviewItems" :key="item.uid" class="merge-preview-item">
          <el-image :src="item.url" fit="cover" :preview-src-list="mergePreviewSrcList" :initial-index="index" />
          <div class="merge-preview-meta">
            <span class="merge-preview-index">{{ index + 1 }}</span>
            <span class="merge-preview-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="merge-controls">
      <el-radio-group v-model="mergeDirection">
        <el-radio-button label="vertical">纵向拼接</el-radio-button>
        <el-radio-button label="horizontal">横向拼接</el-radio-button>
      </el-radio-group>
      <div class="merge-actions">
        <el-button type="primary" :loading="isMergingImages" :disabled="mergeFileList.length === 0" @click="handleMergeImages">
          生成长图
        </el-button>
        <el-button :disabled="mergeFileList.length === 0 && !mergedImageUrl" @click="clearMergeState">清空</el-button>
      </div>
    </div>

    <div v-if="mergedImageUrl" class="merge-result">
      <div class="merge-result-header">
        <span>拼接结果（{{ mergedImageWidth }} × {{ mergedImageHeight }}）</span>
        <el-button type="success" plain @click="downloadMergedImage">
          <el-icon><download /></el-icon>
          下载长图
        </el-button>
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

const mergeUploadRef = ref(null)
const mergeFileList = ref([])
const mergeDirection = ref('vertical')
const isMergingImages = ref(false)
const mergedImageUrl = ref('')
const mergedImageName = ref('')
const mergedImageWidth = ref(0)
const mergedImageHeight = ref(0)
const mergePreviewItems = ref([])

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
    const canvas = document.createElement('canvas')

    canvas.width = isVertical
      ? Math.max(...loadedImages.map(image => image.width))
      : loadedImages.reduce((sum, image) => sum + image.width, 0)

    canvas.height = isVertical
      ? loadedImages.reduce((sum, image) => sum + image.height, 0)
      : Math.max(...loadedImages.map(image => image.height))

    if (canvas.width > 32767 || canvas.height > 32767) {
      throw new Error('拼接结果尺寸过大，请减少图片数量或分辨率')
    }

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建画布上下文')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    let offset = 0
    loadedImages.forEach((image) => {
      if (isVertical) {
        context.drawImage(image, 0, offset)
        offset += image.height
      } else {
        context.drawImage(image, offset, 0)
        offset += image.width
      }
    })

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
    ElMessage.error(error.message || '图片拼接失败，请重试')
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
}

watch(mergeDirection, () => {
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

.merge-intro {
  margin-bottom: 1rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
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

.merge-controls {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
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

  .el-image {
    display: block;
    width: 100%;
    height: 110px;
    cursor: zoom-in;
  }
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
