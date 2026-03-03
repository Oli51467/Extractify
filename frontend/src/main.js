import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Share from './views/Share.vue'

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
    }
  ]
})

// 创建应用
const app = createApp(App)

app.use(router)

// 挂载应用
app.mount('#app') 
