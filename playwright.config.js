const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:9876',
    headless: true,
  },
  webServer: {
    command: 'python3 -m http.server 9876',
    url: 'http://localhost:9876',
    reuseExistingServer: true,
    timeout: 10000,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
});
