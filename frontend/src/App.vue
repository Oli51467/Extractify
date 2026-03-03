<template>
    <div class="app">
        <header class="app-header">
            <div class="container app-brand-row">
                <h1 class="app-brand">
                    <AppBrandLogo />
                </h1>
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
import AppToastViewport from './components/ui/AppToastViewport.vue'
import AppDialogHost from './components/ui/AppDialogHost.vue'
import AppBrandLogo from './components/ui/AppBrandLogo.vue'
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
    }
}

.app-brand-row {
    align-items: center;
    display: flex;
    justify-content: center;
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
    .app-main .container {
        max-width: calc(100vw - 24px);
    }
}
</style>
