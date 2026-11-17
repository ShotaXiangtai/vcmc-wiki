// 404 ページ（存在しない URL を開いたとき）。かくし要素：404 を 3 回クリック / ↑↑↓↓←→←→BA / #games でゲームセンター
(function () {
  'use strict';

  var Wiki = window.Wiki;
  var h = Wiki.h;

  var ui = Wiki.layout({ special: true });
  ui.heading.textContent = 'ページが見つかりません';
  Wiki.setDocTitle('ページが見つかりません');

  // URL の最後の部分を、ページ名かもしれないものとして使う（例：/はじめかた → 「はじめかた」を検索）
  var guess = '';
  try {
    guess = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '').split('/').pop().replace(/\.(html?|md)$/i, '');
  } catch (e) { guess = ''; }
  guess = Wiki.normalizeTitle(guess);
  if (guess === '404' || guess === 'index') guess = '';

  // ドット絵の「404」（数字をブロックで描く）
  var DIGITS = {
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  };
  var CELL = 14;
  var art = h('canvas', {
    width: 17 * CELL, height: 7 * CELL, class: 'pixel notfound-art', role: 'img', 'aria-label': '404',
  });
  (function draw() {
    var ctx = art.getContext('2d');
    var blocks = ['gold', 'diamond', 'emerald'];
    '404'.split('').forEach(function (d, i) {
      DIGITS[d].forEach(function (row, y) {
        row.split('').forEach(function (bit, x) {
          if (bit === '1') window.WikiGames.drawBlock(ctx, blocks[i], (i * 6 + x) * CELL, y * CELL, CELL, 0);
        });
      });
    });
  })();

  var gamesBox = h('section', { id: 'secret-games', class: 'secret-games', hidden: true, 'aria-label': 'ひみつのゲームセンター' });
  var opened = false;
  function openGames() {
    if (!opened) {
      opened = true;
      window.WikiGames.mount(gamesBox);
    }
    gamesBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var links = [
    h('li', null, h('a', { href: './' }, 'メインページへ行く')),
    h('li', null, h('a', { href: './?special=all' }, '全ページ一覧を見る')),
  ];
  if (guess && !Wiki.rules.checkTitle(guess)) {
    links.splice(1, 0, h('li', null, h('a', { href: './?search=' + encodeURIComponent(guess) }, '「' + guess + '」を検索する')));
  }
  links.push(h('li', null, h('a', { href: 'edit.html' }, '新しいページを作る')));

  ui.body.append(
    h('div', { class: 'notfound' },
      art,
      h('div', { class: 'notfound-text' },
        h('p', null, h('b', null, 'お探しのページは、この Wiki にはありませんでした。')),
        h('p', null, 'URL がまちがっているか、ページが移動・削除されたのかもしれません。'),
        h('ul', null, links))),
    gamesBox,
    h('p', { class: 'notfound-hint' }, 'ヒント：404 をよく見ると…？'));

  // 404 を続けて 3 回クリック
  var clicks = 0;
  var last = 0;
  art.addEventListener('click', function () {
    var now = Date.now();
    clicks = now - last < 1500 ? clicks + 1 : 1;
    last = now;
    art.classList.remove('shake');
    void art.offsetWidth; // アニメーションをやり直す
    art.classList.add('shake');
    if (clicks >= 3) { clicks = 0; openGames(); }
  });

  // ↑↑↓↓←→←→BA
  var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var pos = 0;
  document.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === SEQ[pos]) pos++;
    else pos = k === SEQ[0] ? 1 : 0;
    if (pos === SEQ.length) { pos = 0; openGames(); }
  });

  if (location.hash === '#games') openGames();
})();
