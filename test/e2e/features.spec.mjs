// 追加機能の画面テスト：最終更新・最近の更新・カテゴリ・リンク元・全文検索・承認待ち・下書き・ひな形・コピー・ダークモード
import { test, expect } from '@playwright/test';

const SHOTS = 'test-results/screenshots';
const enc = encodeURIComponent;
const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText()).then((t) => t.split(String.fromCharCode(13)).join(''));

async function setup(page, context) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  if (context) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8000' });
  return { errors };
}

test.describe('最終更新と最近の更新', () => {
  test('記事のフッターに最終更新が出て、最近の更新ページに並ぶ', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('はじめかた')}`);
    await expect(page.locator('#footer-info-lastmod')).toContainText(/このページの最終更新は \d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2} です/);

    await page.locator('#n-recentchanges a').click();
    await expect(page.locator('#firstHeading')).toHaveText('最近の更新');
    await expect(page.locator('h4.recent-day').first()).toHaveText(/\d{4}年\d{1,2}月\d{1,2}日/);
    const items = page.locator('ul.recent-list li');
    expect(await items.count()).toBeGreaterThanOrEqual(14);
    await expect(items.first().locator('a').first()).toHaveAttribute('href', /\?p=/);
    await page.screenshot({ path: `${SHOTS}/30-recent.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});

test.describe('カテゴリとリンク元', () => {
  test('記事の下のカテゴリ欄から、カテゴリのページとカテゴリ一覧に行ける', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('はじめかた')}`);
    const box = page.locator('.catlinks');
    await expect(box).toBeVisible();
    await expect(box.locator('li a')).toHaveText(['入門']);
    await expect(page.locator('#mw-content-text')).not.toContainText('[[カテゴリ:');
    await box.locator('li a', { hasText: '入門' }).click();
    await expect(page.locator('#firstHeading')).toHaveText('カテゴリ: 入門');
    await expect(page.locator('.mw-allpages-chunk a', { hasText: 'はじめかた' })).toBeVisible();

    await page.locator('#n-categories a').click();
    await expect(page.locator('#firstHeading')).toHaveText('カテゴリ一覧');
    await expect(page.locator('.category-list li', { hasText: 'Wikiの使い方' })).toContainText('(7)');
    await expect(page.locator('#mw-content-text h2', { hasText: 'カテゴリが付いていないページ' })).toBeVisible();
    await expect(page.locator('#mw-content-text a', { hasText: 'メインページ' }).last()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/31-categories.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('ツールの「リンク元」で、このページにリンクしているページが見られる', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('はじめかた')}`);
    await page.locator('#t-backlinks a').click();
    await expect(page.locator('#firstHeading')).toHaveText('「はじめかた」のリンク元');
    await expect(page.locator('.mw-allpages-chunk a', { hasText: 'メインページ' })).toBeVisible();
    await expect(page.locator('.mw-allpages-chunk a', { hasText: 'テストページ' })).toBeVisible();
    await page.goto(`/?special=backlinks&p=${enc('だれもリンクしていないページ')}`);
    await expect(page.locator('.results-info')).toContainText('リンクしているページはありません');
    expect(errors).toEqual([]);
  });
});

