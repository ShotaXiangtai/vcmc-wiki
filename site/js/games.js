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
    var TIME = 20;
    var canvas = h('canvas', { width: 160, height: 160, class: 'pixel game-mine-block', tabindex: '0', 'aria-label': 'ブロック（クリックかスペースキーで掘る）' });
    var ctx = canvas.getContext('2d');
    var info = h('p', { class: 'game-info', 'aria-live': 'polite' });
    var hud = h('div', { class: 'game-hud' });
    var startButton = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive' }, 'スタート');
    stage.append(
      h('p', { class: 'game-howto' }, '20秒で、ブロックをどれだけ掘れるかな？ ブロックをクリック（スマホはタップ、パソコンはスペースキーでも OK）。固い鉱石ほど高得点！'),
      hud, canvas, info, h('div', { class: 'game-actions' }, startButton));

    var playing = false;
    var score = 0;
    var mined = 0;
    var type = 'stone';
    var hits = 0;
    var endAt = 0;
    var timer = null;
    var rnd = Math.random;

    function draw() {
      ctx.clearRect(0, 0, 160, 160);
      drawBlock(ctx, type, 0, 0, 160, hits / BLOCKS[type].hits);
    }
    function updateHud() {
      var left = playing ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : TIME;
      hud.textContent = 'のこり ' + left + ' 秒　スコア ' + score + '　掘った数 ' + mined + '　自己ベスト ' + bestText('mine', '点');
    }
    function nextBlock() {
      type = pickWeighted(rnd);
      hits = 0;
      draw();
    }
    function hit() {
      if (!playing) return;
      hits++;
      if (hits >= BLOCKS[type].hits) {
        score += BLOCKS[type].points;
        mined++;
        info.textContent = BLOCKS[type].name + ' を掘った！ +' + BLOCKS[type].points;
        nextBlock();
      } else {
        draw();
      }
      updateHud();
    }
    function finish() {
      playing = false;
      clearInterval(timer);
      var r = record('mine', score, false);
      info.textContent = 'しゅうりょう！ スコア ' + score + ' 点（' + mined + ' 個）' + (r.isNew ? '　🎉 自己ベスト更新！' : '');
      startButton.textContent = 'もう一回';
      startButton.disabled = false;
      updateHud();
    }
    function start() {
      playing = true;
      score = 0;
      mined = 0;
      info.textContent = '';
      endAt = Date.now() + TIME * 1000;
      startButton.disabled = true;
      nextBlock();
      updateHud();
      canvas.focus();
      timer = setInterval(function () {
        if (Date.now() >= endAt) finish();
        else updateHud();
      }, 200);
    }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); hit(); });
    canvas.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) hit(); }
    });
    startButton.addEventListener('click', start);
    draw();
    updateHud();
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
  // ゲームセンター（メニュー）
  // ---------------------------------------------------------------------------
  var GAMES = [
    { id: 'mine', name: 'ほりほりチャレンジ', icon: 'diamond', run: miningGame },
    { id: 'dodge', name: 'よけろ！落ちブロック', icon: 'stone', run: dodgeGame },
    { id: 'memory', name: '鉱石あわせ', icon: 'emerald', run: memoryGame },
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
