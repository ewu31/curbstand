import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir: './live-tests',
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4321' },
  webServer: {
    command: 'npm run dev -- --port 4321 --ignore-lock',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
    env: { ...process.env, PUBLIC_DATA_SOURCE: 'api', PUBLIC_API_BASE: 'http://127.0.0.1:8787' },
  },
});
