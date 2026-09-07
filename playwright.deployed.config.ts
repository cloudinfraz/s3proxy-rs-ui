import { defineConfig } from '@playwright/test'
import { env } from 'node:process'

const baseURL = env.DEPLOYED_UI_BASE_URL
if (!baseURL) throw new Error('DEPLOYED_UI_BASE_URL is required')

export default defineConfig({
  testDir: './e2e/deployed',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  preserveOutput: 'never',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})