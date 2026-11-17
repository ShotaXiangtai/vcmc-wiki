// サイトの画面テスト。GitHub へのアクセスはモックする（外部には接続しない）。
// スクリーンショットは test-results/screenshots/ に保存する。
import { test, expect } from '@playwright/test';

const SHOTS = 'test-results/screenshots';
const REPO = 'https://github.com/ShotaXiangtai/vcmc-wiki';
const enc = encodeURIComponent;

/** クリップボードの中身（Windows は改行が CRLF になるので LF にそろえる） */
const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText()).then((t) => t.split(String.fromCharCode(13)).join(''));

/** 共通の準備：エラーの記録、GitHub へのアクセスのモック、クリップボードの許可 */
async function setup(page, context) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  if (context) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8000' });
    await context.route('https://github.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>GitHub（モック）</title><p>GitHub のモック</p>' }));
  }
  return { errors };
}

test.describe('閲覧', () => {
  test('メインページが Wikipedia 風に表示される', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto('/');
    await expect(page.locator('#firstHeading')).toHaveText('メインページ');
    await expect(page).toHaveTitle('VoiceMC Wiki');
    await expect(page.locator('#siteSub')).toHaveText('出典: VoiceMC Wiki');
    await expect(page.locator('#p-logo .logo-name')).toHaveText('VoiceMC Wiki');
    await expect(page.locator('#ca-view')).toHaveClass(/selected/);
    await expect(page.locator('#ca-edit a')).toHaveAttribute('href', `edit.html?p=${enc('メインページ')}`);
    await expect(page.locator('#ca-history a')).toHaveAttribute(
      'href', `${REPO}/commits/main/site/pages/${enc('メインページ')}.md`);
    await expect(page.locator('#mw-content-text table.wikitable')).toBeVisible();

    // 見た目：h1 の下線、明朝系の見出し、青いリンク、本文の箱の左の青い線
    const style = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        h1Border: cs('#firstHeading').borderBottomStyle,
        h1Font: cs('#firstHeading').fontFamily,
        h2Font: cs('#mw-content-text > h2').fontFamily,
        link: cs('#mw-content-text a.wikilink:not(.new)').color,
        contentBorder: cs('#content').borderLeftColor,
        bg: cs('body').backgroundColor,
      };
    });
    expect(style.h1Border).toBe('solid');
    expect(style.h1Font).toMatch(/Georgia|Mincho/);
    expect(style.h2Font).toMatch(/Georgia|Mincho/);
    expect(style.link).toBe('rgb(6, 69, 173)');
    expect(style.contentBorder).toBe('rgb(167, 215, 249)');
    expect(style.bg).toBe('rgb(246, 246, 246)');

    // ロゴ・ライセンス・Minecraft の注意書き・メニュー
    expect(await page.locator('#p-logo img').evaluate((img) => img.naturalWidth)).toBe(192);
    await expect(page.locator('#footer-info-license')).toContainText('CC BY-SA 4.0');
    await expect(page.locator('#footer-info-license a[rel~="license"]')).toHaveAttribute('href', /creativecommons\.org\/licenses\/by-sa\/4\.0/);
    await expect(page.locator('#footer-info-minecraft')).toContainText('Mojang');
    await expect(page.locator('#n-howto a')).toHaveText('投稿のしかた');
    await expect(page.locator('#n-terms a')).toHaveText('利用規約');

    await page.screenshot({ path: `${SHOTS}/01-main-page.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('内部リンクは青、存在しないページは赤リンクで作成画面へ', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto('/');
    const blue = page.locator('#mw-content-text a.wikilink', { hasText: 'はじめかた' }).first();
    await expect(blue).not.toHaveClass(/new/);
    await expect(blue).toHaveAttribute('href', `./?p=${enc('はじめかた')}`);

    const red = page.locator('#mw-content-text a.wikilink.new', { hasText: 'サーバーのルール' }).first();
    await expect(red).toHaveAttribute('href', `edit.html?p=${enc('サーバーのルール')}`);
    await expect(red).toHaveAttribute('title', 'サーバーのルール（存在しないページ）');
    expect(await red.evaluate((a) => getComputedStyle(a).color)).toBe('rgb(186, 0, 0)');

    await red.click();
    await expect(page).toHaveURL(/edit\.html\?p=/);
    await expect(page.locator('#firstHeading')).toHaveText('「サーバーのルール」を作成中');
    await expect(page.locator('#wpTitle')).toHaveValue('サーバーのルール');
    await expect(page.locator('#wpTitle')).not.toHaveAttribute('readonly', '');
    await expect(page.locator('#ca-create')).toHaveClass(/selected/);
    expect(errors).toEqual([]);
  });

  test('見出しが 3 つ以上あると目次ができる', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('はじめかた')}`);
    const toc = page.locator('#toc');
    await expect(toc).toBeVisible();
    await expect(toc.locator('.toctitle h2')).toHaveText('目次');
    const numbers = await toc.locator('.tocnumber').allTextContents();
    expect(numbers).toEqual(['1', '1.1', '2', '3', '4']);
    await expect(toc.locator('.toctext').nth(1)).toHaveText('ボイスチャットを使うには');

    const order = await page.evaluate(() => [...document.querySelector('#mw-content-text').children].map((e) => e.id || e.tagName).slice(0, 4));
    expect(order[0]).toBe('P');
    expect(order.indexOf('toc')).toBeLessThan(order.indexOf('参加のしかた'));

    await toc.locator('a', { hasText: '便利なコマンド' }).click();
    await expect(page).toHaveURL(new RegExp(`#${enc('便利なコマンド')}$`));

    await toc.locator('.toctoggle').click();
    await expect(toc.locator('> ul')).toBeHidden();
    await expect(toc.locator('.toctoggle')).toHaveText('表示');
    expect(errors).toEqual([]);
  });

  test('外部リンクは別タブ・noopener noreferrer nofollow', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    const ext = page.locator('#mw-content-text a[href="https://www.vcmc.jp/"]');
    await expect(ext).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(ext).toHaveAttribute('target', '_blank');
    await expect(ext).toHaveClass(/external/);
    await expect(page.locator('#mw-content-text a.wikilink').first()).not.toHaveAttribute('target', '_blank');
  });

  test('存在しないページは「このページを作成する」を出す', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('まだ無いページ')}`);
    await expect(page.locator('#firstHeading')).toHaveText('まだ無いページ');
    await expect(page.locator('.noarticletext')).toContainText('という名前のページはありません');
    await expect(page.locator('#create-page-link')).toHaveAttribute('href', `edit.html?p=${enc('まだ無いページ')}`);
    await expect(page.locator('#ca-history')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/02-missing-page.png` });
    expect(errors).toEqual([]);
  });

  test('不正なページ名はエラー表示', async ({ page }) => {
    await setup(page);
    await page.goto(`/?p=${enc('../etc/passwd')}`);
    await expect(page.locator('#firstHeading')).toHaveText('不正なページ名');
  });

  test('全ページ一覧・検索・おまかせ表示', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto('/?special=all');
    await expect(page.locator('#firstHeading')).toHaveText('全ページ一覧');
    await expect(page.locator('.mw-allpages-chunk li')).toHaveCount(7);

    await page.locator('#searchInput').fill('サーバー');
    await page.locator('#searchInput').press('Enter');
    await expect(page.locator('#firstHeading')).toHaveText('検索結果');
    await expect(page.locator('.mw-search-result')).not.toHaveCount(0);
    await expect(page.locator('.searchmatch').first()).toHaveText('サーバー');
    await expect(page.locator('.mw-search-createlink a.new')).toHaveText('サーバー');
    await page.screenshot({ path: `${SHOTS}/03-search.png` });

    await page.goto(`/?search=${enc('はじめかた')}`);
    await expect(page).toHaveURL(new RegExp(`\\?p=${enc('はじめかた')}$`));

    await page.goto(`/?search=${enc('ぜったいに無い言葉')}`);
    await expect(page.locator('.mw-search-nonefound')).toBeVisible();

    await page.goto('/?special=random');
    await expect(page).toHaveURL(/\?p=/);
    await expect(page.locator('#firstHeading')).not.toHaveText('');
    expect(errors).toEqual([]);
  });

  test('利用規約・ライセンス・投稿のしかたのページ', async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto(`/?p=${enc('利用規約')}`);
    await expect(page.locator('#mw-content-text > h2').first()).toHaveText('第1条 本 Wiki について');
    await expect(page.locator('#mw-content-text')).toContainText('CC BY-SA 4.0');
    await page.goto(`/?p=${enc('ライセンス')}`);
    await expect(page.locator('#mw-content-text')).toContainText('出典：VoiceMC Wiki');
    await expect(page.locator('#mw-content-text a[href*="legalcode.ja"]')).toHaveAttribute('rel', /noopener/);
    await page.goto(`/?p=${enc('投稿のしかた')}`);
    const imgs = page.locator('#mw-content-text img');
    await expect(imgs).toHaveCount(6);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `${SHOTS}/04-howto.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});

test.describe('埋め込み（X・YouTube）とスキン', () => {
  // 1x1 の PNG（mc-heads.net の代わり）
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  async function mockServices(page) {
    const external = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/platform\.(x|twitter)\.com|youtube-nocookie\.com|mc-heads\.net/.test(u)) external.push(u);
    });
    await page.route('https://platform.x.com/widgets.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `window.twttr = { ready: function (f) { f(window.twttr); }, widgets: { createTweet: function (id, el, opts) {
        window.__tweetOpts = opts;
        if (id === '404') return Promise.resolve(undefined);
        var d = document.createElement('div'); d.className = 'mock-tweet'; d.textContent = 'ポスト ' + id; el.appendChild(d);
        return Promise.resolve(d); } } };`,
    }));
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>YouTube（モック）</p>' }));
    await page.route('https://mc-heads.net/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
    return external;
  }

  const SAMPLE = [
    '## 埋め込み',
    '[[埋め込み:https://x.com/jack/status/20?s=20]]',
    '',
    '[[埋め込み:https://x.com/someone/status/404]]',
    '',
    '[[埋め込み:https://youtu.be/jNQXAC9IVRw]]',
    '',
    '[[埋め込み:https://example.com/not-allowed]]',
    '',
    'スキン：[[スキン:Notch]] と [[スキン:jeb_|64]]',
    '',
    '外部の画像：![外](https://example.com/a.png)',
  ].join('\n');

  test('押すまで外部から読み込まず、押すと X と YouTube を表示する', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    const external = await mockServices(page);
    await page.goto('/edit.html');
    await page.locator('#wpTitle').fill('埋め込みのテスト');
    await page.locator('#wpTextbox1').fill(SAMPLE);
    await page.getByRole('tab', { name: 'プレビュー' }).click();
    const preview = page.locator('#wikiPreview');

    // カードとスキンの顔
    await expect(preview.locator('.wiki-embed-x')).toHaveCount(2);
    await expect(preview.locator('.wiki-embed-youtube')).toHaveCount(1);
    await expect(preview.locator('.wiki-embed-x').first()).toContainText('@jack のポスト');
    await expect(preview.locator('.wiki-embed-x').first().locator('a', { hasText: 'X で開く' })).toHaveAttribute('href', 'https://x.com/jack/status/20');
    await expect(preview.locator('.wiki-embed-error')).toContainText('埋め込めない URL');
    await expect(preview.locator('.external-image-blocked')).toHaveCount(1);
    const skins = preview.locator('img.skin-face');
    await expect(skins).toHaveCount(2);
    await expect(skins.nth(0)).toHaveAttribute('src', 'https://mc-heads.net/avatar/Notch/40');
    await expect(skins.nth(1)).toHaveAttribute('src', 'https://mc-heads.net/avatar/jeb_/128');
    await expect(skins.nth(1)).toHaveAttribute('width', '64');
    await expect(preview.locator('a.skin-link').first()).toHaveAttribute('href', 'https://namemc.com/profile/Notch');
    await expect(preview.locator('a.skin-link').first()).toHaveAttribute('target', '_blank');
    await expect(preview.locator('a.skin-link').first()).toContainText('Notch');
    await page.screenshot({ path: `${SHOTS}/12-embed-cards.png`, fullPage: true });
    expect(external.filter((u) => !/mc-heads\.net/.test(u)), 'X・YouTube はまだ読み込まない').toEqual([]);

    // X：1 つ押すと、ページ内の X のポストをまとめて表示。消えたポストはメッセージ
    await preview.locator('.wiki-embed-x .wiki-embed-load').first().click();
    await expect(preview.locator('.mock-tweet')).toHaveText('ポスト 20');
    await expect(preview.locator('.wiki-embed-x').first()).toHaveClass(/wiki-embed-loaded/);
    await expect(preview.locator('.wiki-embed-x').nth(1).locator('.wiki-embed-status')).toContainText('削除された');
    expect(await page.evaluate(() => window.__tweetOpts)).toMatchObject({ dnt: true, lang: 'ja' });
    expect(external.some((u) => /youtube-nocookie/.test(u)), 'YouTube はまだ').toBe(false);

    // YouTube
    await preview.locator('.wiki-embed-youtube .wiki-embed-load').click();
    await expect(preview.locator('.wiki-embed-youtube iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
    await page.screenshot({ path: `${SHOTS}/13-embed-loaded.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('X を読み込めないときはメッセージを出して、もう一度押せる', async ({ page, context }) => {
    await setup(page, context);
    await page.route('https://platform.x.com/widgets.js', (route) => route.abort('blockedbyclient'));
    await page.goto('/edit.html');
    await page.locator('#wpTextbox1').fill('[[埋め込み:https://x.com/jack/status/20]]');
    await page.getByRole('tab', { name: 'プレビュー' }).click();
    await page.locator('#wikiPreview .wiki-embed-load').click();
    await expect(page.locator('#wikiPreview .wiki-embed-status')).toContainText('X を読み込めませんでした');
    await expect(page.locator('#wikiPreview .wiki-embed-load')).toHaveText('もう一度表示する');
    await expect(page.locator('#wikiPreview .wiki-embed-load')).toBeEnabled();
  });

  test('書式ボタンで埋め込みとスキンを入れられ、おかしな URL や外部の画像はコピーの前に止める', async ({ page, context }) => {
    await setup(page, context);
    await page.goto('/edit.html');
    await page.locator('#wpTitle').fill('ボタンのテスト');
    const ta = page.locator('#wpTextbox1');
    await ta.click();
    await page.keyboard.type('説明');
    await page.getByRole('button', { name: 'X・YouTube' }).click();
    await page.keyboard.type('https://x.com/jack/status/20');
    await page.keyboard.press('Control+End');
    await page.getByRole('button', { name: 'スキン' }).click();
    await page.keyboard.type('Notch');
    expect(await ta.inputValue()).toBe('説明\n\n[[埋め込み:https://x.com/jack/status/20]]\n[[スキン:Notch]]');

    await ta.fill('[[埋め込み:https://example.com/a]]');
    await page.locator('#copy-button').click();
    await expect(page.locator('#submit-result')).toContainText('埋め込めない URL');
    await ta.fill('![外](https://example.com/a.png)');
    await page.locator('#copy-button').click();
    await expect(page.locator('#submit-result')).toContainText('外部の画像');
  });
});

