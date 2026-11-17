// サイトの画面テスト（npm run test:e2e）
// ブラウザは Playwright の Chromium（npx playwright install chromium）か、
// インストール済みの Edge / Chrome を使う（環境変数 PW_CHANNEL=msedge または chrome）。
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: 'test-results/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8000',
    channel: process.env.PW_CHANNEL || undefined,
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/build-index.mjs && node scripts/serve.mjs --port 8000',
    url: 'http://localhost:8000/',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
