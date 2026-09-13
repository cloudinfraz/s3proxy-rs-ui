import { defineConfig, devices } from '@playwright/test'

export const accessibilityTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

export default defineConfig({
  testDir: './e2e',
  testMatch: 'accessibility.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  preserveOutput: 'never',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4175',
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/admin/ui/login',
    reuseExistingServer: false,
  },
})