test.describe('編集', () => {
  test('既存ページの編集とプレビュー', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await expect(page.locator('#firstHeading')).toHaveText('「はじめかた」を編集中');
    await expect(page.locator('#wpTitle')).toHaveAttribute('readonly', '');
    await expect(page.locator('#wpTextbox1')).toHaveValue(/参加のしかた/);
    await expect(page.locator('#ca-edit')).toHaveClass(/selected/);

    const ta = page.locator('#wpTextbox1');
    await ta.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n');
    await page.getByRole('button', { name: '見出し' }).click();
    await page.keyboard.type('追加した節');
    await page.keyboard.press('End');
    await page.keyboard.type('\n');
    await page.getByRole('button', { name: '太字' }).click();
    await page.keyboard.type('強調');
    await page.keyboard.press('End');
    await page.keyboard.type(' と ');
    await page.getByRole('button', { name: '内部リンク' }).click();
    await page.keyboard.type('よくある質問');
    const value = await ta.inputValue();
    expect(value).toContain('## 追加した節');
    expect(value).toContain('**強調**');
    expect(value).toContain('[[よくある質問]]');
    await page.keyboard.press('End');
    await page.getByRole('button', { name: '表' }).click();
    expect(await ta.inputValue()).toContain('| 見出し1 | 見出し2 |\n| --- | --- |');

    await page.getByRole('tab', { name: 'プレビュー' }).click();
    await expect(page.locator('#preview-pane')).toBeVisible();
    await expect(page.locator('#edit-pane')).toBeHidden();
    const preview = page.locator('#wikiPreview');
    await expect(preview.locator('h2', { hasText: '追加した節' })).toBeVisible();
    await expect(preview.locator('strong', { hasText: '強調' })).toBeVisible();
    await expect(preview.locator('a.wikilink.new', { hasText: 'よくある質問' }).last()).toBeVisible();
    await expect(preview.locator('#toc')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-edit-preview.png`, fullPage: true });

    await page.getByRole('tab', { name: '編集' }).click();
    await expect(page.locator('#edit-pane')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('プレビューは DOMPurify で無害化される（見出し 2 つなら目次なし）', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto('/edit.html');
    await expect(page.locator('#firstHeading')).toHaveText('新しいページを作成');
    await page.locator('#wpTitle').fill('テスト');
    await page.locator('#wpTextbox1').fill([
      '## 一つ目',
      '<img src="x" onerror="window.__xss=1">',
      '<script>window.__xss=2<\/script>',
      '[危ないリンク](javascript:window.__xss=3)',
      '<a href="https://example.com/">外部</a>',
      '<div style="position:fixed;inset:0">上に被せる</div>',
      '<form action="https://evil.example"><input type="password" name="pw"><button>送信</button></form>',
      '<iframe src="https://example.com"></iframe>',
      '<div id="content">偽物</div>',
      '## 二つ目',
      '- [x] タスク',
    ].join('\n\n'));
    await page.getByRole('tab', { name: 'プレビュー' }).click();
    const preview = page.locator('#wikiPreview');
    await expect(preview.locator('h2')).toHaveCount(2);
    await expect(preview.locator('#toc')).toHaveCount(0);
    await expect(preview.locator('script, iframe, form, button, [onerror], [style], input[type="password"]')).toHaveCount(0);
    await expect(preview.locator('[id="content"]')).toHaveCount(0);
    await expect(preview.locator('a', { hasText: '危ないリンク' })).not.toHaveAttribute('href', /javascript/i);
    await expect(preview.locator('a', { hasText: '外部' })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(preview.locator('input[type="checkbox"]')).toBeDisabled();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    // 残ってよいのは、<img src="x"> の 404 と、DOMPurify が実行されない DOMParser で読むときの CSP 報告（onerror・style）だけ
    const unexpected = errors.filter((e) => !/Failed to load resource/.test(e) &&
      !/(Executing inline event handler|Applying inline style) violates the following Content Security Policy/.test(e));
    expect(unexpected).toEqual([]);
  });

  test('既存ページ：本文をコピーして GitHub の編集画面を開く', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    const link = page.locator('#github-link');
    const editUrl = `${REPO}/edit/main/site/pages/${enc('はじめかた')}.md`;
    await expect(link).toHaveAttribute('href', editUrl);
    await expect(link).toHaveAttribute('target', '_blank');

    // コピーする前に開こうとすると止める
    await page.locator('#wpTextbox1').fill('書き換えた本文');
    await link.click();
    await expect(page.locator('#submit-result')).toContainText('先に「① 本文をコピーする」を押してください');

    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-status')).toHaveText('✔ コピーしました');
    await expect(page.locator('#submit-result')).toContainText('② GitHub の編集画面を開く');
    expect(await readClipboard(page)).toBe('書き換えた本文\n');
    await page.locator('#submit-steps').screenshot({ path: `${SHOTS}/06-submit-steps.png` });

    // 本文を変えたら、もう一度コピーが必要
    await page.locator('#wpTextbox1').fill('さらに書き換えた本文\n');
    await expect(page.locator('#copy-status')).toContainText('もう一度コピー');
    await page.locator('#copy-button').click();
    expect(await readClipboard(page)).toBe('さらに書き換えた本文\n');

    const popupPromise = context.waitForEvent('page');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(editUrl);
    await expect(page.locator('#submit-result')).toContainText('GitHub の画面を新しいタブで開きました');
    await page.screenshot({ path: `${SHOTS}/07-after-github.png`, fullPage: true });

    // GitHub を開いたあとは、離れるときの確認を出さない
    let dialog = null;
    page.on('dialog', (d) => { dialog = d; d.accept(); });
    await page.close({ runBeforeUnload: true });
    expect(dialog).toBeNull();
    expect(errors).toEqual([]);
  });

  test('新しいページ：ファイル名入りの新規作成画面を開く', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/edit.html?p=${enc('新しい攻略ページ')}`);
    const newUrl = `${REPO}/new/main/site/pages?filename=${enc('新しい攻略ページ.md')}`;
    await expect(page.locator('#github-link')).toHaveAttribute('href', newUrl);
    await expect(page.locator('#submit-steps')).toContainText('本文の欄に貼り付け');

    // ページ名を変えるとリンクも変わる
    await page.locator('#wpTitle').fill('村人（取引）');
    await expect(page.locator('#github-link')).toHaveAttribute('href', `${REPO}/new/main/site/pages?filename=${enc('村人（取引）.md')}`);

    await page.locator('#wpTextbox1').fill('# 取引\n\n本文\r\n');
    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-status')).toHaveText('✔ コピーしました');
    expect(await readClipboard(page)).toBe('# 取引\n\n本文\n');
    const popupPromise = context.waitForEvent('page');
    await page.locator('#github-link').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(`${REPO}/new/main/site/pages?filename=${enc('村人（取引）.md')}`);
    expect(errors).toEqual([]);
  });

  test('コピーの前に確認する（不正な名前・既存の名前・禁止記述・未変更）', async ({ page, context }) => {
    await setup(page, context);
    await page.evaluate(() => navigator.clipboard.writeText('まえの内容')).catch(() => {});
    await page.goto('/edit.html');
    await page.evaluate(() => navigator.clipboard.writeText('まえの内容'));
    const result = page.locator('#submit-result');

    await page.locator('#wpTitle').fill('a/b');
    await expect(page.locator('#title-hint')).toHaveClass(/error/);
    await page.locator('#wpTextbox1').fill('本文');
    await page.locator('#copy-button').click();
    await expect(result).toContainText('使えない文字');

    await page.locator('#wpTitle').fill('はじめかた');
    await expect(page.locator('#title-hint')).toContainText('既にあります');
    await page.locator('#copy-button').click();
    await expect(result).toContainText('既にあります');

    await page.locator('#wpTitle').fill('安全なページ');
    await page.locator('#wpTextbox1').fill('こんにちは\n<script>alert(1)</script>');
    await page.locator('#copy-button').click();
    await expect(result).toContainText('<script（2行目）');

    await page.locator('#wpTextbox1').fill('');
    await page.locator('#copy-button').click();
    await expect(result).toContainText('本文が空です');

    page.on('dialog', (d) => d.accept());
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await page.locator('#copy-button').click();
    await expect(page.locator('#submit-result')).toContainText('内容が変更されていません');

    expect(await readClipboard(page)).toBe('まえの内容'); // 一度もコピーしていない
  });

  test('自動でコピーできないブラウザでは、本文を選択して手でコピーしてもらう', async ({ page, context }) => {
    await setup(page, context);
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
      document.execCommand = () => false;
    });
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await page.locator('#wpTextbox1').fill('手でコピーする本文');
    await page.getByRole('tab', { name: 'プレビュー' }).click();
    await page.locator('#copy-button').click();
    await expect(page.locator('#submit-result .mw-message-box-warning')).toContainText('Ctrl+C');
    await expect(page.locator('#edit-pane')).toBeVisible();
    const selected = await page.locator('#wpTextbox1').evaluate((t) => t.value.slice(t.selectionStart, t.selectionEnd));
    expect(selected).toBe('手でコピーする本文');
  });

  test('画像付きの詳しい手順が編集画面に出て、閉じた状態を覚える', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    const howto = page.locator('#howto');
    await expect(howto).toHaveAttribute('open', '');
    await expect(howto.locator('h2', { hasText: '貼り付けて「Commit changes...」を押す' })).toBeVisible();
    await expect(howto.locator('#toc')).toHaveCount(0);
    const imgs = howto.locator('img');
    await expect(imgs).toHaveCount(6);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    }
    await page.locator('#submit-steps').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/08-edit-with-guide.png`, fullPage: true });

    await howto.locator('summary').click();
    await expect(howto).not.toHaveAttribute('open', '');
    await page.reload();
    await expect(page.locator('#howto')).not.toHaveAttribute('open', '');
    expect(errors).toEqual([]);
  });

  test('未保存の変更があるとページを離れるときに確認が出る', async ({ page, context }) => {
    await setup(page, context);
    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await page.locator('#wpTextbox1').click();
    await page.keyboard.type('変更');
    const dialogPromise = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });
});

test.describe('スマホ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('メニューが開閉でき、横にはみ出さない', async ({ page, context }) => {
    const { errors } = await setup(page, context);
    await page.goto('/');
    await expect(page.locator('#firstHeading')).toHaveText('メインページ');
    await expect(page.locator('#mw-mobile-header')).toBeVisible();
    await expect(page.locator('#mw-panel')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/09-mobile-main.png`, fullPage: true });

    await page.locator('#mw-menu-toggle').click();
    await expect(page.locator('#mw-panel')).toBeVisible();
    await expect(page.locator('#n-howto a')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/10-mobile-menu.png` });
    await page.locator('#mw-panel-overlay').click({ position: { x: 370, y: 400 } });
    await expect(page.locator('#mw-panel')).toBeHidden();

    await page.goto(`/edit.html?p=${enc('はじめかた')}`);
    await expect(page.locator('#wpTextbox1')).toBeVisible();
    await expect(page.locator('#howto img').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/11-mobile-edit.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});
