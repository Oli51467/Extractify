process.env.SASS_SILENCE_DEPRECATIONS = 'legacy-js-api'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

const backendPort = process.env.BACKEND_PORT || '13434'
const backendTarget = process.env.VITE_BACKEND_TARGET || `http://127.0.0.1:${backendPort}`

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendTarget,
        changeOrigin: true,
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 使用新的 API
        sassOptions: {
          outputStyle: 'expanded'
        }
      }
    }
  }
}) 
