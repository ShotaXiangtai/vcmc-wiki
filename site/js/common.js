// 共通部品：画面の枠（サイドバー・タブ・検索・フッター）と Markdown の描画
// 依存: config.js, rules.js, vendor/marked.umd.js, vendor/purify.min.js
(function () {
  'use strict';

  var cfg = window.WIKI_CONFIG;
  var Rules = window.WikiRules;
  var Wiki = {};

  // ---------------------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------------------

  /** 要素を作る。attrs の on〜 に関数を渡すとイベントになる。子は文字列か Node */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(parent, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(parent, x); }); return; }
    parent.append(c instanceof Node ? c : String(c));
  }
  Wiki.h = h;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  Wiki.escapeHtml = escapeHtml;

  Wiki.config = cfg;
  Wiki.rules = Rules;

  /** ページ名を整える（Unicode 正規化と前後の空白除去） */
  Wiki.normalizeTitle = function (t) {
    return String(t == null ? '' : t).normalize('NFC').trim();
  };

  Wiki.pageUrl = function (title, hash) {
    return './?p=' + encodeURIComponent(title) + (hash ? '#' + encodeURIComponent(hash) : '');
  };
  Wiki.editUrl = function (title) {
    return 'edit.html' + (title ? '?p=' + encodeURIComponent(title) : '');
  };
  Wiki.repoUrl = function () {
    return 'https://github.com/' + cfg.repo;
  };
  Wiki.historyUrl = function (title) {
    return Wiki.repoUrl() + '/commits/' + encodeURIComponent(cfg.branch) +
      '/site/pages/' + encodeURIComponent(title) + '.md';
  };
  Wiki.pullsUrl = function () {
    return Wiki.repoUrl() + '/pulls';
  };
  /** GitHub の編集画面（既存ページ）または新規ファイル作成画面（新しいページ）の URL */
  Wiki.githubEditUrl = function (title, exists) {
    var branch = encodeURIComponent(cfg.branch);
    if (exists) return Wiki.repoUrl() + '/edit/' + branch + '/site/pages/' + encodeURIComponent(title) + '.md';
    return Wiki.repoUrl() + '/new/' + branch + '/site/pages?filename=' + encodeURIComponent(title + '.md');
  };

  Wiki.setDocTitle = function (t) {
    document.title = t ? t + ' - ' + cfg.siteName : cfg.siteName;
  };

  Wiki.params = function () {
    return new URLSearchParams(location.search);
  };

  // ---------------------------------------------------------------------------
  // ページの取得
  // ---------------------------------------------------------------------------

  /** 記事の Markdown を取得する。存在しなければ null */
  Wiki.fetchPage = function (title) {
    return fetch('pages/' + encodeURIComponent(title) + '.md', { cache: 'no-cache' }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  };

  /**
   * 一覧（index.json）に無いページは取りに行かずに null を返す（404 を出さないため）。
   * 一覧が読めなかったときは、とりあえず取りに行く。
   */
  Wiki.fetchPageIfListed = function (title) {
    return Wiki.loadIndex().then(function (list) {
      if (list && !list.some(function (p) { return p.title === title; })) return null;
      return Wiki.fetchPage(title);
    });
  };

  var indexPromise = null;
  /** pages/index.json（[{title, excerpt}]）を読む。読めなければ null */
  Wiki.loadIndex = function () {
    if (!indexPromise) {
      indexPromise = fetch('pages/index.json', { cache: 'no-cache' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .catch(function () { return null; })
        .then(function (list) {
          if (!Array.isArray(list)) {
            console.warn('pages/index.json を読めませんでした（node scripts/build-index.mjs で作れます）');
            return null;
          }
          return list;
        });
    }
    return indexPromise;
  };

  /** index から存在するページ名の Set を作る。index が無いときは null（＝全部存在扱い） */
  Wiki.pageSet = function (list) {
    if (!list) return null;
    var set = new Set();
    list.forEach(function (p) { set.add(p.title); });
    return set;
  };

  // ---------------------------------------------------------------------------
  // Markdown の描画
  // ---------------------------------------------------------------------------

  /** [[ページ名]] / [[ページ名|表示名]] / [[ページ名#節]] を扱う marked の拡張 */
  function wikiLinkExtension(pageSet) {
    return {
      name: 'wikilink',
      level: 'inline',
      start: function (src) {
        var i = src.indexOf('[[');
        return i < 0 ? undefined : i;
      },
      tokenizer: function (src) {
        var m = /^\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/.exec(src);
        if (!m) return undefined;
        return { type: 'wikilink', raw: m[0], target: m[1], label: m[2] };
      },
      renderer: function (token) {
        var special = renderEmbedOrSkin(token);
        if (special != null) return special;
        var target = token.target.trim();
        var hash = '';
        var hi = target.indexOf('#');
        if (hi >= 0) {
          hash = target.slice(hi + 1).trim().replace(/\s+/g, '_'); // 見出しの id と同じ形にする
          target = target.slice(0, hi);
        }
        var title = Wiki.normalizeTitle(target);
        var label = token.label != null ? token.label.trim() : token.target.trim();
        if (!title && hash) {
          return '<a href="#' + escapeHtml(encodeURIComponent(hash)) + '" class="wikilink">' + escapeHtml(label) + '</a>';
        }
        if (Rules.checkTitle(title)) return escapeHtml(token.raw); // 不正な名前はそのまま文字で出す
        var exists = !pageSet || pageSet.has(title);
        if (exists) {
          return '<a href="' + escapeHtml(Wiki.pageUrl(title, hash)) + '" class="wikilink" title="' +
            escapeHtml(title) + '">' + escapeHtml(label) + '</a>';
        }
        return '<a href="' + escapeHtml(Wiki.editUrl(title)) + '" class="wikilink new" title="' +
          escapeHtml(title + '（存在しないページ）') + '">' + escapeHtml(label) + '</a>';
      },
    };
  }

  function prefixOf(s, prefixes) {
    for (var i = 0; i < prefixes.length; i++) if (s.indexOf(prefixes[i]) === 0) return prefixes[i];
    return null;
  }

  function fillTemplate(tpl, name, size) {
    return tpl.replace('{name}', encodeURIComponent(name)).replace('{size}', String(size));
  }

  /**
   * [[埋め込み:URL]]（X のポスト・YouTube の動画）と [[スキン:MCID]] / [[スキン:MCID|64]] / [[スキン:MCID|顔だけ]]
   * それ以外の [[...]] なら null を返す。
   * 埋め込みはここでは目印の <span> を出すだけで、カードと読み込みは postProcess / Wiki.loadEmbeds が作る。
   */
  function renderEmbedOrSkin(token) {
    var raw = token.target.trim();
    var ep = prefixOf(raw, Rules.EMBED_PREFIXES);
    if (ep) {
      var e = Rules.parseEmbed(raw.slice(ep.length));
      if (!e) return '<span class="wiki-embed-error">' + escapeHtml(token.raw) + '（埋め込めない URL です。X のポストか YouTube の動画の URL を書いてください）</span>';
      var label = e.type === 'x' ? '@' + e.user + ' の X のポスト' : 'YouTube の動画';
      return '<span class="wiki-embed-mark"><a href="' + escapeHtml(e.url) + '">' + escapeHtml(label) + '</a></span>';
    }
    var sp = prefixOf(raw, Rules.SKIN_PREFIXES);
    if (sp) {
      var name = raw.slice(sp.length).trim();
      if (!Rules.isMcid(name)) return '<span class="wiki-embed-error">' + escapeHtml(token.raw) + '（MCID の形が正しくありません）</span>';
      var opt = token.label != null ? token.label.trim() : '';
      var faceOnly = /^\d+$/.test(opt) || opt === '顔だけ';
      var size = /^\d+$/.test(opt) ? Math.max(16, Math.min(128, parseInt(opt, 10))) : (faceOnly ? 32 : 20);
      var skin = cfg.skin;
      return '<a href="' + escapeHtml(fillTemplate(skin.profile, name, size)) + '" class="skin-link" title="' +
        escapeHtml(name + '（NameMC で見る）') + '"><img class="skin-face" src="' +
        escapeHtml(fillTemplate(skin.face, name, Math.min(256, size * 2))) + '" alt="' +
        escapeHtml(faceOnly ? name + ' のスキンの顔' : '') + '" width="' + size + '" height="' + size + '">' +
        (faceOnly ? '' : '<span class="skin-name">' + escapeHtml(name) + '</span>') + '</a>';
    }
    return null;
  }

  var SANITIZE_OPTIONS = {
    RETURN_DOM_FRAGMENT: true,
    // 見た目を乗っ取れるもの・入力欄は使わせない
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'dialog', 'template'],
    // id / name は描画側で付ける（ページの部品と衝突させない）
    FORBID_ATTR: ['style', 'id', 'name'],
    ALLOW_DATA_ATTR: false,
  };

  /** Markdown を安全な DocumentFragment にする（目次・リンク処理込み） */
  Wiki.renderMarkdown = function (src, pageSet, opts) {
    var md = new window.marked.Marked({ gfm: true, breaks: true, async: false });
    md.use({ extensions: [wikiLinkExtension(pageSet)] });
    var html = md.parse(String(src));
    // 必ず DOMPurify を通す
    var frag = window.DOMPurify.sanitize(html, SANITIZE_OPTIONS);
    postProcess(frag, opts || {});
    return frag;
  };

  /** container の中身を描画結果で置き換える（opts.toc === false で目次を作らない） */
  Wiki.renderInto = function (container, src, pageSet, opts) {
    container.replaceChildren(); // 先に空にする（見出しの id 重複判定のため）
    container.appendChild(Wiki.renderMarkdown(src, pageSet, opts));
  };

  function postProcess(frag, opts) {
    // リンク：外部リンクは別タブ + noopener noreferrer nofollow
    frag.querySelectorAll('a[href]').forEach(function (a) {
      var u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin) {
        a.setAttribute('rel', 'noopener noreferrer nofollow');
        a.setAttribute('target', '_blank');
        if (!a.classList.contains('skin-link')) a.classList.add('external');
      }
    });
    // 画像：このサイトの画像とスキンの顔だけ表示する（外部の画像サイトは使わない）
    var skinHost = new URL(cfg.skin.face.replace('{name}', 'x').replace('{size}', '8')).host;
    frag.querySelectorAll('img').forEach(function (img) {
      var u;
      try { u = new URL(img.getAttribute('src') || '', location.href); } catch (e) { u = null; }
      var allowed = u && (u.origin === location.origin || (u.protocol === 'https:' && u.host === skinHost && img.classList.contains('skin-face')));
      if (!allowed) {
        img.replaceWith(h('span', { class: 'external-image-blocked' },
          '［外部の画像は表示できません。画像は X のポストを [[埋め込み:URL]] で貼ってください］'));
        return;
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
    });
    // 埋め込み：押すまで外部から読み込まないカードにする
    frag.querySelectorAll('span.wiki-embed-mark').forEach(function (mark) {
      var a = mark.querySelector('a[href]');
      var e = a && Rules.parseEmbed(a.getAttribute('href'));
      if (!e) { mark.replaceWith(document.createTextNode(mark.textContent)); return; }
      mark.replaceWith(embedCard(e));
    });
    // 入力欄はタスクリストのチェックボックスだけ残す（操作不可）
    frag.querySelectorAll('input').forEach(function (input) {
      if (input.getAttribute('type') === 'checkbox') input.setAttribute('disabled', '');
      else input.remove();
    });
    // 表：Wikipedia 風の枠と、スマホ用の横スクロール
    frag.querySelectorAll('table').forEach(function (t) {
      t.classList.add('wikitable');
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
    // 見出し：id を付けて、3 つ以上なら目次を作る
    var headings = Array.prototype.slice.call(frag.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    var used = Object.create(null);
    headings.forEach(function (hd) {
      var base = (hd.textContent.trim() || '節').replace(/\s+/g, '_');
      var id = base;
      var n = 2;
      while (used[id] || document.getElementById(id)) id = base + '_' + n++;
      used[id] = true;
      hd.id = id;
    });
    if (headings.length >= 3 && opts.toc !== false) insertToc(frag, headings);
  }

  function insertToc(frag, headings) {
    // 見出しの入れ子を作る
    var root = { level: 0, children: [] };
    var stack = [root];
    headings.forEach(function (hd) {
      var level = Number(hd.tagName.charAt(1));
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      var node = { level: level, heading: hd, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    function build(nodes, prefix, depth) {
      var ul = h('ul');
      nodes.forEach(function (node, i) {
        var num = prefix ? prefix + '.' + (i + 1) : String(i + 1);
        var li = h('li', { class: 'toclevel-' + depth },
          h('a', { href: '#' + node.heading.id },
            h('span', { class: 'tocnumber' }, num), ' ',
            h('span', { class: 'toctext' }, node.heading.textContent)));
        if (node.children.length) li.appendChild(build(node.children, num, depth + 1));
        ul.appendChild(li);
      });
      return ul;
    }

    var toggle = h('button', { type: 'button', class: 'toctoggle', 'aria-expanded': 'true' }, '非表示');
    var toc = h('div', { id: 'toc', class: 'toc', role: 'navigation', 'aria-labelledby': 'mw-toc-heading' },
      h('div', { class: 'toctitle' },
        h('h2', { id: 'mw-toc-heading' }, '目次'),
        h('span', { class: 'toctogglespan' }, '[', toggle, ']')),
      build(root.children, '', 1));
    toggle.addEventListener('click', function () {
      var hidden = toc.classList.toggle('tochidden');
      toggle.textContent = hidden ? '表示' : '非表示';
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    });

    // 最初の見出しの直前（＝導入文のあと）に置く
    var first = headings[0];
    while (first.parentNode && first.parentNode !== frag) first = first.parentNode;
    if (first.parentNode === frag) frag.insertBefore(toc, first);
    else frag.insertBefore(toc, frag.firstChild);
  }

  /** 文字をクリップボードにコピーする。成功したら true（Promise） */
  Wiki.copyText = function (text) {
    function legacy() {
      var helper = h('textarea', { class: 'clipboard-helper', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      helper.remove();
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  };

  // ---------------------------------------------------------------------------
  // 埋め込み（X のポスト・YouTube の動画）。見る人が「表示する」を押すまで外部から読み込まない
  // ---------------------------------------------------------------------------

  var EMBED_SERVICES = {
    x: { name: 'X', open: 'X で開く', note: '「表示する」を押すと、X（外部のサービス）から読み込みます。' },
    youtube: { name: 'YouTube', open: 'YouTube で開く', note: '「表示する」を押すと、YouTube（外部のサービス）から読み込みます。' },
  };

  function embedCard(e) {
    var svc = EMBED_SERVICES[e.type];
    var button = h('button', { type: 'button', class: 'mw-ui-button mw-ui-progressive wiki-embed-load' }, '表示する');
    var status = h('span', { class: 'wiki-embed-status', 'aria-live': 'polite' });
    var title = e.type === 'x' ? '@' + e.user + ' のポスト' : '動画';
    var wrap = h('div', { class: 'wiki-embed wiki-embed-' + e.type, 'data-embed-type': e.type, 'data-embed-id': e.id },
      h('div', { class: 'wiki-embed-card' },
        h('div', { class: 'wiki-embed-head' },
          h('span', { class: 'wiki-embed-service' }, svc.name), ' ', title),
        h('div', { class: 'wiki-embed-actions' },
          button, ' ',
          h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, svc.open), ' ',
          status),
        h('p', { class: 'wiki-embed-note' }, svc.note)),
      h('div', { class: 'wiki-embed-frame', hidden: true }));
    button.addEventListener('click', function () {
      Wiki.loadEmbeds(e.type, document);
    });
    return wrap;
  }

  var xScriptPromise = null;
  function loadXScript() {
    if (window.twttr && window.twttr.widgets) return Promise.resolve(window.twttr);
    if (xScriptPromise) return xScriptPromise;
    xScriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://platform.x.com/widgets.js';
      s.async = true;
      s.charset = 'utf-8';
      s.onload = function () {
        if (window.twttr && typeof window.twttr.ready === 'function') window.twttr.ready(resolve);
        else reject(new Error('twttr not available'));
      };
      s.onerror = function () { reject(new Error('widgets.js failed')); };
      document.head.appendChild(s);
    });
    xScriptPromise.catch(function () { xScriptPromise = null; });
    return xScriptPromise;
  }

  function setEmbedStatus(wrap, text) {
    var status = wrap.querySelector('.wiki-embed-status');
    if (status) status.textContent = text;
  }

  function embedFailed(wrap, text) {
    var button = wrap.querySelector('.wiki-embed-load');
    if (button) { button.disabled = false; button.textContent = 'もう一度表示する'; }
    setEmbedStatus(wrap, text);
    wrap.classList.add('wiki-embed-failed');
  }

  function embedShown(wrap, frame) {
    wrap.querySelector('.wiki-embed-card').hidden = true;
    frame.hidden = false;
    wrap.classList.add('wiki-embed-loaded');
  }

  /** root の中の、まだ読み込んでいない type の埋め込みをすべて表示する */
  Wiki.loadEmbeds = function (type, root) {
    var wraps = Array.prototype.slice.call((root || document).querySelectorAll(
      '.wiki-embed[data-embed-type="' + type + '"]:not(.wiki-embed-loaded):not(.wiki-embed-loading)'));
    wraps.forEach(function (wrap) {
      wrap.classList.remove('wiki-embed-failed');
      wrap.classList.add('wiki-embed-loading');
      var button = wrap.querySelector('.wiki-embed-load');
      if (button) { button.disabled = true; button.textContent = '読み込み中…'; }
      setEmbedStatus(wrap, '');
    });
    if (!wraps.length) return;

    if (type === 'youtube') {
      wraps.forEach(function (wrap) {
        var frame = wrap.querySelector('.wiki-embed-frame');
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(wrap.getAttribute('data-embed-id'));
        iframe.title = 'YouTube の動画';
        iframe.setAttribute('allow', 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        frame.replaceChildren(iframe);
        wrap.classList.remove('wiki-embed-loading');
        embedShown(wrap, frame);
      });
      return;
    }

    loadXScript().then(function (twttr) {
      wraps.forEach(function (wrap) {
        var frame = wrap.querySelector('.wiki-embed-frame');
        frame.replaceChildren();
        frame.hidden = false; // X の部品は見えている場所でないと大きさを決められないため、先に出しておく
        twttr.widgets.createTweet(wrap.getAttribute('data-embed-id'), frame, {
          dnt: true, lang: 'ja', conversation: 'none', align: 'center',
        }).then(function (el) {
          wrap.classList.remove('wiki-embed-loading');
          if (el) embedShown(wrap, frame);
          else { frame.hidden = true; embedFailed(wrap, 'ポストを表示できませんでした（削除されたか、見られない設定のポストです）。'); }
        }, function () {
          wrap.classList.remove('wiki-embed-loading');
          frame.hidden = true;
          embedFailed(wrap, 'ポストを表示できませんでした。');
        });
      });
    }, function () {
      wraps.forEach(function (wrap) {
        wrap.classList.remove('wiki-embed-loading');
        embedFailed(wrap, 'X を読み込めませんでした。通信状況や、広告ブロッカーなどの設定を確認してください。');
      });
    });
  };

  /** URL の #節 へスクロールする（描画が非同期なので手動で） */
  Wiki.scrollToHash = function () {
    if (!location.hash) return;
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    var target = document.getElementById(id);
    if (target) target.scrollIntoView();
  };

  // ---------------------------------------------------------------------------
  // 画面の枠
  // ---------------------------------------------------------------------------

  var SEARCH_ICON = '<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true" focusable="false">' +
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M12.5 12.5 18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function tab(label, href, opt) {
    opt = opt || {};
    var cls = [opt.selected ? 'selected' : '', opt.isNew ? 'new' : ''].filter(Boolean).join(' ');
    var aAttrs = { href: href, title: opt.tip || null, 'aria-current': opt.selected ? 'page' : null };
    if (opt.external) { aAttrs.target = '_blank'; aAttrs.rel = 'noopener noreferrer'; }
    return h('li', { id: opt.id || null, class: cls || null }, h('span', null, h('a', aAttrs, label)));
  }

  function portal(id, label, items) {
    var headingId = id + '-label';
    return h('nav', { id: id, class: 'portal', 'aria-labelledby': label ? headingId : null, 'aria-label': label ? null : 'ナビゲーション' },
      label ? h('h3', { id: headingId }, label) : null,
      h('div', { class: 'body' }, h('ul', null, items.filter(Boolean).map(function (it) {
        var attrs = { href: it.href, title: it.tip || null };
        if (it.external) { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
        return h('li', { id: it.id || null }, h('a', attrs, it.text));
      }))));
  }

  /**
   * 画面の枠を作って、本文を入れる場所を返す。
   * o.page: 記事名（記事の画面のとき）
   * o.exists: 記事が存在するか
   * o.active: 'view' | 'edit'（記事の画面で選ばれているタブ）
   * o.special: true なら特別ページ（タブは「特別ページ」だけ）
   * o.showSiteSub: 「出典」行を出すか
   */
  Wiki.layout = function (o) {
    o = o || {};
    var body = document.body;
    body.classList.add('skin-vector');
    body.replaceChildren();

    var heading = h('h1', { id: 'firstHeading', class: 'firstHeading' });
    var siteSub = h('div', { id: 'siteSub', hidden: o.showSiteSub ? null : true }, '出典: ' + cfg.siteName);
    var contentSub = h('div', { id: 'contentSub' });
    var contentText = h('div', { id: 'mw-content-text', class: 'mw-body-content' });

    var content = h('main', { id: 'content', class: 'mw-body' },
      heading,
      h('div', { id: 'bodyContent' }, siteSub, contentSub, contentText));

    // タブ
    var leftTabs = h('ul');
    var rightTabs = h('ul');
    if (o.special) {
      leftTabs.appendChild(tab('特別ページ', location.pathname + location.search, { selected: true, id: 'ca-nstab-special' }));
    } else if (o.page) {
      leftTabs.appendChild(tab('ページ', Wiki.pageUrl(o.page), { selected: true, isNew: !o.exists, id: 'ca-nstab-main', tip: '本文を表示' }));
      rightTabs.appendChild(tab('閲覧', Wiki.pageUrl(o.page), { selected: o.active === 'view', id: 'ca-view' }));
      rightTabs.appendChild(tab(o.exists ? '編集' : '作成', Wiki.editUrl(o.page), {
        selected: o.active === 'edit', id: o.exists ? 'ca-edit' : 'ca-create',
        tip: o.exists ? 'このページを編集する' : 'このページを作成する',
      }));
      if (o.exists) {
        rightTabs.appendChild(tab('履歴', Wiki.historyUrl(o.page), { id: 'ca-history', tip: 'GitHub で変更の履歴を見る', external: true }));
      }
    }

    var searchInput = h('input', {
      type: 'search', name: 'search', id: 'searchInput', placeholder: cfg.siteName + ' 内を検索',
      'aria-label': 'Wiki 内を検索', autocomplete: 'off', maxlength: 100,
    });
    var current = Wiki.params().get('search');
    if (current) searchInput.value = current;
    var searchButton = h('button', { type: 'submit', id: 'searchButton', class: 'searchButton', title: '検索' });
    searchButton.innerHTML = SEARCH_ICON + '<span class="visually-hidden">検索</span>';

    var head = h('div', { id: 'mw-head' },
      h('nav', { id: 'p-personal', 'aria-label': '案内' },
        h('ul', null,
          h('li', { id: 'pt-anon' }, 'GitHub アカウントで編集を提案できます（承認制）'),
          h('li', null, h('a', { href: Wiki.pageUrl(cfg.howtoPage) }, '投稿のしかた')))),
      h('div', { id: 'left-navigation' },
        h('nav', { id: 'p-namespaces', class: 'vectorTabs', 'aria-label': '名前空間' }, leftTabs)),
      h('div', { id: 'right-navigation' },
        h('nav', { id: 'p-views', class: 'vectorTabs', 'aria-label': '表示', hidden: rightTabs.children.length ? null : true }, rightTabs),
        h('div', { id: 'p-search', role: 'search' },
          h('form', { action: './', method: 'get', id: 'searchform' },
            h('div', { id: 'simpleSearch' }, searchInput, searchButton)))));

    var toolItems = [];
    if (o.page && !o.special) {
      toolItems.push({ text: o.exists ? 'このページを編集' : 'このページを作成', href: Wiki.editUrl(o.page), id: 't-edit' });
      if (o.exists) toolItems.push({ text: '変更履歴（GitHub）', href: Wiki.historyUrl(o.page), external: true, id: 't-history' });
    }
    toolItems.push({ text: '承認待ちの投稿', href: Wiki.pullsUrl(), external: true, id: 't-pulls', tip: 'GitHub のプルリクエスト一覧' });

    var panel = h('div', { id: 'mw-panel' },
      h('div', { id: 'p-logo', role: 'banner' },
        h('a', { class: 'mw-wiki-logo', href: './', title: 'メインページに移動する' },
          h('img', { src: 'img/logo.png', alt: '', width: 88, height: 88 }),
          h('span', { class: 'logo-name' }, cfg.siteName),
          cfg.siteTagline ? h('span', { class: 'logo-tagline' }, cfg.siteTagline) : null)),
      portal('p-navigation', null, [
        { text: 'メインページ', href: './', id: 'n-mainpage' },
        { text: 'かんたん版（はじめての人へ）', href: Wiki.pageUrl(cfg.easyPage), id: 'n-easy' },
        { text: '全ページ一覧', href: './?special=all', id: 'n-allpages' },
        { text: 'おまかせ表示', href: './?special=random', id: 'n-randompage', tip: 'ページをランダムに表示' },
        { text: '新しいページを作る', href: Wiki.editUrl(''), id: 'n-newpage' },
        { text: '投稿のしかた', href: Wiki.pageUrl(cfg.howtoPage), id: 'n-howto' },
        { text: '画像のルール', href: Wiki.pageUrl(cfg.imagesPage), id: 'n-images' },
        { text: 'Wikiの書き方', href: Wiki.pageUrl(cfg.helpPage), id: 'n-help' },
        { text: 'テストページ（練習用）', href: Wiki.pageUrl(cfg.testPage), id: 'n-test' },
        { text: '利用規約', href: Wiki.pageUrl(cfg.termsPage), id: 'n-terms' },
      ]),
      portal('p-tb', 'ツール', toolItems),
      (cfg.sidebarLinks && cfg.sidebarLinks.length)
        ? portal('p-links', 'リンク', cfg.sidebarLinks.map(function (l) { return { text: l.text, href: l.url, external: true }; }))
        : null);

    // スマホ用：メニューの開閉
    var overlay = h('div', { id: 'mw-panel-overlay', hidden: true });
    var menuButton = h('button', { type: 'button', id: 'mw-menu-toggle', 'aria-controls': 'mw-panel', 'aria-expanded': 'false' },
      h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden' }, 'メニュー'));
    function setMenu(open) {
      body.classList.toggle('nav-open', open);
      menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      overlay.hidden = !open;
    }
    menuButton.addEventListener('click', function () { setMenu(!body.classList.contains('nav-open')); });
    overlay.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

    var mobileHeader = h('div', { id: 'mw-mobile-header' },
      menuButton,
      h('a', { href: './', class: 'mobile-site-name' }, h('img', { src: 'img/logo.png', alt: '', width: 30, height: 30 }), cfg.siteName));

    var footer = h('footer', { id: 'footer', role: 'contentinfo' },
      h('ul', { id: 'footer-info' },
        h('li', { id: 'footer-info-license' },
          '記事の文章は ', h('a', { href: cfg.contentLicense.url, rel: 'license noopener noreferrer', target: '_blank' }, cfg.contentLicense.name),
          ' のもとで利用できます。埋め込んだ X のポスト・YouTube の動画・スキンの画像は、それぞれの持ち主のものです。詳しくは「',
          h('a', { href: Wiki.pageUrl(cfg.licensePage) }, 'ライセンス'), '」を見てください。'),
        h('li', null, 'この Wiki は GitHub アカウントがあれば誰でも編集を提案できます。投稿された内容は、管理者が確認してから公開されます。'),
        h('li', null, '記事の内容は投稿者によるものです。最新の情報はゲーム内やサーバーのお知らせも確認してください。'),
        h('li', { id: 'footer-info-minecraft' }, 'Minecraft は Mojang Synergies AB の商標です。この Wiki は Mojang Studios・Microsoft の公式のものではなく、両社とは関係ありません。')),
      h('ul', { id: 'footer-places' },
        h('li', null, h('a', { href: Wiki.pageUrl(cfg.termsPage) }, '利用規約')),
        h('li', null, h('a', { href: Wiki.pageUrl(cfg.licensePage) }, 'ライセンス')),
        h('li', null, h('a', { href: Wiki.pageUrl(cfg.easyPage) }, 'かんたん版')),
        h('li', null, h('a', { href: Wiki.pageUrl(cfg.howtoPage) }, '投稿のしかた')),
        h('li', null, h('a', { href: Wiki.pageUrl(cfg.helpPage) }, 'Wikiの書き方')),
        h('li', null, h('a', { href: './?special=all' }, '全ページ一覧')),
        h('li', null, h('a', { href: Wiki.repoUrl(), target: '_blank', rel: 'noopener noreferrer' }, 'GitHub リポジトリ'))));

    body.append(
      h('a', { class: 'mw-jump-link', href: '#content' }, '本文へ移動'),
      mobileHeader,
      h('div', { id: 'mw-page-base', class: 'noprint' }),
      h('div', { id: 'mw-head-base', class: 'noprint' }),
      content,
      h('div', { id: 'mw-navigation' }, head, panel),
      overlay,
      footer);

    return { heading: heading, sub: contentSub, body: contentText, siteSub: siteSub };
  };

  /** お知らせの枠（type: info | warning | error | success） */
  Wiki.messageBox = function (type, children, attrs) {
    var a = attrs || {};
    a.class = 'mw-message-box mw-message-box-' + type + (a.class ? ' ' + a.class : '');
    if (!a.role) a.role = type === 'error' ? 'alert' : 'status';
    return h('div', a, children);
  };

  window.Wiki = Wiki;
})();
