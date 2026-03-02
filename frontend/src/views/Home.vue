<template>
    <div class="home">
        <el-card class="upload-card">
            <FileUpload @images-extracted="handleImagesExtracted" />
        </el-card>

        <el-card v-if="allImages.length > 0" class="gallery-card">
            <template #header>
                <div class="card-header">
                    <div class="header-content">
                        <h2>图片预览 (共{{ allImages.length }}张)</h2>
                        <el-button type="danger" plain circle @click="clearAllImages" title="清空所有图片">
                            <el-icon>
                                <delete />
                            </el-icon>
                        </el-button>
                    </div>
                </div>
            </template>
            <ImageGallery :images="allImages" :zip-urls="zipUrls" />
        </el-card>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import FileUpload from '../components/FileUpload.vue'
import ImageGallery from '../components/ImageGallery.vue'
import { Delete } from '@element-plus/icons-vue'

// 存储所有图片和压缩包URL
const allImages = ref([])
const zipUrls = ref([])
// 跟踪当前图片编号
const currentImageNumber = ref(1)

const buildZipFileName = (sourceName) => {
    const safeName = (sourceName || 'images')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim()
    return `${safeName || 'images'}.zip`
}

// 处理新提取的图片
const handleImagesExtracted = (data) => {
    if (data.images && data.images.length > 0) {
        // 使用简单的数字序列为图片编号
        const newImages = data.images.map((img) => {
            const imageId = currentImageNumber.value++
            return {
                ...img,
                id: imageId, // 使用简单的数字编号
                name: img.name.replace(/^image_\d+_\d+_\d+/, `image_${imageId}`), // 更新文件名中的编号
                source: data.source || '未命名文档'
            }
        })

        // 添加新图片到列表
        allImages.value = [...allImages.value, ...newImages]

        // 添加新的压缩包URL
        if (data.zipUrl) {
            zipUrls.value.push({
                url: data.zipUrl,
                name: data.source || '未命名文档',
                count: data.images.length,
                jobId: data.jobId || '',
                fileName: buildZipFileName(data.source)
            })
        }
    }
}

// 清空所有图片
const clearAllImages = () => {
    allImages.value = []
    zipUrls.value = []
    // 重置图片编号
    currentImageNumber.value = 1
}
</script>

<style lang="scss" scoped>
.home {
    display: flex;
    flex-direction: column;
    gap: 2rem;
}

.card-header {
    margin-bottom: 1rem;

    h2 {
        margin: 0;
        font-weight: 500;
        color: var(--text-primary);
    }
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.upload-card,
.gallery-card {
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
</style>
