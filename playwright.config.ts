import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemHeadless = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 360000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    ...(fs.existsSync(systemHeadless)
      ? { launchOptions: { executablePath: systemHeadless } }
      : {}),
  },
});
