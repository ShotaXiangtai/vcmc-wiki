// 404 ページのかくしミニゲーム（イースターエッグ）。絵はすべてこのファイルの中で描いたオリジナル。
// window.WikiGames.mount(container) でゲームセンターを表示する。
(function () {
  'use strict';

  var h = window.Wiki.h;

  // ---------------------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------------------
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, String(value));
    } catch (e) { /* 保存できなくても遊べる */ }
    return null;
  }

  /** 自己ベストを更新する。lowerIsBetter なら小さいほうがよい */
  function record(key, score, lowerIsBetter) {
    var prev = parseFloat(store('wiki-game-' + key));
    var isNew = isNaN(prev) || (lowerIsBetter ? score < prev : score > prev);
    if (isNew) store('wiki-game-' + key, score);
    return { best: isNew ? score : prev, isNew: isNew };
  }

  function bestText(key, unit) {
    var v = store('wiki-game-' + key);
    return v == null ? 'まだ記録なし' : v + unit;
  }

  // 決まった結果を返す乱数（同じ種類のブロックは毎回同じ模様にする）
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // ドット絵のブロック（8×8 マス）
  // ---------------------------------------------------------------------------
  var BLOCKS = {
    dirt: { name: '土', base: '#86592f', dots: ['#6b4423', '#9c6c3e'], hits: 1, points: 1, weight: 30 },
    stone: { name: '石', base: '#8b8b8b', dots: ['#737373', '#a1a1a1'], hits: 2, points: 2, weight: 30 },
    coal: { name: '石炭', base: '#8b8b8b', dots: ['#262626', '#3a3a3a'], ore: true, hits: 3, points: 4, weight: 14 },
    iron: { name: '鉄', base: '#8b8b8b', dots: ['#d9b293', '#b9865f'], ore: true, hits: 4, points: 6, weight: 10 },
    copper: { name: '銅', base: '#8b8b8b', dots: ['#e07a4a', '#4fae8f'], ore: true, hits: 4, points: 6, weight: 6 },
    gold: { name: '金', base: '#8b8b8b', dots: ['#f8d74a', '#d9a316'], ore: true, hits: 5, points: 10, weight: 5 },
    redstone: { name: 'レッドストーン', base: '#8b8b8b', dots: ['#e0201f', '#a10f0f'], ore: true, hits: 5, points: 10, weight: 5 },
    lapis: { name: 'ラピスラズリ', base: '#8b8b8b', dots: ['#2f56d8', '#1c369c'], ore: true, hits: 5, points: 10, weight: 4 },
    emerald: { name: 'エメラルド', base: '#8b8b8b', dots: ['#26d066', '#118a3d'], ore: true, hits: 7, points: 20, weight: 2 },
    diamond: { name: 'ダイヤモンド', base: '#8b8b8b', dots: ['#6af0e6', '#28b8ae'], ore: true, hits: 7, points: 20, weight: 2 },
  };
  var ORE_KEYS = ['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'emerald', 'diamond'];

  function drawBlock(ctx, type, x, y, size, damage) {
    var b = BLOCKS[type];
    var px = size / 8;
    var rnd = seeded(type.length * 977 + type.charCodeAt(0) * 31);
    ctx.fillStyle = b.base;
    ctx.fillRect(x, y, size, size);
    for (var i = 0; i < 64; i++) {
      var cx = i % 8;
      var cy = Math.floor(i / 8);
      var r = rnd();
      if (b.ore) {
        // 鉱石：かたまりで色を置く
        if (r < 0.28 && cx > 0 && cx < 7 && cy > 0 && cy < 7) {
          ctx.fillStyle = b.dots[r < 0.14 ? 0 : 1];
          ctx.fillRect(x + cx * px, y + cy * px, px, px);
        } else if (r > 0.86) {
          ctx.fillStyle = r > 0.93 ? '#a1a1a1' : '#737373';
          ctx.fillRect(x + cx * px, y + cy * px, px, px);
        }
      } else if (r < 0.3) {
        ctx.fillStyle = b.dots[r < 0.15 ? 0 : 1];
        ctx.fillRect(x + cx * px, y + cy * px, px, px);
      }
    }
    // ふち
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, size, px / 2);
    ctx.fillRect(x, y, px / 2, size);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + size - px / 2, size, px / 2);
    ctx.fillRect(x + size - px / 2, y, px / 2, size);
    // ひび
    if (damage > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      var crack = seeded(7);
      var n = Math.round(damage * 14);
      for (var k = 0; k < n; k++) {
        ctx.fillRect(x + Math.floor(crack() * 8) * px, y + Math.floor(crack() * 8) * px, px, px / 2);
      }
    }
  }

  function blockCanvas(type, size) {
    var c = h('canvas', { width: size, height: size, class: 'pixel', 'aria-hidden': 'true' });
    drawBlock(c.getContext('2d'), type, 0, 0, size, 0);
    return c;
  }

  function pickWeighted(rnd) {
    var keys = Object.keys(BLOCKS);
    var total = keys.reduce(function (s, k) { return s + BLOCKS[k].weight; }, 0);
    var r = rnd() * total;
    for (var i = 0; i < keys.length; i++) {
      r -= BLOCKS[keys[i]].weight;
      if (r < 0) return keys[i];
    }
    return 'stone';
  }

  // ---------------------------------------------------------------------------
  // ゲーム 1：ほりほりチャレンジ（20 秒でどれだけ掘れるか）
  // ---------------------------------------------------------------------------
  function miningGame(stage) {
    var MODES = {
      challenge: { name: '20秒チャレンジ', time: 20, howto: '20秒で、ブロックをどれだけ掘れるかな？ 固い鉱石ほど何回もたたく必要があって、そのぶん高得点！' },
      cps: { name: 'CPS測定（10秒）', time: 10, howto: '10秒間、できるだけ速くクリック（タップ）しよう。1秒間に何回押せたか（CPS）を測ります。' },
    };
    var mode = 'challenge';
    var canvas = h('canvas', { width: 160, height: 160, class: 'pixel game-mine-block', tabindex: '0', 'aria-label': 'ブロック（クリックかスペースキーで掘る）' });
    var ctx = canvas.getContext('2d');
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var hud = h('div', { class: 'game-hud' });
    var cpsNowBox = h('div', { class: 'game-cps', 'aria-hidden': 'true' });
    var howto = h('p', { class: 'game-howto' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    var modeBox = h('div', { class: 'game-modes', role: 'group', 'aria-label': 'あそびかた' });
    Object.keys(MODES).forEach(function (id) {
      var b = h('button', { type: 'button', class: 'mw-ui-button', 'data-mode': id, 'aria-pressed': id === mode ? 'true' : 'false' }, MODES[id].name);
      b.addEventListener('click', function () {
        if (playing) return;
        mode = id;
        modeBox.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        reset();
      });
      modeBox.appendChild(b);
    });
    stage.append(modeBox, howto,
      h('p', { class: 'game-howto' }, 'ブロックをクリック（スマホはタップ、パソコンはスペースキーでも OK）。'),
      hud, canvas, cpsNowBox, info, h('div', { class: 'game-actions' }, startButton));

    var playing = false;
    var score = 0;
    var mined = 0;
    var type = 'stone';
    var hits = 0;
    var endAt = 0;
    var startAt = 0;
    var timer = null;
    var clicks = 0;
    var recent = []; // 直近 1 秒のクリックの時刻（CPS 用）
    var peak = 0;

    function cpsNow() {
      var now = performance.now();
      while (recent.length && now - recent[0] > 1000) recent.shift();
      return recent.length;
    }
    function draw() {
      ctx.clearRect(0, 0, 160, 160);
      var damage = mode === 'challenge' ? hits / BLOCKS[type].hits : (clicks % 8) / 8;
      drawBlock(ctx, type, 0, 0, 160, damage);
    }
    function updateHud() {
      var left = playing ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : MODES[mode].time;
      var c = playing ? cpsNow() : 0;
      if (mode === 'challenge') {
        hud.textContent = 'のこり ' + left + ' 秒　スコア ' + score + '　掘った数 ' + mined + '　自己ベスト ' + bestText('mine', '点');
      } else {
        hud.textContent = 'のこり ' + left + ' 秒　クリック ' + clicks + ' 回　最高 ' + peak + ' CPS　自己ベスト ' + bestText('cps', ' CPS');
      }
      cpsNowBox.textContent = playing ? c + ' CPS' : '';
    }
    function nextBlock() {
      type = mode === 'challenge' ? pickWeighted(Math.random) : 'diamond';
      hits = 0;
      draw();
    }
    function hit() {
      if (!playing) return;
      clicks++;
      recent.push(performance.now());
      peak = Math.max(peak, cpsNow());
      if (mode === 'challenge') {
        hits++;
        if (hits >= BLOCKS[type].hits) {
          score += BLOCKS[type].points;
          mined++;
          info.textContent = BLOCKS[type].name + ' を掘った！ +' + BLOCKS[type].points;
          nextBlock();
        } else {
          draw();
        }
      } else {
        draw();
      }
      updateHud();
    }
    function finish() {
      playing = false;
      clearInterval(timer);
      var seconds = Math.max(0.001, (Math.min(Date.now(), endAt) - startAt) / 1000);
      var avg = Math.round((clicks / seconds) * 10) / 10;
      var r;
      if (mode === 'challenge') {
        r = record('mine', score, false);
        info.textContent = 'しゅうりょう！ スコア ' + score + ' 点（' + mined + ' 個）　平均 ' + avg + ' CPS・最高 ' + peak + ' CPS' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      } else {
        r = record('cps', avg, false);
        info.textContent = 'けっか：平均 ' + avg + ' CPS（最高 ' + peak + ' CPS・' + clicks + ' 回）' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      }
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function reset() {
      howto.textContent = MODES[mode].howto;
      info.textContent = '';
      clicks = 0;
      peak = 0;
      recent = [];
      score = 0;
      mined = 0;
      startButton.textContent = 'スタート';
      nextBlock();
      updateHud();
    }
    function start() {
      reset();
      playing = true;
      startAt = Date.now();
      endAt = startAt + MODES[mode].time * 1000;
      startButton.disabled = true;
      updateHud();
      canvas.focus();
      timer = setInterval(function () {
        if (Date.now() >= endAt) finish();
        else updateHud();
      }, 100);
    }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); hit(); });
    canvas.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) hit(); }
    });
    startButton.addEventListener('click', start);
    reset();
    return function destroy() { clearInterval(timer); playing = false; };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 2：よけろ！落ちブロック
  // ---------------------------------------------------------------------------
  function dodgeGame(stage) {
    var W = 300;
    var H = 400;
    var S = 24; // ブロックの大きさ
    var canvas = h('canvas', { width: W, height: H, class: 'pixel game-dodge-canvas', tabindex: '0', 'aria-label': 'よけろ！落ちブロック（左右キーで動く）' });
    var ctx = canvas.getContext('2d');
    var hud = h('div', { class: 'game-hud', 'aria-live': 'off' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    var leftButton = h('button', { type: 'button', class: 'mw-ui-button game-pad', 'aria-label': '左へ' }, '◀');
    var rightButton = h('button', { type: 'button', class: 'mw-ui-button game-pad', 'aria-label': '右へ' }, '▶');
    stage.append(
      h('p', { class: 'game-howto' }, '上から落ちてくるブロックをよけよう！ ダイヤを取るとボーナス。←→キー（A・D キー）か、下のボタン、画面の左右をタッチで動きます。'),
      hud, canvas, h('div', { class: 'game-actions' }, leftButton, startButton, rightButton), info);

    var raf = 0;
    var playing = false;
    var player = { x: W / 2 - S / 2 };
    var items = [];
    var keys = { left: false, right: false };
    var startTime = 0;
    var lastTime = 0;
    var spawnTimer = 0;
    var gems = 0;
    var score = 0;

    function drawPlayer() {
      // オリジナルのキャラクター：ヘルメットをかぶった四角い探検家
      var x = Math.round(player.x);
      var y = H - S - 6;
      ctx.fillStyle = '#3366cc'; ctx.fillRect(x, y + 8, S, S - 8); // 体
      ctx.fillStyle = '#f2c79a'; ctx.fillRect(x + 4, y + 4, S - 8, 10); // 顔
      ctx.fillStyle = '#f5d33b'; ctx.fillRect(x + 2, y, S - 4, 6); // ヘルメット
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + S / 2 - 2, y + 1, 4, 3); // ライト
      ctx.fillStyle = '#202122'; ctx.fillRect(x + 7, y + 8, 3, 3); ctx.fillRect(x + S - 10, y + 8, 3, 3); // 目
    }
    function drawGem(x, y) {
      ctx.fillStyle = '#28b8ae';
      ctx.beginPath();
      ctx.moveTo(x + S / 2, y + 2); ctx.lineTo(x + S - 3, y + S / 2); ctx.lineTo(x + S / 2, y + S - 2); ctx.lineTo(x + 3, y + S / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9ff7f0'; ctx.fillRect(x + S / 2 - 3, y + 7, 4, 4);
    }
    function render() {
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(0, 0, W, H);
      // 洞窟の壁
      ctx.fillStyle = '#353a47';
      for (var i = 0; i < 12; i++) ctx.fillRect((i * 53) % W, (i * 97) % H, 18, 8);
      ctx.fillStyle = '#5a4630';
      ctx.fillRect(0, H - 6, W, 6);
      items.forEach(function (it) {
        if (it.gem) drawGem(it.x, it.y);
        else drawBlock(ctx, it.type, it.x, it.y, S, 0);
      });
      drawPlayer();
    }
    function updateHud() {
      hud.textContent = 'スコア ' + score + '　ダイヤ ' + gems + '　自己ベスト ' + bestText('dodge', '点');
    }
    function loop(t) {
      if (!playing) return;
      var dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
      lastTime = t;
      var elapsed = (t - startTime) / 1000;
      var speed = 140 + elapsed * 9; // だんだん速くなる
      var move = 220 * dt;
      if (keys.left) player.x -= move;
      if (keys.right) player.x += move;
      player.x = Math.max(0, Math.min(W - S, player.x));

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = Math.max(0.22, 0.75 - elapsed * 0.02);
        var gem = Math.random() < 0.12;
        items.push({ x: Math.floor(Math.random() * (W - S)), y: -S, gem: gem, type: Math.random() < 0.5 ? 'stone' : 'dirt' });
      }
      var py = H - S - 6;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        it.y += speed * dt;
        var hitX = it.x < player.x + S - 4 && it.x + S - 4 > player.x;
        var hitY = it.y + S - 4 > py && it.y < py + S - 4;
        if (hitX && hitY) {
          if (it.gem) {
            gems++;
            items.splice(i, 1);
            continue;
          }
          return gameOver(elapsed);
        }
        if (it.y > H) items.splice(i, 1);
      }
      score = Math.floor(elapsed * 10) + gems * 50;
      updateHud();
      render();
      raf = requestAnimationFrame(loop);
    }
    function gameOver() {
      playing = false;
      cancelAnimationFrame(raf);
      render();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ゲームオーバー', W / 2, H / 2 + 7);
      var r = record('dodge', score, false);
      info.textContent = 'スコア ' + score + ' 点（ダイヤ ' + gems + ' 個）' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      items = [];
      gems = 0;
      score = 0;
      player.x = W / 2 - S / 2;
      info.textContent = '';
      playing = true;
      startButton.disabled = true;
      canvas.focus();
      startTime = performance.now();
      lastTime = startTime;
      spawnTimer = 0.5;
      raf = requestAnimationFrame(loop);
    }
    function onKey(e, down) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = down; e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = down; e.preventDefault(); }
    }
    function keydown(e) { if (playing) onKey(e, true); }
    function keyup(e) { onKey(e, false); }
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    function hold(button, side) {
      button.addEventListener('pointerdown', function (e) { e.preventDefault(); keys[side] = true; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        button.addEventListener(ev, function () { keys[side] = false; });
      });
    }
    hold(leftButton, 'left');
    hold(rightButton, 'right');
    canvas.addEventListener('pointerdown', function (e) {
      var rect = canvas.getBoundingClientRect();
      var side = (e.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
      keys[side] = true;
      canvas.setPointerCapture(e.pointerId);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { keys.left = false; keys.right = false; });
    });
    startButton.addEventListener('click', start);
    render();
    updateHud();
    return function destroy() {
      playing = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
    };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 3：鉱石あわせ（神経衰弱）
  // ---------------------------------------------------------------------------
  function memoryGame(stage) {
    var grid = h('div', { class: 'game-memory-grid' });
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'もう一回');
    stage.append(
      h('p', { class: 'game-howto' }, '同じ鉱石のカードを2枚そろえよう。少ない回数でぜんぶそろえたら勝ち！'),
      hud, grid, info, h('div', { class: 'game-actions' }, startButton));

    var first = null;
    var lock = false;
    var tries = 0;
    var pairs = 0;
    var timeout = null;

    function updateHud() {
      hud.textContent = 'めくった回数 ' + tries + '　そろった ' + pairs + ' / 8　自己ベスト ' + bestText('memory', '回');
    }
    function flip(card, open) {
      card.classList.toggle('open', open);
      card.setAttribute('aria-label', open ? BLOCKS[card.getAttribute('data-ore')].name : 'カード（うら）');
    }
    function choose(card) {
      if (lock || card.classList.contains('open') || card.classList.contains('done')) return;
      flip(card, true);
      if (!first) { first = card; return; }
      tries++;
      if (first.getAttribute('data-ore') === card.getAttribute('data-ore')) {
        first.classList.add('done');
        card.classList.add('done');
        pairs++;
        first = null;
        if (pairs === 8) {
          var r = record('memory', tries, true);
          info.textContent = 'ぜんぶそろった！ ' + tries + ' 回でクリア' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
        }
      } else {
        lock = true;
        var a = first;
        first = null;
        timeout = setTimeout(function () { flip(a, false); flip(card, false); lock = false; }, 700);
      }
      updateHud();
    }
    function start() {
      clearTimeout(timeout);
      grid.replaceChildren();
      info.textContent = '';
      first = null;
      lock = false;
      tries = 0;
      pairs = 0;
      var deck = ORE_KEYS.concat(ORE_KEYS);
      for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      deck.forEach(function (ore) {
        var card = h('button', { type: 'button', class: 'game-card', 'data-ore': ore, 'aria-label': 'カード（うら）' },
          h('span', { class: 'game-card-back', 'aria-hidden': 'true' }, '?'),
          h('span', { class: 'game-card-face' }, blockCanvas(ore, 48)));
        card.addEventListener('click', function () { choose(card); });
        grid.appendChild(card);
      });
      updateHud();
    }
    startButton.addEventListener('click', start);
    start();
    return function destroy() { clearTimeout(timeout); };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 4：はんのう速度（マイクが光ったらすぐ押す）
  // ---------------------------------------------------------------------------
  function reactionGame(stage) {
    var ROUNDS = 5;
    var panel = h('button', { type: 'button', class: 'game-reaction-panel', 'aria-live': 'polite' });
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    stage.append(
      h('p', { class: 'game-howto' }, 'マイクが緑に光ったら、すぐに押そう！ 5回の平均で勝負。光る前に押すとフライング。'),
      hud, panel, info);

    var state = 'idle'; // idle | waiting | ready | done
    var round = 0;
    var times = [];
    var shownAt = 0;
    var timeout = null;

    function setPanel(cls, text) {
      panel.className = 'game-reaction-panel ' + cls;
      panel.textContent = text;
    }
    function updateHud() {
      hud.textContent = (round > 0 ? round + ' / ' + ROUNDS + ' 回目　' : '') + '自己ベスト（平均） ' + bestText('reaction', 'ミリ秒');
    }
    function wait() {
      state = 'waiting';
      setPanel('waiting', '🎙 まだだよ…');
      timeout = setTimeout(function () {
        state = 'ready';
        shownAt = performance.now();
        setPanel('ready', '🎙 いま！');
      }, 1200 + Math.random() * 2300);
    }
    panel.addEventListener('click', function () {
      if (state === 'idle' || state === 'done') {
        round = 1;
        times = [];
        info.textContent = '';
        updateHud();
        wait();
      } else if (state === 'waiting') {
        clearTimeout(timeout);
        info.textContent = 'フライング！ もう一回';
        wait();
      } else if (state === 'ready') {
        var ms = Math.round(performance.now() - shownAt);
        times.push(ms);
        info.textContent = ms + ' ミリ秒';
        if (round >= ROUNDS) {
          var avg = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length);
          var r = record('reaction', avg, true);
          state = 'done';
          setPanel('done', '平均 ' + avg + ' ミリ秒　（押すともう一回）');
          info.textContent = times.join(' / ') + ' ミリ秒' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
        } else {
          round++;
          wait();
        }
        updateHud();
      }
    });
    setPanel('idle', '押してスタート');
    updateHud();
    return function destroy() { clearTimeout(timeout); };
  }

  // ---------------------------------------------------------------------------
  // 共通の部品（キー操作・タッチ用ボタン・キャラクター）
  // ---------------------------------------------------------------------------
  function isTyping(e) {
    var t = e.target;
    return !!(t && t.closest && t.closest('input, textarea, select'));
  }

  /** document にキー操作を付け、外す関数を返す */
  function listenKeys(down, up) {
    function d(e) { if (!isTyping(e)) down(e); }
    function u(e) { if (!isTyping(e) && up) up(e); }
    document.addEventListener('keydown', d);
    document.addEventListener('keyup', u);
    return function () {
      document.removeEventListener('keydown', d);
      document.removeEventListener('keyup', u);
    };
  }

  /** 押すたびに fn（repeatMs を付けると、押しっぱなしでくり返す） */
  function pressButton(label, aria, fn, repeatMs) {
    var b = h('button', { type: 'button', class: 'mw-ui-button game-pad', 'aria-label': aria }, label);
    var wait = null;
    var rep = null;
    function stop() { clearTimeout(wait); clearInterval(rep); }
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      fn();
      if (repeatMs) wait = setTimeout(function () { rep = setInterval(fn, repeatMs); }, 220);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, stop); });
    return b;
  }

  /** 押しているあいだ set(true)、はなすと set(false) */
  function holdButton(label, aria, set) {
    var b = h('button', { type: 'button', class: 'mw-ui-button game-pad', 'aria-label': aria }, label);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); set(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { set(false); }); });
    return b;
  }

  /** オリジナルのキャラクター：ヘルメットをかぶった四角い探検家 */
  function drawExplorer(ctx, x, y, S) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = '#3366cc'; ctx.fillRect(x, y + S * 0.34, S, S * 0.66);
    ctx.fillStyle = '#f2c79a'; ctx.fillRect(x + S * 0.17, y + S * 0.17, S * 0.66, S * 0.42);
    ctx.fillStyle = '#f5d33b'; ctx.fillRect(x + S * 0.08, y, S * 0.84, S * 0.25);
    ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + S * 0.42, y + 1, S * 0.16, S * 0.12);
    ctx.fillStyle = '#202122';
    ctx.fillRect(x + S * 0.29, y + S * 0.33, S * 0.12, S * 0.12);
    ctx.fillRect(x + S * 0.58, y + S * 0.33, S * 0.12, S * 0.12);
  }

  function overlayText(ctx, W, H, text) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 30, W, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H / 2 + 7);
    ctx.textAlign = 'start';
  }

  function randomOre() {
    return ORE_KEYS[Math.floor(Math.random() * ORE_KEYS.length)];
  }

  // ---------------------------------------------------------------------------
  // ゲーム 5：どかんさがし（マインスイーパー）
  // ---------------------------------------------------------------------------
  function sweeperGame(stage) {
    var LEVELS = [
      { id: 'easy', name: 'かんたん', w: 9, h: 9, mines: 10 },
      { id: 'normal', name: 'ふつう', w: 12, h: 12, mines: 24 },
      { id: 'hard', name: 'むずかしい', w: 14, h: 14, mines: 38 },
    ];
    var level = LEVELS[0];
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var grid = h('div', { class: 'game-sweeper-grid' });
    var flagButton = h('button', { type: 'button', class: 'mw-ui-button', 'aria-pressed': 'false' }, '🚩 はたモード：オフ');
    var resetButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'やりなおす');
    var levelBox = h('div', { class: 'game-modes', role: 'group', 'aria-label': 'むずかしさ' });
    LEVELS.forEach(function (lv) {
      var b = h('button', { type: 'button', class: 'mw-ui-button', 'data-level': lv.id, 'aria-pressed': lv === level ? 'true' : 'false' }, lv.name);
      b.addEventListener('click', function () {
        level = lv;
        levelBox.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        build();
      });
      levelBox.appendChild(b);
    });
    stage.append(
      h('p', { class: 'game-howto' }, '地面の下にかくれた「ばくだん」をさけて、ほかのマスをぜんぶ掘ろう。数字は、まわり8マスにあるばくだんの数。ばくだんだと思うマスには、右クリック（スマホは長押しか「はたモード」）ではたを立てよう。'),
      levelBox, hud, grid, h('div', { class: 'game-actions' }, flagButton, resetButton), info);

    var cells = [];
    var started = false;
    var over = false;
    var opened = 0;
    var flags = 0;
    var startTime = 0;
    var endTime = 0;
    var timer = null;
    var flagMode = false;

    function neighbors(i) {
      var x = i % level.w;
      var y = Math.floor(i / level.w);
      var out = [];
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < level.w && ny < level.h) out.push(ny * level.w + nx);
        }
      }
      return out;
    }
    function updateHud() {
      var t = started ? Math.floor(((over ? endTime : Date.now()) - startTime) / 1000) : 0;
      hud.textContent = 'ばくだん ' + level.mines + '　はた ' + flags + '　タイム ' + t + ' 秒　自己ベスト（' + level.name + '） ' + bestText('sweeper-' + level.id, ' 秒');
    }
    function paint(i) {
      var c = cells[i];
      var cls = 'sw-cell';
      if (c.open) cls += ' open';
      if (c.flag) cls += ' flag';
      if (c.boom) cls += ' boom';
      if (c.showMine) cls += ' mine';
      c.el.className = cls;
      if (c.open && c.n) c.el.setAttribute('data-n', c.n);
      else c.el.removeAttribute('data-n');
      c.el.textContent = c.flag && !c.showMine ? '🚩' : c.showMine ? '💣' : (c.open && c.n ? String(c.n) : '');
      c.el.setAttribute('aria-label', c.open ? (c.n ? 'まわりのばくだん ' + c.n : 'あいたマス') : c.flag ? 'はた' : 'まだ掘っていないマス');
    }
    function placeMines(safe) {
      var banned = {};
      banned[safe] = true;
      neighbors(safe).forEach(function (k) { banned[k] = true; });
      var candidates = [];
      for (var i = 0; i < cells.length; i++) if (!banned[i]) candidates.push(i);
      for (var m = 0; m < level.mines && candidates.length; m++) {
        var pick = Math.floor(Math.random() * candidates.length);
        cells[candidates[pick]].mine = true;
        candidates.splice(pick, 1);
      }
      cells.forEach(function (c, j) {
        c.n = neighbors(j).filter(function (k) { return cells[k].mine; }).length;
      });
    }
    function reveal(i) {
      if (over) return;
      var c = cells[i];
      if (c.open || c.flag) return;
      if (!started) {
        placeMines(i);
        started = true;
        startTime = Date.now();
        timer = setInterval(updateHud, 500);
      }
      if (c.mine) { lose(i); return; }
      var stack = [i];
      while (stack.length) {
        var j = stack.pop();
        var d = cells[j];
        if (d.open || d.flag) continue;
        d.open = true;
        opened++;
        paint(j);
        if (d.n === 0) neighbors(j).forEach(function (k) { if (!cells[k].open && !cells[k].mine) stack.push(k); });
      }
      if (opened === level.w * level.h - level.mines) win();
      updateHud();
    }
    function toggleFlag(i) {
      var c = cells[i];
      if (over || c.open) return;
      c.flag = !c.flag;
      flags += c.flag ? 1 : -1;
      paint(i);
      updateHud();
    }
    function lose(i) {
      over = true;
      endTime = Date.now();
      clearInterval(timer);
      cells[i].boom = true;
      cells.forEach(function (c, j) { if (c.mine) { c.showMine = true; paint(j); } });
      info.textContent = 'どかん！ ばくだんを掘っちゃった…　「やりなおす」でもう一回！';
      updateHud();
    }
    function win() {
      over = true;
      endTime = Date.now();
      clearInterval(timer);
      cells.forEach(function (c, j) { if (c.mine && !c.flag) { c.flag = true; flags++; paint(j); } });
      var secs = Math.max(1, Math.round((endTime - startTime) / 1000));
      var r = record('sweeper-' + level.id, secs, true);
      info.textContent = 'クリア！ ' + secs + ' 秒' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
    }
    function makeCell(i) {
      var el = h('button', { type: 'button', class: 'sw-cell', 'aria-label': 'まだ掘っていないマス' });
      var press = null;
      var longPressed = false;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') return;
        longPressed = false;
        press = setTimeout(function () { longPressed = true; toggleFlag(i); }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, function () { clearTimeout(press); }); });
      el.addEventListener('click', function () {
        if (longPressed) { longPressed = false; return; }
        if (flagMode) toggleFlag(i);
        else reveal(i);
      });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); toggleFlag(i); });
      return el;
    }
    function build() {
      clearInterval(timer);
      grid.replaceChildren();
      grid.style.setProperty('--cols', String(level.w));
      cells = [];
      started = false;
      over = false;
      opened = 0;
      flags = 0;
      info.textContent = '';
      for (var i = 0; i < level.w * level.h; i++) {
        var el = makeCell(i);
        cells.push({ mine: false, n: 0, open: false, flag: false, boom: false, showMine: false, el: el });
        grid.appendChild(el);
      }
      updateHud();
    }
    flagButton.addEventListener('click', function () {
      flagMode = !flagMode;
      flagButton.textContent = '🚩 はたモード：' + (flagMode ? 'オン' : 'オフ');
      flagButton.setAttribute('aria-pressed', flagMode ? 'true' : 'false');
    });
    resetButton.addEventListener('click', build);
    build();
    return function destroy() { clearInterval(timer); };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 6：ブロックくずし
  // ---------------------------------------------------------------------------
  function breakoutGame(stage) {
    var W = 320;
    var H = 420;
    var B = 32;
    var COLS = 9;
    var OX = (W - COLS * B) / 2;
    var OY = 50;
    var ROW_TYPES = ['diamond', 'gold', 'redstone', 'iron', 'coal'];
    var POINTS = { diamond: 30, gold: 20, redstone: 15, iron: 10, coal: 5 };
    var canvas = h('canvas', { width: W, height: H, class: 'pixel game-canvas game-breakout-canvas', tabindex: '0', 'aria-label': 'ブロックくずし' });
    var ctx = canvas.getContext('2d');
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    var keys = { left: false, right: false };
    stage.append(
      h('p', { class: 'game-howto' }, 'トロッコでボールを打ち返して、鉱石ブロックをぜんぶ崩そう。マウスや指で左右に動かすか、←→キー。クリック（スペースキー）でボールを発射。ダイヤは2回当てないと壊れない！'),
      hud, canvas,
      h('div', { class: 'game-actions' },
        holdButton('◀', '左へ', function (v) { keys.left = v; }),
        startButton,
        holdButton('▶', '右へ', function (v) { keys.right = v; })),
      info);

    var bricks = [];
    var paddle = { x: (W - 70) / 2, y: H - 28, w: 70, h: 12 };
    var ball = { x: 0, y: 0, vx: 0, vy: 0, r: 6 };
    var lives = 3;
    var score = 0;
    var level = 1;
    var launched = false;
    var playing = false;
    var raf = 0;
    var last = 0;
    var pointerX = null;

    function buildBricks() {
      bricks = [];
      ROW_TYPES.forEach(function (type, r) {
        for (var c = 0; c < COLS; c++) {
          var hp = type === 'diamond' ? 2 : 1;
          bricks.push({ x: OX + c * B, y: OY + r * B, type: type, hits: hp, max: hp });
        }
      });
    }
    function resetBall() {
      launched = false;
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
    }
    function launch() {
      if (!playing || launched) return;
      launched = true;
      var speed = 250 + (level - 1) * 35;
      var a = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
      ball.vx = Math.cos(a) * speed;
      ball.vy = Math.sin(a) * speed;
      info.textContent = '';
    }
    function updateHud() {
      hud.textContent = 'ステージ ' + level + '　スコア ' + score + '　のこり ' + '❤'.repeat(Math.max(0, lives)) + '　自己ベスト ' + bestText('breakout', '点');
    }
    function render() {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(0, 0, W, H);
      bricks.forEach(function (b) {
        if (b.hits > 0) drawBlock(ctx, b.type, b.x, b.y, B, 1 - b.hits / b.max);
      });
      // トロッコ
      ctx.fillStyle = '#7b7f87'; ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
      ctx.fillStyle = '#5a5e66'; ctx.fillRect(paddle.x, paddle.y, paddle.w, 3);
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(paddle.x + 8, paddle.y + paddle.h, 10, 5);
      ctx.fillRect(paddle.x + paddle.w - 18, paddle.y + paddle.h, 10, 5);
      // ボール
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    }
    function loseLife() {
      lives--;
      if (lives <= 0) { gameOver(); return; }
      resetBall();
      info.textContent = 'おっと！ クリックでもう一度発射';
    }
    function gameOver() {
      playing = false;
      cancelAnimationFrame(raf);
      render();
      overlayText(ctx, W, H, 'ゲームオーバー');
      var r = record('breakout', score, false);
      info.textContent = 'スコア ' + score + ' 点（ステージ ' + level + '）' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function loop(t) {
      if (!playing) return;
      var dt = Math.min(0.03, (t - last) / 1000 || 0);
      last = t;
      if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
      if (keys.left) paddle.x -= 380 * dt;
      if (keys.right) paddle.x += 380 * dt;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
      if (!launched) {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - ball.r - 1;
      } else {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
        if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
        if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
        // トロッコに当たった：当たった場所で角度を変える
        if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 10 &&
            ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
          var pos = Math.max(-1, Math.min(1, ((ball.x - paddle.x) / paddle.w) * 2 - 1));
          var speed = Math.hypot(ball.vx, ball.vy);
          var a = -Math.PI / 2 + pos * 1.05;
          ball.vx = Math.cos(a) * speed;
          ball.vy = Math.sin(a) * speed;
          ball.y = paddle.y - ball.r;
        }
        for (var i = 0; i < bricks.length; i++) {
          var b = bricks[i];
          if (b.hits <= 0) continue;
          var nx = Math.max(b.x, Math.min(ball.x, b.x + B));
          var ny = Math.max(b.y, Math.min(ball.y, b.y + B));
          var dx = ball.x - nx;
          var dy = ball.y - ny;
          if (dx * dx + dy * dy <= ball.r * ball.r) {
            if (Math.abs(dx) > Math.abs(dy)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
            else ball.vy = dy > 0 ? Math.abs(ball.vy) : (dy < 0 ? -Math.abs(ball.vy) : -ball.vy);
            b.hits--;
            if (b.hits <= 0) score += POINTS[b.type];
            break;
          }
        }
        if (bricks.every(function (x) { return x.hits <= 0; })) {
          level++;
          buildBricks();
          resetBall();
          info.textContent = 'ステージ ' + level + '！ クリックで発射';
        }
        if (ball.y - ball.r > H) loseLife();
      }
      updateHud();
      if (playing) {
        render();
        raf = requestAnimationFrame(loop);
      }
    }
    function start() {
      score = 0;
      lives = 3;
      level = 1;
      buildBricks();
      paddle.x = (W - paddle.w) / 2;
      playing = true;
      resetBall();
      info.textContent = 'クリック（スペースキー）でボールを発射！';
      startButton.disabled = true;
      canvas.focus();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    canvas.addEventListener('pointermove', function (e) {
      var rect = canvas.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) * (W / rect.width);
    });
    canvas.addEventListener('pointerleave', function () { pointerX = null; });
    canvas.addEventListener('pointerdown', function (e) {
      var rect = canvas.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) * (W / rect.width);
      launch();
    });
    var unlisten = listenKeys(function (e) {
      if (!playing) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; pointerX = null; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; pointerX = null; e.preventDefault(); }
      else if (e.key === ' ') { launch(); e.preventDefault(); }
    }, function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });
    startButton.addEventListener('click', start);
    buildBricks();
    resetBall();
    render();
    updateHud();
    return function destroy() { playing = false; cancelAnimationFrame(raf); unlisten(); };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 7：つみつみ鉱石（落ち物パズル。2〜3 個の鉱石でできたピースを積んで、横一列をそろえる）
  // ---------------------------------------------------------------------------
  function stackGame(stage) {
    var COLS = 8;
    var ROWS = 14;
    var C = 24;
    var PIECES = [
      [[0, 0], [1, 0]],
      [[0, 0], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [1, 1]],
    ];
    var canvas = h('canvas', { width: COLS * C, height: ROWS * C, class: 'pixel game-canvas game-stack-canvas', tabindex: '0', 'aria-label': 'つみつみ鉱石' });
    var ctx = canvas.getContext('2d');
    var nextCanvas = h('canvas', { width: 72, height: 72, class: 'pixel game-stack-next', 'aria-label': '次のピース' });
    var nctx = nextCanvas.getContext('2d');
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    stage.append(
      h('p', { class: 'game-howto' }, '落ちてくる鉱石のピースを動かして、横一列をすきまなくそろえると消えるよ。←→で移動、↑で回転、↓で少し速く、スペースで一気に落とす（スマホは下のボタン）。'),
      hud,
      h('div', { class: 'game-stack-wrap' }, canvas, h('div', { class: 'game-stack-side' }, h('div', null, 'つぎ'), nextCanvas)),
      h('div', { class: 'game-actions game-actions-wrap' },
        pressButton('◀', '左へ', function () { if (playing) move(-1); }, 90),
        pressButton('⟳', '回転', function () { if (playing) rotate(); }),
        pressButton('▼', '少し下へ', function () { if (playing) softDrop(); }, 60),
        pressButton('⤓', '一気に落とす', function () { if (playing) hardDrop(); }),
        pressButton('▶', '右へ', function () { if (playing) move(1); }, 90)),
      h('div', { class: 'game-actions' }, startButton),
      info);

    var board = [];
    var piece = null;
    var next = null;
    var playing = false;
    var score = 0;
    var lines = 0;
    var raf = 0;
    var last = 0;
    var acc = 0;
    var dropMs = 650;

    function emptyBoard() {
      board = [];
      for (var y = 0; y < ROWS; y++) board.push(new Array(COLS).fill(null));
    }
    function randPiece() {
      var shape = PIECES[Math.floor(Math.random() * PIECES.length)];
      return { cells: shape.map(function (c) { return c.slice(); }), ore: randomOre(), x: 0, y: 0 };
    }
    function widthOf(cells) { return Math.max.apply(null, cells.map(function (c) { return c[0]; })) + 1; }
    function fits(cells, x, y) {
      return cells.every(function (c) {
        var cx = x + c[0];
        var cy = y + c[1];
        return cx >= 0 && cx < COLS && cy < ROWS && (cy < 0 || !board[cy][cx]);
      });
    }
    function drawNext() {
      nctx.clearRect(0, 0, 72, 72);
      next.cells.forEach(function (c) { drawBlock(nctx, next.ore, 4 + c[0] * 22, 4 + c[1] * 22, 22, 0); });
    }
    function spawn() {
      piece = next || randPiece();
      next = randPiece();
      piece.x = Math.floor((COLS - widthOf(piece.cells)) / 2);
      piece.y = 0;
      drawNext();
      if (!fits(piece.cells, piece.x, piece.y)) gameOver();
    }
    function move(dx) {
      if (fits(piece.cells, piece.x + dx, piece.y)) piece.x += dx;
    }
    function rotate() {
      var r = piece.cells.map(function (c) { return [c[1], -c[0]]; });
      var minX = Math.min.apply(null, r.map(function (c) { return c[0]; }));
      var minY = Math.min.apply(null, r.map(function (c) { return c[1]; }));
      r = r.map(function (c) { return [c[0] - minX, c[1] - minY]; });
      var kicks = [0, -1, 1, -2];
      for (var i = 0; i < kicks.length; i++) {
        if (fits(r, piece.x + kicks[i], piece.y)) { piece.cells = r; piece.x += kicks[i]; return; }
      }
    }
    function softDrop() {
      if (fits(piece.cells, piece.x, piece.y + 1)) { piece.y++; score += 1; }
      else lock();
      acc = 0;
    }
    function hardDrop() {
      while (fits(piece.cells, piece.x, piece.y + 1)) { piece.y++; score += 2; }
      lock();
      acc = 0;
    }
    function lock() {
      piece.cells.forEach(function (c) {
        var cy = piece.y + c[1];
        if (cy >= 0) board[cy][piece.x + c[0]] = piece.ore;
      });
      var n = 0;
      for (var y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(Boolean)) {
          board.splice(y, 1);
          board.unshift(new Array(COLS).fill(null));
          n++;
          y++;
        }
      }
      if (n) {
        lines += n;
        score += [0, 100, 300, 600][n] || 1000;
        info.textContent = n + ' 列そろった！';
      }
      dropMs = Math.max(110, 650 - lines * 20);
      if (playing) spawn();
    }
    function render() {
      ctx.fillStyle = '#1f232c';
      ctx.fillRect(0, 0, COLS * C, ROWS * C);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for (var x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * C + 0.5, 0); ctx.lineTo(x * C + 0.5, ROWS * C); ctx.stroke(); }
      board.forEach(function (row, y) {
        row.forEach(function (ore, x) { if (ore) drawBlock(ctx, ore, x * C, y * C, C, 0); });
      });
      if (piece) {
        var gy = piece.y;
        while (fits(piece.cells, piece.x, gy + 1)) gy++;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        piece.cells.forEach(function (c) { ctx.strokeRect((piece.x + c[0]) * C + 1.5, (gy + c[1]) * C + 1.5, C - 3, C - 3); });
        piece.cells.forEach(function (c) { drawBlock(ctx, piece.ore, (piece.x + c[0]) * C, (piece.y + c[1]) * C, C, 0); });
      }
    }
    function updateHud() {
      hud.textContent = 'スコア ' + score + '　そろえた列 ' + lines + '　自己ベスト ' + bestText('stack', '点');
    }
    function loop(t) {
      if (!playing) return;
      acc += t - last;
      last = t;
      if (acc >= dropMs) {
        acc = 0;
        if (fits(piece.cells, piece.x, piece.y + 1)) piece.y++;
        else lock();
      }
      if (!playing) return;
      render();
      updateHud();
      raf = requestAnimationFrame(loop);
    }
    function gameOver() {
      playing = false;
      cancelAnimationFrame(raf);
      piece = null;
      render();
      overlayText(ctx, COLS * C, ROWS * C, 'ゲームオーバー');
      var r = record('stack', score, false);
      info.textContent = 'スコア ' + score + ' 点（' + lines + ' 列）' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      emptyBoard();
      score = 0;
      lines = 0;
      dropMs = 650;
      next = null;
      info.textContent = '';
      playing = true;
      startButton.disabled = true;
      spawn();
      canvas.focus();
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(loop);
    }
    var unlisten = listenKeys(function (e) {
      if (!playing) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') move(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') move(1);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') rotate();
      else if (k === 'ArrowDown' || k === 's' || k === 'S') softDrop();
      else if (k === ' ') hardDrop();
      else return;
      e.preventDefault();
    });
    startButton.addEventListener('click', start);
    emptyBoard();
    next = randPiece();
    drawNext();
    render();
    updateHud();
    return function destroy() { playing = false; cancelAnimationFrame(raf); unlisten(); };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 8：トロッコれっしゃ（鉱石を拾うとトロッコが長くなる）
  // ---------------------------------------------------------------------------
  function trainGame(stage) {
    var N = 15;
    var C = 20;
    var W = N * C;
    var canvas = h('canvas', { width: W, height: W, class: 'pixel game-canvas game-train-canvas', tabindex: '0', 'aria-label': 'トロッコれっしゃ' });
    var ctx = canvas.getContext('2d');
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    stage.append(
      h('p', { class: 'game-howto' }, 'トロッコを動かして鉱石を拾おう。拾うたびに車両が増えて、少し速くなるよ。壁や自分の車両にぶつかったらおしまい。矢印キー（WASD）、画面をスワイプ、または下のボタンで曲がる。'),
      hud, canvas,
      h('div', { class: 'game-dpad' },
        pressButton('▲', '上へ', function () { turn(0, -1); }),
        pressButton('◀', '左へ', function () { turn(-1, 0); }),
        pressButton('▶', '右へ', function () { turn(1, 0); }),
        pressButton('▼', '下へ', function () { turn(0, 1); })),
      h('div', { class: 'game-actions' }, startButton),
      info);

    var body = [];
    var cargo = [];
    var dir = { x: 1, y: 0 };
    var queue = [];
    var food = null;
    var playing = false;
    var score = 0;
    var raf = 0;
    var last = 0;
    var acc = 0;
    var stepMs = 150;

    function occupied(x, y) { return body.some(function (s) { return s.x === x && s.y === y; }); }
    function placeFood() {
      var x;
      var y;
      do { x = Math.floor(Math.random() * N); y = Math.floor(Math.random() * N); } while (occupied(x, y));
      food = { x: x, y: y, ore: randomOre() };
    }
    function turn(dx, dy) {
      if (!playing) return;
      var lastDir = queue.length ? queue[queue.length - 1] : dir;
      if ((lastDir.x === -dx && lastDir.y === -dy) || (lastDir.x === dx && lastDir.y === dy)) return;
      if (queue.length < 3) queue.push({ x: dx, y: dy });
    }
    function step() {
      if (queue.length) dir = queue.shift();
      var nx = body[0].x + dir.x;
      var ny = body[0].y + dir.y;
      var eat = food && nx === food.x && ny === food.y;
      var tailFree = !eat; // 食べないときは、しっぽが動くのでぶつからない
      var hitSelf = body.some(function (s, i) { return s.x === nx && s.y === ny && !(tailFree && i === body.length - 1); });
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || hitSelf) { gameOver(); return; }
      body.unshift({ x: nx, y: ny });
      if (eat) {
        score++;
        cargo.unshift(food.ore);
        stepMs = Math.max(70, 150 - score * 3);
        info.textContent = BLOCKS[food.ore].name + ' を積んだ！';
        placeFood();
      } else {
        body.pop();
      }
    }
    function render() {
      ctx.fillStyle = '#6b5a3e';
      ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = '#5c4c33';
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if ((x + y) % 2) ctx.fillRect(x * C, y * C, C, C);
      if (food) drawBlock(ctx, food.ore, food.x * C + 3, food.y * C + 3, C - 6, 0);
      body.forEach(function (s, i) {
        var x = s.x * C;
        var y = s.y * C;
        ctx.fillStyle = i === 0 ? '#9aa0a8' : '#7b7f87';
        ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
        ctx.fillStyle = '#4b4f57';
        ctx.fillRect(x + 1, y + 1, C - 2, 3);
        if (i === 0) {
          ctx.fillStyle = '#fff6b0';
          ctx.fillRect(x + C / 2 - 3 + dir.x * 6, y + C / 2 - 3 + dir.y * 6, 6, 6);
        } else if (cargo[i - 1]) {
          drawBlock(ctx, cargo[i - 1], x + 4, y + 4, C - 8, 0);
        }
      });
    }
    function updateHud() {
      hud.textContent = '積んだ鉱石 ' + score + '　車両 ' + body.length + '　自己ベスト ' + bestText('train', '個');
    }
    function loop(t) {
      if (!playing) return;
      acc += t - last;
      last = t;
      while (acc >= stepMs && playing) { acc -= stepMs; step(); }
      if (!playing) return;
      render();
      updateHud();
      raf = requestAnimationFrame(loop);
    }
    function gameOver() {
      playing = false;
      cancelAnimationFrame(raf);
      render();
      overlayText(ctx, W, W, 'ガシャーン！');
      var r = record('train', score, false);
      info.textContent = '鉱石を ' + score + ' 個積んだ！' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      var mid = Math.floor(N / 2);
      body = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
      cargo = [];
      dir = { x: 1, y: 0 };
      queue = [];
      score = 0;
      stepMs = 150;
      info.textContent = '';
      placeFood();
      playing = true;
      startButton.disabled = true;
      canvas.focus();
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(loop);
    }
    var swipe = null;
    canvas.addEventListener('pointerdown', function (e) { swipe = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', function (e) {
      if (!swipe) return;
      var dx = e.clientX - swipe.x;
      var dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
      else turn(0, dy > 0 ? 1 : -1);
    });
    var unlisten = listenKeys(function (e) {
      if (!playing) return;
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') turn(0, -1);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') turn(0, 1);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') turn(-1, 0);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') turn(1, 0);
      else return;
      e.preventDefault();
    });
    startButton.addEventListener('click', start);
    render();
    updateHud();
    return function destroy() { playing = false; cancelAnimationFrame(raf); unlisten(); };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 9：スライムたたき
  // ---------------------------------------------------------------------------
  function whackGame(stage) {
    var TIME = 30;
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    var field = h('div', { class: 'game-whack' });
    stage.append(
      h('p', { class: 'game-howto' }, '穴から出てくるスライムをたたこう！ 緑は +1、金色は +5。ばくだんをたたくと −3 だよ。30秒でどこまでいけるかな？'),
      hud, field, h('div', { class: 'game-actions' }, startButton), info);

    var holes = [];
    var playing = false;
    var score = 0;
    var endAt = 0;
    var spawnTimer = null;
    var tick = null;

    function setHole(i, what) {
      var hole = holes[i];
      clearTimeout(hole.timer);
      hole.what = what;
      hole.el.className = 'whack-hole' + (what ? ' up ' + what : '');
      hole.el.setAttribute('aria-label', what === 'slime' ? 'スライム' : what === 'gold' ? '金のスライム' : what === 'bomb' ? 'ばくだん' : '穴');
      hole.face.textContent = what === 'bomb' ? '💣' : '';
    }
    function updateHud() {
      var left = playing ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : TIME;
      hud.textContent = 'のこり ' + left + ' 秒　スコア ' + score + '　自己ベスト ' + bestText('whack', '点');
    }
    function spawn() {
      if (!playing) return;
      var empty = holes.filter(function (x) { return !x.what; });
      if (empty.length) {
        var hole = empty[Math.floor(Math.random() * empty.length)];
        var r = Math.random();
        var what = r < 0.12 ? 'gold' : r < 0.28 ? 'bomb' : 'slime';
        var i = holes.indexOf(hole);
        setHole(i, what);
        var progress = 1 - Math.max(0, endAt - Date.now()) / (TIME * 1000);
        hole.timer = setTimeout(function () { setHole(i, null); }, 1100 - progress * 450 + Math.random() * 250);
      }
      var progress2 = 1 - Math.max(0, endAt - Date.now()) / (TIME * 1000);
      spawnTimer = setTimeout(spawn, 700 - progress2 * 300 + Math.random() * 200);
    }
    function whack(i) {
      var hole = holes[i];
      if (!playing || !hole.what) return;
      var what = hole.what;
      score += what === 'gold' ? 5 : what === 'bomb' ? -3 : 1;
      score = Math.max(0, score);
      info.textContent = what === 'gold' ? '金のスライム！ +5' : what === 'bomb' ? 'どかん！ −3' : 'ぺちっ！ +1';
      setHole(i, null);
      hole.el.classList.add('hit');
      updateHud();
    }
    function finish() {
      playing = false;
      clearTimeout(spawnTimer);
      clearInterval(tick);
      holes.forEach(function (x, i) { setHole(i, null); });
      var r = record('whack', score, false);
      info.textContent = 'しゅうりょう！ スコア ' + score + ' 点' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      score = 0;
      info.textContent = '';
      playing = true;
      endAt = Date.now() + TIME * 1000;
      startButton.disabled = true;
      updateHud();
      tick = setInterval(function () { if (Date.now() >= endAt) finish(); else updateHud(); }, 200);
      spawn();
    }
    for (var i = 0; i < 9; i++) {
      (function (i) {
        var face = h('span', { class: 'whack-face', 'aria-hidden': 'true' });
        var el = h('button', { type: 'button', class: 'whack-hole', 'aria-label': '穴' }, h('span', { class: 'whack-slime', 'aria-hidden': 'true' }), face);
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); whack(i); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); whack(i); } });
        holes.push({ el: el, face: face, what: null, timer: null });
        field.appendChild(el);
      })(i);
    }
    startButton.addEventListener('click', start);
    updateHud();
    return function destroy() {
      playing = false;
      clearTimeout(spawnTimer);
      clearInterval(tick);
      holes.forEach(function (x) { clearTimeout(x.timer); });
    };
  }

  // ---------------------------------------------------------------------------
  // ゲーム 10：ジャンプでのぼれ！（足場をジャンプで登っていく）
  // ---------------------------------------------------------------------------
  function jumpGame(stage) {
    var W = 300;
    var H = 440;
    var P = 24;
    var GRAVITY = 1500;
    var JUMP = -640;
    var SPRING = -1000;
    var MOVE = 260;
    var TILE = 16;
    var canvas = h('canvas', { width: W, height: H, class: 'pixel game-canvas game-jump-canvas', tabindex: '0', 'aria-label': 'ジャンプでのぼれ' });
    var ctx = canvas.getContext('2d');
    var hud = h('div', { class: 'game-hud' });
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    var keys = { left: false, right: false };
    stage.append(
      h('p', { class: 'game-howto' }, '足場にのると自動でジャンプ！ 左右に動いて、どこまで高く登れるかな？ 鉄の足場は動く、石の足場は1回で崩れる、金の足場は大ジャンプ。画面のはしから出ると反対側から出てくるよ。←→キー（A・D）、画面の左右をタッチ、または下のボタンで動く。'),
      hud, canvas,
      h('div', { class: 'game-actions' },
        holdButton('◀', '左へ', function (v) { keys.left = v; }),
        startButton,
        holdButton('▶', '右へ', function (v) { keys.right = v; })),
      info);

    var player = { x: 0, y: 0, vy: 0 };
    var plats = [];
    var camY = 0;
    var topY = 0;
    var startY = 0;
    var height = 0;
    var playing = false;
    var raf = 0;
    var last = 0;

    function gap() {
      return 48 + Math.random() * Math.min(72, 26 + height / 8);
    }
    function addPlat(y) {
      var type = 'normal';
      var r = Math.random();
      if (height > 120 && r < 0.16) type = 'fragile';
      else if (height > 50 && r < 0.34) type = 'moving';
      else if (r > 0.93) type = 'spring';
      plats.push({
        x: Math.random() * (W - TILE * 4), y: y, w: TILE * 4, type: type, broken: false,
        vx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (50 + Math.min(90, height / 4)) : 0,
      });
    }
    function init() {
      plats = [];
      camY = 0;
      height = 0;
      player = { x: W / 2 - P / 2, y: H - 70 - P, vy: JUMP };
      startY = player.y;
      plats.push({ x: W / 2 - TILE * 2, y: H - 70, w: TILE * 4, type: 'normal', broken: false, vx: 0 });
      topY = H - 70;
      while (topY > -H) { topY -= gap(); addPlat(topY); }
    }
    function drawPlat(p) {
      var type = p.type === 'moving' ? 'iron' : p.type === 'fragile' ? 'stone' : p.type === 'spring' ? 'gold' : 'dirt';
      var y = p.y - camY;
      for (var i = 0; i < p.w / TILE; i++) drawBlock(ctx, type, p.x + i * TILE, y, TILE, p.type === 'fragile' ? 0.5 : 0);
      if (p.type === 'normal') { ctx.fillStyle = '#5aa83a'; ctx.fillRect(p.x, y, p.w, 4); }
      if (p.type === 'spring') { ctx.fillStyle = '#fff6b0'; ctx.fillRect(p.x + p.w / 2 - 6, y - 5, 12, 5); }
    }
    function render() {
      var t = Math.min(1, height / 1500);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, t < 0.5 ? '#6ec6ff' : '#141a3a');
      g.addColorStop(1, t < 0.5 ? '#cdeeff' : '#3a2f6b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (t >= 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (var s = 0; s < 30; s++) ctx.fillRect((s * 97) % W, ((s * 53 - camY * 0.1) % H + H) % H, 2, 2);
      }
      plats.forEach(drawPlat);
      drawExplorer(ctx, player.x, player.y - camY, P);
      if (player.x > W - P) drawExplorer(ctx, player.x - W, player.y - camY, P); // はしから反対側へ
    }
    function updateHud() {
      hud.textContent = '高さ ' + height + ' m　自己ベスト ' + bestText('jump', ' m');
    }
    function loop(t) {
      if (!playing) return;
      var dt = Math.min(0.03, (t - last) / 1000 || 0);
      last = t;
      var dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      player.x += dirX * MOVE * dt;
      if (player.x > W) player.x -= W;
      if (player.x < -P) player.x += W;
      var prevBottom = player.y + P;
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      var bottom = player.y + P;
      plats.forEach(function (p) {
        if (p.type === 'moving') {
          p.x += p.vx * dt;
          if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
          if (p.x > W - p.w) { p.x = W - p.w; p.vx = -Math.abs(p.vx); }
        }
        if (p.broken) p.y += 320 * dt;
      });
      if (player.vy > 0) {
        for (var i = 0; i < plats.length; i++) {
          var p = plats[i];
          if (p.broken) continue;
          if (prevBottom <= p.y && bottom >= p.y && player.x + P - 5 > p.x && player.x + 5 < p.x + p.w) {
            player.y = p.y - P;
            player.vy = p.type === 'spring' ? SPRING : JUMP;
            if (p.type === 'fragile') p.broken = true;
            break;
          }
        }
      }
      if (player.y < camY + H * 0.38) camY = player.y - H * 0.38;
      height = Math.max(height, Math.floor((startY - player.y) / 10));
      plats = plats.filter(function (p) { return p.y < camY + H + 60; });
      while (topY > camY - 60) { topY -= gap(); addPlat(topY); }
      if (player.y > camY + H + 40) { gameOver(); return; }
      render();
      updateHud();
      raf = requestAnimationFrame(loop);
    }
    function gameOver() {
      playing = false;
      cancelAnimationFrame(raf);
      overlayText(ctx, W, H, '落っこちた！');
      var r = record('jump', height, false);
      info.textContent = '高さ ' + height + ' m まで登った！' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      init();
      info.textContent = '';
      playing = true;
      startButton.disabled = true;
      canvas.focus();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    canvas.addEventListener('pointerdown', function (e) {
      var rect = canvas.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width / 2) keys.left = true; else keys.right = true;
      canvas.setPointerCapture(e.pointerId);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { keys.left = false; keys.right = false; });
    });
    var unlisten = listenKeys(function (e) {
      if (!playing) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
    }, function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });
    startButton.addEventListener('click', start);
    init();
    render();
    updateHud();
    return function destroy() { playing = false; cancelAnimationFrame(raf); unlisten(); };
  }

  // ---------------------------------------------------------------------------
  // ゲームセンター（メニュー）
  // ---------------------------------------------------------------------------
  var GAMES = [
    { id: 'mine', name: 'ほりほりチャレンジ', icon: 'diamond', run: miningGame },
    { id: 'jump', name: 'ジャンプでのぼれ！', icon: 'gold', run: jumpGame },
    { id: 'sweeper', name: 'どかんさがし', icon: 'coal', run: sweeperGame },
    { id: 'breakout', name: 'ブロックくずし', icon: 'lapis', run: breakoutGame },
    { id: 'stack', name: 'つみつみ鉱石', icon: 'copper', run: stackGame },
    { id: 'train', name: 'トロッコれっしゃ', icon: 'iron', run: trainGame },
    { id: 'whack', name: 'スライムたたき', icon: 'emerald', run: whackGame },
    { id: 'dodge', name: 'よけろ！落ちブロック', icon: 'stone', run: dodgeGame },
    { id: 'memory', name: '鉱石あわせ', icon: 'dirt', run: memoryGame },
    { id: 'reaction', name: 'はんのう速度', icon: 'redstone', run: reactionGame },
  ];

  function mount(container) {
    var destroy = null;
    var stage = h('div', { class: 'game-stage', id: 'game-stage' });
    var title = h('h2', { class: 'games-title' }, '🎮 ひみつのゲームセンター');
    var menu = h('div', { class: 'games-menu', role: 'group', 'aria-label': 'ゲームをえらぶ' });
    GAMES.forEach(function (g) {
      var button = h('button', { type: 'button', class: 'games-menu-item', id: 'game-' + g.id },
        blockCanvas(g.icon, 32), h('span', null, g.name));
      button.addEventListener('click', function () { open(g, button); });
      menu.appendChild(button);
    });
    function open(g, button) {
      if (destroy) destroy();
      menu.querySelectorAll('.games-menu-item').forEach(function (b) { b.setAttribute('aria-pressed', b === button ? 'true' : 'false'); });
      stage.replaceChildren(h('h3', { class: 'game-name' }, g.name));
      destroy = g.run(stage);
    }
    container.replaceChildren(title,
      h('p', { class: 'games-lead' }, 'みつけてくれてありがとう！ ページは見つからなかったけど、ここで少し遊んでいってね。'),
      menu, stage);
    container.hidden = false;
    open(GAMES[0], menu.firstChild);
    return function () { if (destroy) destroy(); };
  }

  window.WikiGames = { mount: mount, drawBlock: drawBlock, BLOCKS: BLOCKS };
})();
