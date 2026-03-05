import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Share from './views/Share.vue'
import Login from './views/Login.vue'
import { fetchSessionState } from './services/projectApi'

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'DocPixExtract',
      component: Home
    },
    {
      path: '/mergify',
      name: 'DocPixMerge',
      component: Home
    },
    {
      path: '/share/:token',
      name: 'DocPixShare',
      component: Share
    },
    {
      path: '/login',
      name: 'DocPixLogin',
      component: Login
    }
  ]
})

router.beforeEach(async (to) => {
  if (to.name === 'DocPixShare' || to.name === 'DocPixLogin') {
    return true
  }

  try {
    const session = await fetchSessionState()
    if (!session?.auth?.enabled || session.authenticated) {
      return true
    }
  } catch (error) {
    // 忽略网络波动，统一引导到登录页
  }

  return {
    name: 'DocPixLogin',
    query: {
      redirect: to.fullPath
    }
  }
})

// 创建应用
const app = createApp(App)

app.use(router)

// 挂载应用
app.mount('#app') 
