<template>
  <div class="image-gallery">
    <div class="gallery-header">
      <div class="gallery-actions">
        <el-dropdown v-if="zipUrls.length > 0" @command="handleZipDownload">
          <el-button plain type="primary">
            <el-icon>
              <download />
            </el-icon>
            下载 <el-icon class="el-icon--right"><arrow-down /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="(zip, index) in zipUrls" :key="index" :command="zip.url">
                {{ zip.name }} ({{ zip.count }}张图片)
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

      </div>

      <div class="gallery-filter">
        <el-input v-model="searchQuery" placeholder="搜索图片..." prefix-icon="Search" clearable />
      </div>
    </div>

    <div v-if="filteredImages.length > 0" class="gallery-grid">
      <div v-for="image in filteredImages" :key="image.id" class="image-card">
        <div class="image-container" @click="openPreview(image)" title="点击查看大图">
          <img :src="image.path" :alt="image.name" />
        </div>
        <div class="image-info">
          <div class="info-top">
            <span class="image-name">{{ image.name }}</span>
            <el-button type="primary" text size="small" @click.stop="downloadImage(image)" title="下载">
              <el-icon>
                <download />
              </el-icon>
            </el-button>
          </div>
          <div class="info-meta">
            <span class="image-size">{{ formatSize(image.size) }}</span>
            <span class="image-source" v-if="image.source">{{ image.source }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="no-images">
      <el-empty description="暂无图片" />
    </div>

    <el-dialog v-model="previewVisible" width="80%" :close-on-click-modal="true" :destroy-on-close="true" center>
      <template #title>
        <div class="preview-title">
          <span>{{ selectedImage?.name || '图片预览' }}</span>
          <span v-if="selectedImage" class="preview-meta">{{ formatSize(selectedImage.size) }}</span>
        </div>
      </template>
      <div class="preview-body" v-if="selectedImage">
        <img :src="selectedImage.path" :alt="selectedImage.name" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Download, ArrowDown, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

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

// 搜索功能
const searchQuery = ref('')
const previewVisible = ref(false)
const selectedImage = ref(null)

// 过滤图片
const filteredImages = computed(() => {
  if (!searchQuery.value) return props.images

  const query = searchQuery.value.toLowerCase()
  return props.images.filter(img =>
    img.name.toLowerCase().includes(query) ||
    (img.source && img.source.toLowerCase().includes(query))
  )
})

// 格式化文件大小
const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 下载单个图片
const downloadImage = (image) => {
  const link = document.createElement('a')
  link.href = image.path
  link.download = image.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 下载指定压缩包
const handleZipDownload = (url) => {
  downloadZip(url)
}

// 下载所有图片（压缩包）
const downloadAllImages = () => {
  if (props.zipUrls.length > 0) {
    downloadZip(props.zipUrls[0].url)
  } else {
    ElMessage.warning('没有可下载的压缩包')
  }
}

// 下载压缩包
const downloadZip = (url) => {
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      return response.blob()
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = 'images.zip'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    })
    .catch(error => {
      console.error('下载失败:', error)
      ElMessage.error('下载失败: ' + error.message)
    })
}

// 打开图片预览
const openPreview = (image) => {
  selectedImage.value = image
  previewVisible.value = true
}
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

.gallery-filter {
  width: 250px;
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
  gap: 0.25rem;

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
      color: #409EFF;
    }
  }
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
