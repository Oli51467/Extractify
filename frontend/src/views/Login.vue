<template>
  <div class="login-page">
    <AppCard class="login-card">
      <template #header>
        <div class="login-title">登录 DocPix</div>
      </template>

      <p v-if="authError" class="login-error">{{ authError }}</p>

      <div v-if="authEnabled && !authenticated" class="login-actions">
        <AppButton
          tone="primary"
          variant="outline"
          block
          :disabled="!googleEnabled"
          @click="handleProviderLogin('google')"
        >
          Google 登录
        </AppButton>
        <AppButton
          tone="neutral"
          variant="outline"
          block
          :disabled="!githubEnabled"
          @click="handleProviderLogin('github')"
        >
          GitHub 登录
        </AppButton>
      </div>

      <div v-else-if="authEnabled && authenticated" class="login-signed">
        <p class="login-welcome">已登录：{{ user?.name || user?.email || '已验证账号' }}</p>
        <div class="signed-actions">
          <AppButton tone="primary" @click="continueToWorkspace">进入工作台</AppButton>
          <AppButton tone="neutral" variant="outline" @click="handleLogout">退出登录</AppButton>
        </div>
      </div>

      <div v-else class="login-disabled">
        <p>当前环境未启用第三方登录，将直接进入工作台。</p>
      </div>
    </AppCard>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { notify } from '../services/notify'
import { startOAuthLogin } from '../services/projectApi'
import { useAuthSession } from '../composables/useAuthSession'
import AppCard from '../components/ui/AppCard.vue'
import AppButton from '../components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const {
  authEnabled,
  authenticated,
  authProviders,
  user,
  refreshSession,
  signOut
} = useAuthSession()

const resolveRedirectPath = (rawValue) => {
  const value = String(rawValue || '').trim()
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

const redirectPath = computed(() => resolveRedirectPath(route.query.redirect))
const authError = computed(() => String(route.query.authError || '').trim())
const googleEnabled = computed(() => Boolean(authProviders.value?.google?.enabled))
const githubEnabled = computed(() => Boolean(authProviders.value?.github?.enabled))

const continueToWorkspace = () => {
  router.replace(redirectPath.value || '/')
}

const handleProviderLogin = (provider) => {
  if (provider === 'google' && !googleEnabled.value) {
    notify.warning('Google 登录未配置')
    return
  }
  if (provider === 'github' && !githubEnabled.value) {
    notify.warning('GitHub 登录未配置')
    return
  }
  startOAuthLogin(provider, redirectPath.value)
}

const handleLogout = async () => {
  try {
    await signOut()
    notify.success('已退出登录')
  } catch (error) {
    notify.error(error.message || '退出登录失败')
  }
}

onMounted(async () => {
  try {
    await refreshSession()
    if (!authEnabled.value) {
      continueToWorkspace()
      return
    }
    if (authenticated.value) {
      continueToWorkspace()
    }
  } catch (error) {
    notify.error(error.message || '获取登录状态失败')
  }
})
</script>

<style lang="scss" scoped>
.login-page {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: min(70vh, 620px);
  padding: 1rem;
}

.login-card {
  max-width: 420px;
  width: 100%;
}

.login-title {
  background: linear-gradient(120deg, #2f5ec9 10%, #4f8cff 45%, #7a57f6 90%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: 'Avenir Next', 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-shadow: 0 8px 18px rgba(79, 140, 255, 0.2);
  width: 100%;
}

.login-error {
  background: #fff3f3;
  border: 1px solid #ffd8d8;
  border-radius: 8px;
  color: #c44545;
  font-size: 0.85rem;
  margin-bottom: 0.9rem;
  padding: 0.55rem 0.7rem;
}

.login-actions {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.login-signed {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.login-welcome {
  color: #3f4b63;
  font-size: 0.9rem;
}

.signed-actions {
  display: flex;
  gap: 0.55rem;
}

.login-disabled {
  color: #72819b;
  font-size: 0.85rem;
}
</style>
