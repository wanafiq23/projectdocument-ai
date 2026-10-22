import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('../backend/', import.meta.url));

export default defineConfig({
  testDir: './tests',
  globalTeardown: './tests/global-teardown.ts',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 6000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: `${process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'} scripts/serve_test_api.py`, cwd: backendDirectory, url: 'http://127.0.0.1:8001/api/health', reuseExistingServer: false, timeout: 30000 },
    { command: 'npm run dev -- --port 5175', url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 30000, env: { PROJECTDOCUMENTAI_TEST: '1' } },
  ],
});
