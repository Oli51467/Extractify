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
        <div class="image-container">
          <img :src="image.path" :alt="image.name" />
        </div>
        <div class="image-info">
          <span class="image-name">{{ image.name }}</span>
          <span class="image-size">{{ formatSize(image.size) }}</span>
          <span class="image-source" v-if="image.source">{{ image.source }}</span>
        </div>
        <div class="image-actions">
          <el-button type="primary" size="small" @click="downloadImage(image)">
            <el-icon>
              <download />
            </el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <div v-else class="no-images">
      <el-empty description="暂无图片" />
    </div>
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
  ElMessage.success(`正在下载 ${image.name}`)
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
      ElMessage.success('正在下载图片压缩包')
    })
    .catch(error => {
      console.error('下载失败:', error)
      ElMessage.error('下载失败: ' + error.message)
    })
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

  .image-name {
    font-size: 0.875rem;
    color: #303133;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .image-size {
    font-size: 0.75rem;
    color: #909399;
    margin-top: 0.25rem;
  }

  .image-source {
    font-size: 0.75rem;
    color: #409EFF;
    margin-top: 0.25rem;
  }
}

.image-actions {
  padding: 0.5rem;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #ebeef5;
}

.no-images {
  padding: 2rem;
  display: flex;
  justify-content: center;
}
</style>