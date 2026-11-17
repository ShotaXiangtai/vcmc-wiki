// scripts/build-index.mjs と scripts/validate.mjs のテスト（一時フォルダで実行）
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeExcerpt } from '../../scripts/build-index.mjs';
import { validate, missingAgreements } from '../../scripts/validate.mjs';

const scriptsDir = fileURLToPath(new URL('../../scripts/', import.meta.url));

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'wiki-test-'));
  mkdirSync(join(root, 'site', 'pages'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const p = join(root, name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe('build-index.mjs', () => {
  test('index.json に title と excerpt を書き出す', () => {
    const root = makeRepo({
      'site/pages/メインページ.md': '# ようこそ\n\n[[はじめかた|入り方]]と[[ルール]]を読んでね。**太字**\n\n```\nコードは除く\n```\n',
      'site/pages/はじめかた.md': '- 手順1\n- 手順2\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n',
      'site/pages/note.txt': '一覧に入らない',
    });
    try {
      execFileSync(process.execPath, [join(scriptsDir, 'build-index.mjs'), '--root', root]);
      const list = JSON.parse(readFileSync(join(root, 'site', 'pages', 'index.json'), 'utf8'));
      assert.deepEqual(list.map((p) => p.title).sort(), ['はじめかた', 'メインページ']);
      const main = list.find((p) => p.title === 'メインページ');
      assert.equal(main.excerpt, 'ようこそ 入りかたとルールを読んでね。太字'.replace('入りかた', '入り方'));
      assert.ok(!main.excerpt.includes('コード'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('makeExcerpt：リンク・画像・表を文字だけにし、長い文は省略する', () => {
    assert.equal(makeExcerpt('[公式](https://example.com) ![画像](x.png) 文'), '公式 文');
    assert.equal(makeExcerpt('| a | b |\n|---|---|\n| 1 | 2 |'), 'a b 1 2');
    const long = makeExcerpt('あ'.repeat(500));
    assert.equal([...long].length, 151);
    assert.ok(long.endsWith('…'));
  });
});

describe('validate.mjs', () => {
  test('正しい記事だけならエラーなし（終了コード 0）', () => {
    const root = makeRepo({ 'site/pages/メインページ.md': '本文\n', 'site/pages/index.json': '[]' });
    try {
      const r = spawnSync(process.execPath, [join(scriptsDir, 'validate.mjs'), '--root', root], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /エラー 0 件/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('ルール違反をすべて見つけて終了コード 1', () => {
    const root = makeRepo({
      'site/pages/OK.md': 'ok\n',
      'site/pages/ok.md': '大文字小文字違い\n',
      'site/pages/a.b.md': '名前に .\n',
      'site/pages/CON.md': '予約名\n',
      'site/pages/script.md': '1行目\n<script>alert(1)</script>\n',
      'site/pages/onerror.md': '<img src=x onerror=alert(1)>\n',
      'site/pages/js.md': '[x](javascript:alert(1))\n',
      'site/pages/big.md': 'a'.repeat(61 * 1024),
      'site/pages/sjis.md': Buffer.from([0x82, 0xa0, 0xff]),
      'site/pages/sub/x.md': 'フォルダの中\n',
      'site/pages/memo.txt': 'md 以外\n',
    });
    try {
      const { errors } = validate(root);
      const byFile = (f) => errors.filter((e) => e.file === `site/pages/${f}`).map((e) => e.message).join(' / ');
      // Windows / macOS は大文字小文字を区別しないので OK.md と ok.md は同じファイルになる（Linux の CI でだけ確認できる）
      const caseSensitive = readdirSync(join(root, 'site', 'pages')).filter((n) => n.toLowerCase() === 'ok.md').length === 2;
      if (caseSensitive) assert.match(byFile('ok.md') || byFile('OK.md'), /大文字・小文字/);
      assert.match(byFile('a.b.md'), /ページ名/);
      assert.match(byFile('CON.md'), /ページ名/);
      assert.match(byFile('script.md'), /<script/);
      assert.equal(errors.find((e) => e.file === 'site/pages/script.md').line, 2);
      assert.match(byFile('onerror.md'), /onxxx=/);
      assert.match(byFile('js.md'), /javascript:/);
      assert.match(byFile('big.md'), /大きすぎます/);
      assert.match(byFile('sjis.md'), /UTF-8/);
      assert.match(byFile('sub'), /フォルダ/);
      assert.match(byFile('memo.txt'), /\.md/);

      const r = spawnSync(process.execPath, [join(scriptsDir, 'validate.mjs'), '--root', root], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: '' },
      });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /::error file=site\/pages\/script\.md,line=2::/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('--base：site/pages/ 以外を変更していたら警告（エラーにはしない）', () => {
    const root = makeRepo({ 'site/pages/メインページ.md': '本文\n', 'README.md': 'readme\n' });
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    try {
      git('init', '-q', '-b', 'main');
      git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init');
      git('add', '-A');
      git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'base');
      git('checkout', '-q', '-b', 'feature');
      writeFileSync(join(root, 'site', 'pages', '新しいページ.md'), '追加\n');
      writeFileSync(join(root, 'README.md'), '書き換え\n');
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts', 'validate.mjs'), '// すり替え\n');
      git('add', '-A');
      git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'change');

      const { errors, warnings } = validate(root, { base: 'main' });
      assert.equal(errors.length, 0);
      const files = warnings.map((w) => w.file).sort();
      assert.deepEqual(files, ['README.md', 'scripts/validate.mjs'], '日本語のファイル名の記事は警告されない');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('PR の説明欄：確認項目が 3 つとも [x] でないとエラー', () => {
    const template = readFileSync(fileURLToPath(new URL('../../.github/pull_request_template.md', import.meta.url)), 'utf8');
    assert.deepEqual(missingAgreements(template).length, 3, 'テンプレートのままでは 3 つとも足りない');
    const allChecked = template.replace(/- \[ \]/g, '- [x]');
    assert.deepEqual(missingAgreements(allChecked), []);
    const upper = template.replace(/- \[ \]/g, '- [X]');
    assert.deepEqual(missingAgreements(upper), [], '大文字の X でもよい');
    const oneMissing = allChecked.replace('- [x] 他のサイト', '- [ ] 他のサイト');
    assert.deepEqual(missingAgreements(oneMissing), ['無断転載ではないことの確認']);
    assert.equal(missingAgreements('').length, 3);
    assert.equal(missingAgreements(null).length, 3);

    const root = makeRepo({ 'site/pages/メインページ.md': '本文\n' });
    try {
      assert.equal(validate(root, { prBody: template }).errors.length, 1);
      assert.match(validate(root, { prBody: template }).errors[0].message, /利用規約への同意/);
      assert.equal(validate(root, { prBody: allChecked }).errors.length, 0);
      assert.equal(validate(root).errors.length, 0, 'PR_BODY がなければ確認しない（公開時など）');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('--base：記事を変えていない PR は同意を求めない。利用規約・ライセンスの変更は警告', () => {
    const root = makeRepo({ 'site/pages/メインページ.md': '本文\n', 'site/pages/利用規約.md': '規約\n', 'README.md': 'a\n' });
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    const commit = (m) => git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', m);
    try {
      git('init', '-q', '-b', 'main');
      git('add', '-A');
      commit('base');
      git('checkout', '-q', '-b', 'readme-only');
      writeFileSync(join(root, 'README.md'), 'b\n');
      git('add', '-A');
      commit('readme');
      let r = validate(root, { base: 'main', prBody: '' });
      assert.equal(r.errors.length, 0, 'README だけの変更なら同意のチェックは不要');

      git('checkout', '-q', '-b', 'terms', 'main');
      writeFileSync(join(root, 'site', 'pages', '利用規約.md'), '書き換え\n');
      git('add', '-A');
      commit('terms');
      r = validate(root, { base: 'main', prBody: '' });
      assert.equal(r.errors.length, 1, '記事を変えたら同意のチェックが必要');
      assert.ok(r.warnings.some((w) => w.file === 'site/pages/利用規約.md' && /利用規約・ライセンス/.test(w.message)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('このリポジトリのサンプル記事は通る', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const { errors } = validate(root);
    assert.deepEqual(errors, []);
  });
});
