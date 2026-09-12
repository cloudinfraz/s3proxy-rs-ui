import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  preserveOutput: 'never',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'firefox-smoke', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-smoke', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176/admin/ui/login',
    reuseExistingServer: false,
  },
})
