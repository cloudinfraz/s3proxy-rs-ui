import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  preserveOutput: 'never',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/admin/ui/login',
    reuseExistingServer: false,
  },
})