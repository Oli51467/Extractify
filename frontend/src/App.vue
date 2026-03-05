<template>
    <div class="app">
        <header class="app-header">
            <div class="container app-brand-row">
                <h1 class="app-brand">
                    <AppBrandLogo />
                </h1>
                <div
                    v-if="authEnabled"
                    ref="authMenuRef"
                    class="app-auth-actions"
                >
                    <template v-if="authenticated">
                        <button
                            type="button"
                            class="auth-menu-trigger"
                            :class="{ 'is-open': authMenuOpen }"
                            :aria-expanded="authMenuOpen ? 'true' : 'false'"
                            @click.stop="toggleAuthMenu"
                        >
                            <img
                                v-if="user?.avatarUrl"
                                :src="user.avatarUrl"
                                alt="avatar"
                                class="auth-avatar"
                            />
                            <span class="auth-user-name">{{ userDisplayName }}</span>
                            <AppIcon class="auth-menu-arrow" name="chevronDown" />
                        </button>
                        <div
                            v-if="authMenuOpen"
                            class="auth-dropdown"
                            @click.stop
                        >
                            <button
                                type="button"
                                class="auth-dropdown-item"
                                @click="handleLogout"
                            >
                                退出登录
                            </button>
                        </div>
                    </template>
                    <AppButton
                        v-else-if="!isLoginPage"
                        size="sm"
                        tone="primary"
                        variant="outline"
                        @click="goToLogin"
                    >
                        登录
                    </AppButton>
                </div>
            </div>
        </header>

        <main class="app-main">
            <div class="container">
                <router-view />
            </div>
        </main>

        <footer class="app-footer">
            <div class="container">
                <p>© {{ new Date().getFullYear() }} DocPix Studio</p>
            </div>
        </footer>

        <AppToastViewport />
        <AppDialogHost />
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppToastViewport from './components/ui/AppToastViewport.vue'
import AppDialogHost from './components/ui/AppDialogHost.vue'
import AppBrandLogo from './components/ui/AppBrandLogo.vue'
import AppButton from './components/ui/AppButton.vue'
import AppIcon from './components/ui/AppIcon.vue'
import { notify } from './services/notify'
import { useAuthSession } from './composables/useAuthSession'

const route = useRoute()
const router = useRouter()
const {
    authEnabled,
    authenticated,
    user,
    refreshSession,
    signOut
} = useAuthSession()

const isLoginPage = computed(() => route.name === 'DocPixLogin')
const userDisplayName = computed(() => user.value?.name || user.value?.email || '已登录用户')
const authMenuOpen = ref(false)
const authMenuRef = ref(null)

const closeAuthMenu = () => {
    authMenuOpen.value = false
}

const toggleAuthMenu = () => {
    authMenuOpen.value = !authMenuOpen.value
}

const goToLogin = () => {
    router.push({
        name: 'DocPixLogin',
        query: {
            redirect: route.fullPath || '/'
        }
    }).catch(() => {})
}

const handleLogout = async () => {
    closeAuthMenu()
    try {
        await signOut()
        notify.success('已退出登录')
        goToLogin()
    } catch (error) {
        notify.error(error.message || '退出登录失败')
    }
}

const handleClickOutside = (event) => {
    if (!authMenuRef.value) return
    if (authMenuRef.value.contains(event.target)) return
    closeAuthMenu()
}

onMounted(() => {
    refreshSession().catch(() => {})
    document.addEventListener('click', handleClickOutside, true)
})

onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside, true)
})

watch(
    () => route.fullPath,
    () => {
        refreshSession().catch(() => {})
        closeAuthMenu()
    }
)

watch(authenticated, (value) => {
    if (!value) {
        closeAuthMenu()
    }
})
</script>

<style lang="scss">
:root {
    --primary-color: #409eff;
    --text-primary: #303133;
    --text-secondary: #606266;
    --text-tertiary: #909399;
    --border-color: #dcdfe6;
    --background-color: #f5f7fa;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: var(--text-primary);
    background-color: var(--background-color);
    line-height: 1.5;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
}

.app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.app-header {
    background-color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 0.9rem 0;

    .container {
        display: flex;
        justify-content: center;
        max-width: 100%;
        position: relative;
        width: 100%;
        padding: 0;
    }
}

.app-brand-row {
    align-items: center;
    display: flex;
    justify-content: center;
    min-height: 38px;
}

.app-brand {
    align-items: center;
    display: inline-flex;
    line-height: 1;
    margin: 0;
}

.app-main {
    flex: 1;
    padding: 2rem 0;
}

.app-auth-actions {
    align-items: center;
    display: flex;
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
}

.auth-menu-trigger {
    align-items: center;
    background: #f5f8ff;
    border: 1px solid #dce6fb;
    border-radius: 999px;
    color: #3f4f6f;
    cursor: pointer;
    display: inline-flex;
    gap: 0.42rem;
    max-width: min(320px, 38vw);
    padding: 0.24rem 0.62rem 0.24rem 0.3rem;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.auth-menu-trigger:hover {
    background: #edf3ff;
    border-color: #c9d9fa;
}

.auth-menu-trigger.is-open {
    background: #edf3ff;
    border-color: #bed1f9;
}

.auth-avatar {
    border-radius: 50%;
    flex-shrink: 0;
    height: 24px;
    object-fit: cover;
    width: 24px;
}

.auth-user-name {
    color: #3f4f6f;
    font-size: 0.79rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.auth-menu-arrow {
    color: #6f7f9c;
    font-size: 0.85rem;
    transition: transform 0.15s ease;
}

.auth-menu-trigger.is-open .auth-menu-arrow {
    transform: rotate(180deg);
}

.auth-dropdown {
    background: #fff;
    border: 1px solid #dce4f4;
    border-radius: 10px;
    box-shadow: 0 16px 28px -18px rgba(15, 26, 45, 0.35);
    min-width: 132px;
    padding: 0.3rem;
    position: absolute;
    right: 0;
    top: calc(100% + 0.45rem);
    z-index: 50;
}

.auth-dropdown-item {
    background: transparent;
    border: none;
    border-radius: 8px;
    color: #3f4f6f;
    cursor: pointer;
    display: block;
    font-size: 0.84rem;
    padding: 0.42rem 0.55rem;
    text-align: left;
    width: 100%;
}

.auth-dropdown-item:hover {
    background: #f3f7ff;
    color: #2f66d2;
}

.app-main .container {
    max-width: min(1680px, calc(100vw - 56px));
    padding: 0;
}

.app-footer {
    background-color: #fff;
    padding: 1rem 0;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.875rem;
}

@media (max-width: 768px) {
    .auth-user-name {
        display: none;
    }

    .app-main .container {
        max-width: calc(100vw - 24px);
    }
}
</style>
