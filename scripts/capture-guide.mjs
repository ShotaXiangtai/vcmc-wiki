// 「投稿のしかた」の 1 枚目の画像（site/img/guide/1-copy.png）を、実際の編集画面から撮り直す。
// 使い方: node scripts/capture-guide.mjs   （Playwright のブラウザが必要。Edge を使うなら PW_CHANNEL=msedge）
// 2 枚目以降（*.svg）は GitHub の画面を簡単に描いたイメージ図です。
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8010;
const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), '--port', String(port)], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://localhost:${port}/`).then((r) => r.ok, () => false)) break;
    await wait(100);
  }
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${port}` });
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/edit.html?p=${encodeURIComponent('はじめかた')}`);
  await page.locator('#wpTextbox1').fill('（書き換えた本文）\n');
  await page.locator('#copy-button').click();
  await page.locator('#copy-status.done').waitFor();
  const steps = page.locator('#submit-steps');
  // ①② のボタンを赤い枠で囲む（撮影用。サイトには影響しない）
  await page.evaluate(() => {
    for (const id of ['copy-button', 'github-link']) {
      document.getElementById(id).style.outline = '3px solid #e5534b';
      document.getElementById(id).style.outlineOffset = '3px';
    }
  });
  await steps.screenshot({ path: join(root, 'site', 'img', 'guide', '1-copy.png') });
  await browser.close();
  console.log('site/img/guide/1-copy.png を撮り直しました。');
} finally {
  server.kill();
}
