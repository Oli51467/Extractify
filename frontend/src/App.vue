<template>
    <div class="app">
        <header class="app-header">
            <div class="container app-nav-row">
                <router-link to="/" class="app-nav-link" :class="{ 'is-active': route.path === '/' }">
                    Extractify
                </router-link>
                <span class="app-title-separator">|</span>
                <router-link to="/mergify" class="app-nav-link" :class="{ 'is-active': route.path === '/mergify' }">
                    Mergify
                </router-link>
            </div>
        </header>

        <main class="app-main">
            <div class="container">
                <router-view />
            </div>
        </main>

        <footer class="app-footer">
            <div class="container">
                <p>© {{ new Date().getFullYear() }} Extractify</p>
            </div>
        </footer>
    </div>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
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
    padding: 1rem 0;

    .container {
        display: flex;
        justify-content: center;
    }
}

.app-nav-row {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: center;
}

.app-nav-link {
    color: var(--text-secondary);
    font-size: 1.5rem;
    font-weight: 500;
    text-decoration: none;
    text-align: center;
    transition: color 0.2s;
}

.app-nav-link:hover {
    color: var(--primary-color);
}

.app-nav-link.is-active {
    color: var(--primary-color);
}

.app-title-separator {
    color: var(--text-tertiary);
    font-size: 1.2rem;
}

.app-main {
    flex: 1;
    padding: 2rem 0;
}

.app-footer {
    background-color: #fff;
    padding: 1rem 0;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.875rem;
}
</style>
