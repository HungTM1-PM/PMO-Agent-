// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '3456';
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ...(process.env.CI ? [] : [['html', { open: 'never', outputFolder: 'playwright-report' }]]),
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Firefox arm64 ổn định trên Apple Silicon; Chromium có thể thiếu binary nếu cache tải nhầm x64
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }],
  webServer: {
    command: `node server/index.js`,
    url: baseURL + '/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT,
      USE_MEMORY_STORE: '1',
      JWT_SECRET: 'e2e-playwright-jwt-secret',
      CLAUDE_API_KEY: 'sk-e2e-placeholder',
      REGISTER_OPEN: 'true',
    },
  },
});
