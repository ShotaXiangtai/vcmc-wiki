// ブラウザ用のルール（site/js/rules.js）と 検証用のルール（scripts/rules.mjs）が同じ結果になるか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as workerRules from '../../scripts/rules.mjs';

const siteSource = readFileSync(new URL('../../site/js/rules.js', import.meta.url), 'utf8');
const sandbox = { window: {}, TextEncoder };
vm.runInNewContext(siteSource, sandbox);
const siteRules = sandbox.window.WikiRules;

const titles = [
  '', ' ', 'メインページ', 'Wikiの書き方', 'a'.repeat(60), 'a'.repeat(61), '😀', 'a/b', 'a\\b', 'a..b', 'a.b',
  ' a', 'a ', 'a  b', '村人（取引）', '村人(取引)', 'エンダー・ドラゴン', 'x_y-z', 'CON', 'con', 'COM1', 'lpt9', 'NULL',
  'カ\u3099', 'ガ', 'é', 'e\u0301', '#1', 'a?', 'a:b', 'a*b', 'a"b', '<a>', 'a|b', '%20', 'Ａｂｃ１２３', '한국어', 'Ελληνικά',
  'a\tb', 'a\nb', '\u200Bzero', '\u3000全角空白',
];

test('checkTitle の結果が一致する', () => {
  for (const t of titles) {
    assert.equal(siteRules.checkTitle(t), workerRules.checkTitle(t), JSON.stringify(t));
  }
});

test('findForbidden の結果が一致する', () => {
  const texts = [
    'ふつうの文章', '<script>', '<SCRIPT src=x>', '<iframe>', '<object>', '<embed>', '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">', 'online-mode=true', 'onclick = "x"', 'one\ntwo <iframe', '`<script>` in code',
  ];
  for (const s of texts) {
    // vm の中で作ったオブジェクトはプロトタイプが違うので JSON にして比べる
    assert.equal(JSON.stringify(siteRules.findForbidden(s)), JSON.stringify(workerRules.findForbidden(s)), JSON.stringify(s));
  }
});

test('上限の値が一致する', () => {
  assert.equal(siteRules.TITLE_MAX_CHARS, workerRules.TITLE_MAX_CHARS);
  assert.equal(siteRules.CONTENT_MAX_BYTES, workerRules.CONTENT_MAX_BYTES);
  assert.equal(siteRules.SUMMARY_MAX_CHARS, workerRules.SUMMARY_MAX_CHARS);
  assert.equal(siteRules.AUTHOR_MAX_CHARS, workerRules.AUTHOR_MAX_CHARS);
});

test('期待どおりの判定', () => {
  assert.equal(workerRules.checkTitle('メインページ'), null);
  assert.notEqual(workerRules.checkTitle('a/b'), null);
  assert.notEqual(workerRules.checkTitle('CON'), null);
  assert.notEqual(workerRules.checkTitle('カ\u3099'), null, 'NFC でない名前は弾く（Worker は正規化してから確認する）');
  assert.deepEqual(workerRules.findForbidden('online-mode=true'), [], 'server.properties の書き方は弾かない');
  assert.deepEqual(workerRules.findForbidden('1行目\n2行目 <iframe>'), [{ label: '<iframe', line: 2 }]);
});
