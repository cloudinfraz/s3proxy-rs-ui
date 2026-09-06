import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/ui/',
  plugins: [react()],
  server: {
    proxy: {
      '^/admin/ui/(roles(?:/|$|\\?)|role-policies(?:$|\\?)|identities(?:$|\\?))': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '^/admin/(?!ui)': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/health': 'http://127.0.0.1:8080',
    },
  },
})
