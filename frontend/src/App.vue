<template>
    <div class="app">
        <header class="app-header">
            <div class="container">
                <h1 class="app-title">Extractify</h1>
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

    h1.app-title {
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--primary-color);
        text-align: center;
    }
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