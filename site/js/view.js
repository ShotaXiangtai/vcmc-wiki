// 閲覧画面：?p=ページ名 / ?search=語 / ?category=カテゴリ名
//           ?special=all（全ページ一覧）| random | recent（最近の更新）| categories（カテゴリ一覧）
//                   | backlinks&p=ページ名（リンク元）| pending（承認待ちの投稿）
(function () {
  'use strict';

  var Wiki = window.Wiki;
  var cfg = Wiki.config;
  var h = Wiki.h;
  var params = Wiki.params();


  // ---------------------------------------------------------------------------
  // 記事
  // ---------------------------------------------------------------------------
  function showPage(title) {
    var titleError = Wiki.rules.checkTitle(title);
    if (titleError) {
      var bad = Wiki.layout({ special: true });
      bad.heading.textContent = '不正なページ名';
      Wiki.setDocTitle('不正なページ名');
      bad.body.append(Wiki.messageBox('error', ['「', title, '」はページ名として使えません。', h('br'), titleError]));
      return;
    }

    Promise.all([
      Wiki.fetchPageIfListed(title).then(function (src) { return { src: src }; }, function (err) { return { error: err }; }),
      Wiki.loadIndex(),
    ]).then(function (r) {
      var page = r[0];
      var list = r[1];
      var pageSet = Wiki.pageSet(list);

      if (page.error) {
        var ui = Wiki.layout({ page: title, exists: true, active: 'view' });
        ui.heading.textContent = title;
        Wiki.setDocTitle(title);
        ui.body.append(Wiki.messageBox('error', [
          'ページを読み込めませんでした。通信状況を確認して、',
          h('a', { href: location.href }, 'もう一度読み込んで'), 'ください。',
        ]));
        return;
      }

      if (page.src == null) {
        showMissing(title);
        return;
      }

      var view = Wiki.layout({ page: title, exists: true, active: 'view', showSiteSub: true });
      view.heading.textContent = title;
      Wiki.setDocTitle(title === cfg.mainPage ? '' : title);
      view.sub.append(copySourceButton(page.src));
      Wiki.renderInto(view.body, page.src, pageSet);
      showLastModified(list, title);
      Wiki.scrollToHash();
    });
  }

  /** フッターに「最終更新」を出す（Wikipedia と同じ場所） */
  function showLastModified(list, title) {
    var info = list && list.filter(function (p) { return p.title === title; })[0];
    var footerInfo = document.getElementById('footer-info');
    if (!info || !info.updated || !footerInfo) return;
    footerInfo.insertBefore(h('li', { id: 'footer-info-lastmod' },
      'このページの最終更新は ' + Wiki.formatDate(info.updated) + ' です' + (info.author ? '（' + info.author + '）' : '') + '。'),
    footerInfo.firstChild);
  }

  /** 記事の本文（Markdown）をそのままコピーするボタン。新しいページに貼って試せるように */
  function copySourceButton(src) {
    var status = h('span', { class: 'copy-source-status', 'aria-live': 'polite' });
    var button = h('button', { type: 'button', id: 'copy-source', class: 'copy-source', title: 'この記事の本文（Markdown）をコピーします。編集画面に貼れば、そのまま使えます' },
      '本文をコピー（Markdown）');
    button.addEventListener('click', function () {
      Wiki.copyText(String(src).replace(/\r\n?/g, '\n')).then(function (ok) {
        status.textContent = ok
          ? '✔ コピーしました。編集画面に貼り付けて使えます'
          : 'コピーできませんでした。「編集」タブを開いて、本文を選んでコピーしてください';
        status.classList.toggle('done', ok);
      });
    });
    return h('span', { class: 'copy-source-wrap' }, button, ' ', status);
  }

  function showMissing(title) {
    var ui = Wiki.layout({ page: title, exists: false, active: 'view' });
    ui.heading.textContent = title;
    Wiki.setDocTitle(title);
    ui.body.append(Wiki.messageBox('info', [
      h('p', null, cfg.siteName + ' には現在「', h('b', null, title), '」という名前のページはありません。'),
      h('ul', null,
        h('li', null, h('a', { href: Wiki.editUrl(title), id: 'create-page-link', class: 'new' }, 'このページを作成する')),
        h('li', null, h('a', { href: './?search=' + encodeURIComponent(title) }, '「' + title + '」を含むページを検索する')),
        h('li', null, h('a', { href: './?special=backlinks&p=' + encodeURIComponent(title) }, 'このページにリンクしているページを見る'))),
      // かくし入口（404 ページのミニゲームへ）
      h('a', { href: '404.html#games', class: 'secret-games-link', title: '…？', 'aria-label': 'ひみつのゲームセンター' }, '⛏'),
    ], { class: 'noarticletext' }));
  }

  // ---------------------------------------------------------------------------
  // 特別ページ
  // ---------------------------------------------------------------------------
  var SPECIALS = {
    all: { title: '全ページ一覧', run: allPages },
    recent: { title: '最近の更新', run: recentChanges },
    categories: { title: 'カテゴリ一覧', run: categoryList },
    backlinks: { title: 'リンク元', run: backlinks },
    pending: { title: '承認待ちの投稿', run: pendingPosts },
  };

  function showSpecial(name) {
    if (name === 'random') {
      Wiki.loadIndex().then(function (list) {
        var target = cfg.mainPage;
        if (list && list.length) target = list[Math.floor(Math.random() * list.length)].title;
        location.replace(Wiki.pageUrl(target));
      });
      return;
    }
    var ui = Wiki.layout({ special: true });
    var sp = SPECIALS[name];
    if (!sp) {
      ui.heading.textContent = '存在しない特別ページ';
      Wiki.setDocTitle('存在しない特別ページ');
      ui.body.append(Wiki.messageBox('error', ['「', name, '」という特別ページはありません。']));
      return;
    }
    ui.heading.textContent = sp.title;
    Wiki.setDocTitle(sp.title);
    if (name === 'pending') { sp.run(ui); return; }
    Wiki.loadIndex().then(function (list) {
      if (!list) {
        ui.body.append(Wiki.messageBox('error', 'ページ一覧を読み込めませんでした。'));
        return;
      }
      sp.run(ui, list);
    });
  }

  function pageList(pages, extra) {
    return h('ul', { class: 'mw-allpages-chunk' }, pages.map(function (p) {
      return h('li', null, h('a', { href: Wiki.pageUrl(p.title), title: p.title }, p.title), extra ? extra(p) : null);
    }));
  }

  function byTitle(a, b) { return a.title.localeCompare(b.title, 'ja'); }

  function allPages(ui, list) {
    var sorted = list.slice().sort(byTitle);
    ui.body.append(
      h('p', { class: 'results-info' }, '全 ' + sorted.length + ' ページ（五十音・アルファベット順）'),
      pageList(sorted),
      h('p', null, h('a', { href: Wiki.editUrl('') }, '新しいページを作る')));
  }

  /** 最近の更新：更新日の新しい順。日付ごとに見出しを付ける */
  function recentChanges(ui, list) {
    var sorted = list.filter(function (p) { return p.updated; })
      .sort(function (a, b) { return new Date(b.updated) - new Date(a.updated); })
      .slice(0, 50);
    ui.body.append(h('p', { class: 'results-info' }, '最近更新されたページです（新しい順、最大 50 件）。それぞれの変更の中身は「履歴」から見られます。'));
    var lastDay = '';
    var ul = null;
    sorted.forEach(function (p) {
      var day = Wiki.formatDate(p.updated, false);
      if (day !== lastDay) {
        lastDay = day;
        ui.body.append(h('h4', { class: 'recent-day' }, day));
        ul = h('ul', { class: 'recent-list' });
        ui.body.append(ul);
      }
      var time = Wiki.formatDate(p.updated).split(' ')[1] || '';
      ul.appendChild(h('li', null,
        h('span', { class: 'recent-time' }, time), ' ',
        h('a', { href: Wiki.pageUrl(p.title) }, p.title), ' ',
        h('span', { class: 'recent-meta' }, '（', h('a', { href: Wiki.historyUrl(p.title), target: '_blank', rel: 'noopener noreferrer' }, '履歴'), '）'),
        p.author ? h('span', { class: 'recent-author' }, ' … ' + p.author) : null));
    });
    if (!sorted.length) ui.body.append(h('p', null, 'まだ更新の記録がありません。'));
  }

  /** カテゴリ一覧：カテゴリごとのページ数と、カテゴリが付いていないページ */
  function categoryList(ui, list) {
    var map = {};
    list.forEach(function (p) {
      (p.categories || []).forEach(function (c) { (map[c] = map[c] || []).push(p); });
    });
    var names = Object.keys(map).sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    ui.body.append(h('p', { class: 'results-info' },
      '記事に [[カテゴリ:名前]] と書くと、そのカテゴリに入ります。全 ' + names.length + ' カテゴリ。'));
    ui.body.append(h('ul', { class: 'mw-allpages-chunk category-list' }, names.map(function (c) {
      return h('li', null, h('a', { href: Wiki.categoryUrl(c) }, c), ' (' + map[c].length + ')');
    })));
    var none = list.filter(function (p) { return !(p.categories || []).length; }).sort(byTitle);
    if (none.length) {
      ui.body.append(h('h2', null, 'カテゴリが付いていないページ'), pageList(none));
    }
  }

  function showCategory(name) {
    var ui = Wiki.layout({ special: true });
    ui.heading.textContent = 'カテゴリ: ' + name;
    Wiki.setDocTitle('カテゴリ: ' + name);
    Wiki.loadIndex().then(function (list) {
      if (!list) {
        ui.body.append(Wiki.messageBox('error', 'ページ一覧を読み込めませんでした。'));
        return;
      }
      var pages = list.filter(function (p) { return (p.categories || []).indexOf(name) >= 0; }).sort(byTitle);
      ui.body.append(h('p', { class: 'results-info' },
        pages.length ? 'カテゴリ「' + name + '」に入っている ' + pages.length + ' ページ' : 'カテゴリ「' + name + '」に入っているページはまだありません。'));
      if (pages.length) ui.body.append(pageList(pages));
      ui.body.append(h('p', null, h('a', { href: './?special=categories' }, 'カテゴリ一覧へ')));
    });
  }

  /** リンク元：このページへ [[リンク]] しているページ */
  function backlinks(ui, list) {
    var target = Wiki.normalizeTitle(params.get('p') || '');
    ui.heading.textContent = '「' + target + '」のリンク元';
    Wiki.setDocTitle('「' + target + '」のリンク元');
    var from = list.filter(function (p) { return (p.links || []).indexOf(target) >= 0 && p.title !== target; }).sort(byTitle);
    ui.sub.append(h('a', { href: Wiki.pageUrl(target) }, '←「' + target + '」に戻る'));
    ui.body.append(h('p', { class: 'results-info' },
      from.length ? '「' + target + '」にリンクしている ' + from.length + ' ページ' : '「' + target + '」にリンクしているページはありません。'));
    if (from.length) ui.body.append(pageList(from));
  }

  /** 承認待ちの投稿：GitHub の公開 API から、まだマージされていないプルリクエストを読む */
  function pendingPosts(ui) {
    var box = h('div', { class: 'pending-box' }, h('p', { class: 'results-info' }, '読み込み中…'));
    ui.body.append(
      h('p', null, '投稿されて、まだ管理者が承認（マージ）していないものです。承認されると、その記事に反映されます。'),
      box);
    fetch('https://api.github.com/repos/' + cfg.repo + '/pulls?state=open&per_page=50', {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (pulls) {
      box.replaceChildren();
      if (!pulls.length) {
        box.append(h('p', null, 'いま承認待ちの投稿はありません。'));
        return;
      }
      box.append(h('p', { class: 'results-info' }, pulls.length + ' 件の投稿が承認を待っています。'),
        h('ul', { class: 'pending-list' }, pulls.map(function (pr) {
          return h('li', null,
            h('a', { href: pr.html_url, target: '_blank', rel: 'noopener noreferrer' }, pr.title || '（タイトルなし）'),
            ' ',
            h('span', { class: 'recent-meta' },
              '#' + pr.number + '・' + (pr.user && pr.user.login ? pr.user.login : '') + '・' + Wiki.formatDate(pr.created_at)));
        })));
    }).catch(function () {
      box.replaceChildren(Wiki.messageBox('warning', [
        '一覧を読み込めませんでした（GitHub への問い合わせが多すぎると、しばらく見られないことがあります）。',
        h('a', { href: Wiki.pullsUrl(), target: '_blank', rel: 'noopener noreferrer' }, 'GitHub で見る'), '。',
      ]));
    });
    ui.body.append(h('p', null, h('a', { href: Wiki.pullsUrl(), target: '_blank', rel: 'noopener noreferrer' }, 'GitHub のプルリクエストの画面で見る')));
  }

  // ---------------------------------------------------------------------------
  // 検索（ページ名と本文の全文）
  // ---------------------------------------------------------------------------
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 文字列を、一致した部分だけ太字の要素にして返す */
  function highlight(text, re) {
    var out = [];
    var last = 0;
    text.replace(re, function (m, offset) {
      if (offset > last) out.push(text.slice(last, offset));
      out.push(h('span', { class: 'searchmatch' }, m));
      last = offset + m.length;
      return m;
    });
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  /** 本文の中で最初に見つかった場所の前後を切り出す */
  function snippet(text, re) {
    re.lastIndex = 0;
    var m = re.exec(text);
    if (!m) return null;
    var start = Math.max(0, m.index - 40);
    var end = Math.min(text.length, m.index + m[0].length + 80);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function showSearch(raw) {
    var q = Wiki.normalizeTitle(raw);
    Promise.all([Wiki.loadIndex(), Wiki.loadSearch()]).then(function (r) {
      var list = r[0];
      var full = r[1];
      // ページ名と完全に一致したら、そのページを開く
      if (q && list && list.some(function (p) { return p.title === q; })) {
        location.replace(Wiki.pageUrl(q));
        return;
      }

      var ui = Wiki.layout({ special: true });
      ui.heading.textContent = '検索結果';
      Wiki.setDocTitle(q ? '「' + q + '」の検索結果' : '検索');

      if (!q) {
        ui.body.append(h('p', null, '上の検索ボックスにキーワードを入力してください。'));
        return;
      }
      if (!list) {
        ui.body.append(Wiki.messageBox('error', 'ページ一覧を読み込めなかったため、検索できませんでした。'));
        return;
      }

      if (!Wiki.rules.checkTitle(q)) {
        ui.body.append(h('p', { class: 'mw-search-createlink' },
          'ページ「', h('a', { href: Wiki.editUrl(q), class: 'new', title: q + '（存在しないページ）' }, q), '」を新規作成しましょう。'));
      }

      var textOf = {};
      (full || []).forEach(function (p) { textOf[p.title] = p.text; });
      var re = new RegExp(escapeRegExp(q), 'giu');
      function hit(s) { re.lastIndex = 0; return re.test(s || ''); }
      var results = list.filter(function (p) { return hit(p.title) || hit(textOf[p.title] || p.excerpt); });
      results.sort(function (a, b) {
        var at = hit(a.title) ? 0 : 1;
        var bt = hit(b.title) ? 0 : 1;
        return at - bt || a.title.localeCompare(b.title, 'ja');
      });

      if (!results.length) {
        ui.body.append(h('p', { class: 'mw-search-nonefound' }, '「' + q + '」に一致するページはありませんでした。'));
        return;
      }
      ui.body.append(
        h('p', { class: 'results-info' }, results.length + ' 件見つかりました（ページ名と本文から探しています）'),
        h('ul', { class: 'mw-search-results' }, results.map(function (p) {
          var body = snippet(textOf[p.title] || '', re) || p.excerpt || '';
          re.lastIndex = 0;
          return h('li', { class: 'mw-search-result' },
            h('div', { class: 'mw-search-result-heading' },
              h('a', { href: Wiki.pageUrl(p.title), title: p.title }, highlight(p.title, re))),
            h('div', { class: 'searchresult' }, highlight(body, re)));
        })));
    });
  }

  // 表示するものを決める（上の関数や表を定義したあとに呼ぶ）
  if (params.has('search')) showSearch(params.get('search') || '');
  else if (params.has('category')) showCategory(Wiki.normalizeTitle(params.get('category')));
  else if (params.get('special')) showSpecial(params.get('special'));
  else showPage(params.get('p') ? Wiki.normalizeTitle(params.get('p')) : cfg.mainPage);
})();
