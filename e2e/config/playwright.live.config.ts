import { defineConfig } from '@playwright/test'
import { env } from 'node:process'

env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

const remoteBaseURL = env.UI_E2E_BASE_URL

export default defineConfig({
  testDir: '../live',
  grep: env.UI_E2E_BACKEND_COORDINATED === '1' ? undefined : /UI068-LIVE|UI078-LIVE/,
  outputDir: '/tmp/s3proxy-ui-live-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  preserveOutput: 'never',
  use: {
    baseURL: remoteBaseURL ?? 'http://127.0.0.1:4174',
    actionTimeout: 15_000,
    ignoreHTTPSErrors: remoteBaseURL?.startsWith('https://') ?? false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: remoteBaseURL ? undefined : {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/admin/ui/login',
    reuseExistingServer: false,
  },
})