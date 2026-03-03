<template>
  <div class="share-page">
    <AppCard class="share-card">
      <template #header>
        <div class="share-header">
          <div class="share-title">DocPix Studio Share</div>
        </div>
      </template>

      <div v-if="loading" class="share-loading">加载分享内容中...</div>

      <div v-else-if="share" class="share-content">
        <div class="share-main">{{ share.sourceName || 'Untitled' }}</div>
        <div class="share-meta">
          <span>{{ share.imageCount || 0 }} images</span>
          <span>Created {{ formatDate(share.createdAt) }}</span>
          <span>Expires {{ formatDate(share.expiresAt) }}</span>
        </div>
        <div class="share-actions">
          <AppButton size="sm" @click="downloadShare">Download Zip</AppButton>
          <AppButton size="sm" tone="neutral" variant="outline" @click="copyShareLink">Copy Link</AppButton>
        </div>
      </div>

      <AppEmpty v-else :description="errorMessage || '分享链接不存在或已失效'" />
    </AppCard>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchShareDetail } from '../services/projectApi'
import { notify } from '../services/notify'
import { formatDate } from '../utils/formatters'
import AppCard from '../components/ui/AppCard.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppEmpty from '../components/ui/AppEmpty.vue'

const route = useRoute()
const loading = ref(false)
const share = ref(null)
const errorMessage = ref('')

const toAbsoluteUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`
  return `${window.location.origin}/${raw}`
}

const loadShare = async () => {
  const token = String(route.params?.token || '').trim()
  if (!token) {
    share.value = null
    errorMessage.value = '无效的分享标识'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    share.value = await fetchShareDetail(token)
  } catch (error) {
    share.value = null
    errorMessage.value = error.message || '加载分享失败'
  } finally {
    loading.value = false
  }
}

const downloadShare = () => {
  const downloadUrl = toAbsoluteUrl(share.value?.downloadUrl)
  if (!downloadUrl) {
    notify.warning('下载链接无效')
    return
  }
  window.open(downloadUrl, '_blank', 'noopener')
}

const copyShareLink = async () => {
  const url = toAbsoluteUrl(share.value?.url || window.location.href)
  try {
    await navigator.clipboard.writeText(url)
    notify.success('分享链接已复制')
  } catch (error) {
    notify.warning('复制失败，请手动复制浏览器地址')
  }
}

watch(
  () => route.params?.token,
  () => {
    loadShare()
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.share-page {
  display: flex;
  justify-content: center;
}

.share-card {
  max-width: 760px;
  width: 100%;
}

.share-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.share-title {
  color: #253450;
  font-size: 0.95rem;
  font-weight: 700;
}

.share-loading {
  color: #70809d;
  font-size: 0.9rem;
}

.share-content {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.share-main {
  color: #1f2f4c;
  font-size: 1.05rem;
  font-weight: 700;
}

.share-meta {
  color: #74839f;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.82rem;
  gap: 0.55rem;
}

.share-actions {
  display: flex;
  gap: 0.55rem;
}
</style>
