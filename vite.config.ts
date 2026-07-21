import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/ui/',
  plugins: [react()],
  server: {
    proxy: {
      '^/admin/(?!ui)': 'http://127.0.0.1:8080',
      '/health': 'http://127.0.0.1:8080',
    },
  },
})
