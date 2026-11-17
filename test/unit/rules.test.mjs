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
    '![外](https://example.com/a.png)', '![外](//example.com/a.png)', '![内](img/a.png)', '<img src="https://x/a.png">',
    '`![外](https://example.com/a.png)` はコードの例', '```\n![外](https://e.com/a.png)\n[[埋め込み:https://e.com]]\n```',
    '[[埋め込み:https://x.com/jack/status/20]]', '[[埋め込み:https://example.com/a]]', '1行目\n[[埋め込み:https://youtu.be/jNQXAC9IVRw]]',
    '[[スキン:Notch]]', '[[スキン:Notch|64]]', '[[スキン:だめな名前]]', '[[スキン:a-b]]', '[[embed:https://twitter.com/a/status/1]]',
  ];
  for (const s of texts) {
    // vm の中で作ったオブジェクトはプロトタイプが違うので JSON にして比べる
    assert.equal(JSON.stringify(siteRules.findForbidden(s)), JSON.stringify(workerRules.findForbidden(s)), JSON.stringify(s));
  }
});

test('parseEmbed・isMcid の結果が一致し、期待どおりに読み取れる', () => {
  const urls = [
    'https://x.com/jack/status/20', 'https://twitter.com/jack/status/20?s=20', 'https://x.com/jack/status/20/photo/1',
    'https://mobile.twitter.com/jack/status/20', 'https://x.com/jack', 'https://x.com/i/web/status/20x',
    'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/watch?t=10&v=jNQXAC9IVRw', 'https://youtu.be/jNQXAC9IVRw?si=abc',
    'https://www.youtube.com/shorts/jNQXAC9IVRw', 'https://www.youtube.com/live/jNQXAC9IVRw?feature=share', 'https://www.youtube.com/watch?v=short',
    'https://example.com/a.png', 'javascript:alert(1)', '', ' https://x.com/jack/status/20 ',
  ];
  for (const u of urls) {
    assert.equal(JSON.stringify(siteRules.parseEmbed(u)), JSON.stringify(workerRules.parseEmbed(u)), u);
  }
  assert.deepEqual(workerRules.parseEmbed('https://twitter.com/jack/status/20?s=20'), { type: 'x', user: 'jack', id: '20', url: 'https://x.com/jack/status/20' });
  assert.deepEqual(workerRules.parseEmbed('https://youtu.be/jNQXAC9IVRw?si=abc'), { type: 'youtube', id: 'jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' });
  assert.equal(workerRules.parseEmbed('https://example.com/a.png'), null);
  for (const n of ['Notch', 'jeb_', 'a', 'x'.repeat(16), 'x'.repeat(17), 'a-b', 'だめ', '']) {
    assert.equal(siteRules.isMcid(n), workerRules.isMcid(n), n);
  }
  assert.equal(workerRules.isMcid('jeb_'), true);
  assert.equal(workerRules.isMcid('a-b'), false);
});

test('外部の画像と、おかしな埋め込みを見つける（コードの中の例は対象外）', () => {
  assert.deepEqual(workerRules.findForbidden('![外](https://example.com/a.png)'), [{ label: '外部の画像', line: 1 }]);
  assert.deepEqual(workerRules.findForbidden('![内](img/guide/a.png)'), []);
  assert.deepEqual(workerRules.findForbidden('`![外](https://example.com/a.png)`'), []);
  assert.deepEqual(workerRules.findForbidden('```\n[[埋め込み:https://example.com]]\n```'), []);
  assert.deepEqual(workerRules.findForbidden('a\n[[埋め込み:https://example.com]]').map((f) => f.line), [2]);
  assert.deepEqual(workerRules.findForbidden('[[スキン:だめ]]').length, 1);
  assert.deepEqual(workerRules.findForbidden('[[埋め込み:https://x.com/jack/status/20]]\n[[スキン:Notch|64]]'), []);
  assert.deepEqual(workerRules.findForbidden('`<script>`').length, 1, 'script などはコードの中でも弾く');
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