test.describe('全文検索と承認待ち', () => {
  test('本文の奥にある言葉でも見つかり、前後の文が出る', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?search=${enc('エンダードラゴン')}`);
    await expect(page.locator('#firstHeading')).toHaveText('検索結果');
    const result = page.locator('.mw-search-result', { hasText: 'テストページ' });
    await expect(result).toBeVisible();
    await expect(result.locator('.searchmatch')).toHaveText('エンダードラゴン');
    expect(errors).toEqual([]);
  });

  test('承認待ちの投稿を GitHub から読んで並べる（失敗したら GitHub へのリンク）', async ({ page }) => {
    const { errors } = await setup(page);
    let fail = false;
    await page.route('https://api.github.com/repos/**', (route) => {
      if (fail) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"rate limit"}' });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { number: 12, title: '[編集] はじめかた', html_url: 'https://github.com/ShotaXiangtai/vcmc-wiki/pull/12', user: { login: 'steve' }, created_at: '2026-11-18T03:00:00Z' },
          { number: 11, title: 'Create 村人の取引.md', html_url: 'https://github.com/ShotaXiangtai/vcmc-wiki/pull/11', user: { login: 'alex' }, created_at: '2026-11-17T10:00:00Z' },
        ]),
      });
    });
    await page.goto('/');
    await page.locator('#t-pulls a').click();
    await expect(page.locator('#firstHeading')).toHaveText('承認待ちの投稿');
    await expect(page.locator('.pending-list li')).toHaveCount(2);
    await expect(page.locator('.pending-list li').first()).toContainText('#12・steve');
    await expect(page.locator('.pending-list a').first()).toHaveAttribute('href', 'https://github.com/ShotaXiangtai/vcmc-wiki/pull/12');
    await page.screenshot({ path: `${SHOTS}/32-pending.png` });

    fail = true;
    await page.reload();
    await expect(page.locator('.pending-box .mw-message-box-warning')).toContainText('読み込めませんでした');
    expect(errors.filter((e) => !/status of 403/.test(e))).toEqual([]);
  });
});

test.describe('編集画面の追加機能', () => {
  test('下書きが自動で保存され、次に開いたときに戻せる・捨てられる', async ({ page, context }) => {
    await setup(page, context);
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    const ta = page.locator('#wpTextbox1');
    await ta.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n下書きのテスト');
    await expect(page.locator('#draft-status')).toContainText('下書きを自動保存しました');

    page.on('dialog', (d) => d.accept());
    await page.reload();
    await expect(page.locator('.draft-notice')).toContainText('前に書いていた下書きがあります');
    await expect(ta).not.toHaveValue(/下書きのテスト/);
    await page.locator('#draft-use').click();
    await expect(ta).toHaveValue(/下書きのテスト$/);
    await expect(page.locator('.draft-notice')).toHaveCount(0);

    await page.reload();
    await page.locator('#draft-discard').click();
    await page.reload();
    await expect(page.locator('.draft-notice')).toHaveCount(0);
  });

  test('新しいページはひな形から書き始められる（既存ページには出ない）', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/edit.html?p=${enc('新しい攻略')}`);
    await expect(page.locator('.template-button')).toHaveCount(5);
    await page.locator('.template-button', { hasText: '攻略' }).click();
    await expect(page.locator('#wpTextbox1')).toHaveValue(/## やり方[\s\S]*\[\[カテゴリ:攻略\]\]/);
    await page.getByRole('tab', { name: 'プレビュー' }).click();
    await expect(page.locator('#wikiPreview .catlinks')).toContainText('攻略');
    await page.screenshot({ path: `${SHOTS}/33-template.png`, fullPage: true });

    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await expect(page.locator('.template-bar')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('コードの「コピー」ボタンと、/ で始まるコマンドのクリックでコピーできる', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/?p=${enc('テストページ')}`);
    const block = page.locator('.code-block').first();
    await block.locator('.code-copy').click();
    await expect(block.locator('.code-copy-status')).toHaveText('コピーしました');
    expect(await readClipboard(page)).toBe('/hub\n/rules');
    const cmd = page.locator('code.cmd', { hasText: '/rules' }).first();
    await cmd.click();
    await expect(cmd).toHaveClass(/copied/);
    expect(await readClipboard(page)).toBe('/rules');
    expect(errors).toEqual([]);
  });
});

test.describe('ダークモード', () => {
  test('自動 → ライト → ダークと切り替えられ、次に開いても覚えている', async ({ page }) => {
    const { errors } = await setup(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const toggle = page.locator('#pt-theme .theme-toggle');
    await expect(toggle).toHaveText('🌓 表示：自動');
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('#content')).backgroundColor);
    expect(await bg()).toBe('rgb(255, 255, 255)');
    await toggle.click();
    await expect(toggle).toHaveText('☀ 表示：ライト');
    await toggle.click();
    await expect(toggle).toHaveText('🌙 表示：ダーク');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe('rgb(27, 30, 34)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe('rgb(27, 30, 34)');
    await page.goto(`/?p=${enc('テストページ')}`);
    await page.screenshot({ path: `${SHOTS}/34-dark.png`, fullPage: true });
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await page.screenshot({ path: `${SHOTS}/35-dark-edit.png` });
    await page.locator('#pt-theme .theme-toggle').click(); // → 自動
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
    expect(errors).toEqual([]);
  });

  test('「自動」では端末のダーク設定に合わせる', async ({ page }) => {
    await setup(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#content')).backgroundColor)).toBe('rgb(27, 30, 34)');
  });
});
