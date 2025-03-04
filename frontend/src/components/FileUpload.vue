<template>
  <div class="file-upload">
    <el-upload class="upload-area" drag action="/api/documents/extract-images" :headers="headers"
      :on-success="handleSuccess" :on-error="handleError" :on-progress="handleProgress" :before-upload="beforeUpload"
      :show-file-list="true" :limit="1" accept=".docx,.doc,.pdf" :auto-upload="true" ref="uploadRef">
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">
        拖拽文档到此处或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 .docx、.doc 格式的 Word 文档和 .pdf 格式的 PDF 文件
        </div>
      </template>
    </el-upload>

    <div v-if="isUploading" class="upload-progress">
      <el-progress :percentage="formattedProgress" :stroke-width="8" />
      <p>{{ getProgressText() }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted, computed } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['images-extracted'])

const isUploading = ref(false)
const uploadProgress = ref(0)
let progressTimer = null
const uploadRef = ref(null)
const currentFileName = ref('')
const fileType = ref('')

// 获取进度文本
const getProgressText = () => {
  if (uploadProgress.value < 60) {
    return '正在上传文件...';
  } else if (uploadProgress.value < 85) {
    return fileType.value === 'pdf' ? '正在分析PDF...' : '正在解压文件...';
  } else if (uploadProgress.value < 95) {
    return '正在提取图片...';
  } else {
    return '正在处理图片...';
  }
}

// 上传请求头
const headers = {
  'X-Requested-With': 'XMLHttpRequest'
}

// 上传前的处理
const beforeUpload = (file) => {
  // 检查文件类型
  const isWordDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword';
  const isPdfDoc = file.type === 'application/pdf';

  if (!isWordDoc && !isPdfDoc) {
    ElMessage.error('只能上传Word文档或PDF文件!');
    return false;
  }

  // 设置文件类型
  fileType.value = isPdfDoc ? 'pdf' : 'word';

  // 检查文件大小
  const isLt50M = file.size / 1024 / 1024 < 50;

  if (!isLt50M) {
    ElMessage.error('文件大小不能超过50MB!');
    return false;
  }

  // 保存当前文件名
  currentFileName.value = file.name.replace(/\.[^/.]+$/, ""); // 移除扩展名

  isUploading.value = true;
  uploadProgress.value = 0;

  // 设置初始进度
  uploadProgress.value = 5;

  // 启动模拟进度
  startProgressSimulation(file.size);

  return true;
}

// 模拟进度增长
const startProgressSimulation = (fileSize) => {
  // 清除可能存在的旧定时器
  if (progressTimer) {
    clearInterval(progressTimer);
  }

  // 根据文件大小调整进度增长速度
  const sizeInMB = fileSize / (1024 * 1024);
  const baseInterval = sizeInMB < 5 ? 200 :
    sizeInMB < 20 ? 500 : 1000;

  progressTimer = setInterval(() => {
    if (uploadProgress.value < 60) {
      // 上传阶段 - 快速增长
      uploadProgress.value += 2;
    } else if (uploadProgress.value < 85) {
      // 解压和处理阶段 - 缓慢增长
      uploadProgress.value += 1;
    } else if (uploadProgress.value < 95) {
      // 最终处理阶段 - 非常缓慢
      uploadProgress.value += 0.5;
    } else {
      // 停止在95%，等待实际完成
      clearInterval(progressTimer);
    }
  }, baseInterval);
}

// 上传进度的处理
const handleProgress = (event) => {
  if (event.percent) {
    // 将上传进度映射到0-60%范围
    const calculatedProgress = Math.min(60, Math.floor(event.percent * 0.6));
    // 只有当计算的进度大于当前进度时才更新
    if (calculatedProgress > uploadProgress.value) {
      uploadProgress.value = calculatedProgress;
    }
  }
}

// 上传成功的处理
const handleSuccess = (response) => {
  // 清除进度模拟
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  isUploading.value = false;
  uploadProgress.value = 100;

  if (response.success) {
    ElMessage.success(`成功提取 ${response.images.length} 张图片`);

    // 添加文件名信息
    emit('images-extracted', {
      images: response.images,
      zipUrl: response.zipUrl,
      source: currentFileName.value
    });

    // 重置上传组件，准备下一次上传
    if (uploadRef.value) {
      uploadRef.value.clearFiles();
    }
  } else {
    ElMessage.error(response.message || '图片提取失败');
  }
}

// 上传失败的处理
const handleError = (error) => {
  // 清除进度模拟
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  isUploading.value = false;
  uploadProgress.value = 0;

  console.error('上传错误:', error);
  ElMessage.error('上传失败，请重试');
}

// 组件卸载时清理定时器
onUnmounted(() => {
  if (progressTimer) {
    clearInterval(progressTimer);
  }
})

// 计算格式化后的进度
const formattedProgress = computed(() => {
  return parseFloat(uploadProgress.value).toFixed(1);
})
</script>

<style lang="scss" scoped>
.file-upload {
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

.el-icon--upload {
  font-size: 48px;
  color: var(--primary-color);
  margin-bottom: 16px;
}

.upload-progress {
  margin-top: 1.5rem;

  p {
    margin-top: 0.5rem;
    text-align: center;
    color: var(--text-secondary);
  }
}
</style>