// 閲覧画面：?p=ページ名 / ?special=all|random / ?search=語
(function () {
  'use strict';

  var Wiki = window.Wiki;
  var cfg = Wiki.config;
  var h = Wiki.h;
  var params = Wiki.params();

  if (params.has('search')) showSearch(params.get('search') || '');
  else if (params.get('special')) showSpecial(params.get('special'));
  else showPage(params.get('p') ? Wiki.normalizeTitle(params.get('p')) : cfg.mainPage);

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
      var pageSet = Wiki.pageSet(r[1]);

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
      Wiki.renderInto(view.body, page.src, pageSet);
      Wiki.scrollToHash();
    });
  }

  function showMissing(title) {
    var ui = Wiki.layout({ page: title, exists: false, active: 'view' });
    ui.heading.textContent = title;
    Wiki.setDocTitle(title);
    ui.body.append(Wiki.messageBox('info', [
      h('p', null, cfg.siteName + ' には現在「', h('b', null, title), '」という名前のページはありません。'),
      h('ul', null,
        h('li', null, h('a', { href: Wiki.editUrl(title), id: 'create-page-link', class: 'new' }, 'このページを作成する')),
        h('li', null, h('a', { href: './?search=' + encodeURIComponent(title) }, '「' + title + '」を含むページを検索する'))),
    ], { class: 'noarticletext' }));
  }

  // ---------------------------------------------------------------------------
  // 特別ページ
  // ---------------------------------------------------------------------------
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
    if (name !== 'all') {
      ui.heading.textContent = '存在しない特別ページ';
      Wiki.setDocTitle('存在しない特別ページ');
      ui.body.append(Wiki.messageBox('error', ['「', name, '」という特別ページはありません。']));
      return;
    }

    ui.heading.textContent = '全ページ一覧';
    Wiki.setDocTitle('全ページ一覧');
    Wiki.loadIndex().then(function (list) {
      if (!list) {
        ui.body.append(Wiki.messageBox('error', 'ページ一覧を読み込めませんでした。'));
        return;
      }
      var sorted = list.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ja'); });
      ui.body.append(
        h('p', { class: 'results-info' }, '全 ' + sorted.length + ' ページ（五十音・アルファベット順）'),
        h('ul', { class: 'mw-allpages-chunk' }, sorted.map(function (p) {
          return h('li', null, h('a', { href: Wiki.pageUrl(p.title), title: p.title }, p.title));
        })),
        h('p', null, h('a', { href: Wiki.editUrl('') }, '新しいページを作る')));
    });
  }

  // ---------------------------------------------------------------------------
  // 検索（ページ名と抜粋の部分一致）
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

  function showSearch(raw) {
    var q = Wiki.normalizeTitle(raw);
    Wiki.loadIndex().then(function (list) {
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

      var re = new RegExp(escapeRegExp(q), 'giu');
      function hit(s) { re.lastIndex = 0; return re.test(s); }
      var results = list.filter(function (p) { return hit(p.title) || hit(p.excerpt || ''); });
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
        h('p', { class: 'results-info' }, results.length + ' 件見つかりました'),
        h('ul', { class: 'mw-search-results' }, results.map(function (p) {
          re.lastIndex = 0;
          return h('li', { class: 'mw-search-result' },
            h('div', { class: 'mw-search-result-heading' },
              h('a', { href: Wiki.pageUrl(p.title), title: p.title }, highlight(p.title, re))),
            h('div', { class: 'searchresult' }, highlight(p.excerpt || '', re)));
        })));
    });
  }
})();
