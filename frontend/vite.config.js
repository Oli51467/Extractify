process.env.SASS_SILENCE_DEPRECATIONS = 'legacy-js-api'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

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
        target: 'http://localhost:13434',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:13434',
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
