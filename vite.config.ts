import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'

export function policyDocumentBypass(request: Pick<IncomingMessage, 'method' | 'url' | 'headers'>) {
  return request.method === 'GET'
    && request.url?.split('?')[0] === '/admin/ui/policies'
    && request.headers.accept?.includes('text/html')
    ? '/index.html'
    : undefined
}

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/ui/',
  plugins: [react()],
  server: {
    proxy: {
      '^/admin/ui/(backends(?:/|$|\\?)|virtual-buckets(?:/|$|\\?)|mapping-backends/|roles(?:/|$|\\?)|role-policies(?:$|\\?)|identities(?:/|$|\\?)|policies(?:/|$|\\?)|bucket-policies(?:/|$|\\?))': { target: 'http://127.0.0.1:8080', changeOrigin: false, bypass: request => policyDocumentBypass(request) },
      '^/admin/(?!ui)': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/health': 'http://127.0.0.1:8080',
    },
  },
})
