// 編集画面：edit.html?p=ページ名（ページ名なし＝新規作成）
// Wiki で書いてプレビューしたあと、本文をコピーして GitHub の編集画面に貼り付け、
// 投稿者自身の GitHub アカウントでプルリクエストを作ってもらう。
(function () {
  'use strict';

  var Wiki = window.Wiki;
  var cfg = Wiki.config;
  var R = Wiki.rules;
  var h = Wiki.h;

  var requested = Wiki.normalizeTitle(Wiki.params().get('p') || '');
  var indexPromise = Wiki.loadIndex();
  var indexList = null;
  indexPromise.then(function (list) { indexList = list; });

  var loadPage = (requested && !R.checkTitle(requested))
    ? Wiki.fetchPageIfListed(requested).then(function (src) { return { src: src }; }, function (err) { return { error: err }; })
    : Promise.resolve({ src: null });

  loadPage.then(function (r) {
    if (r.error) {
      var ui = Wiki.layout({ page: requested, exists: true, active: 'edit' });
      ui.heading.textContent = '「' + requested + '」を編集中';
      Wiki.setDocTitle('編集');
      ui.body.append(Wiki.messageBox('error', [
        'ページを読み込めませんでした。通信状況を確認して、',
        h('a', { href: location.href }, 'もう一度読み込んで'), 'ください。',
      ]));
      return;
    }
    buildEditor(r.src != null, r.src);
  });

  /** localStorage は使えないことがあるので必ず try で囲む */
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* 使えなくても動くようにする */ }
    return null;
  }

  function buildEditor(exists, original) {
    var hasTitle = !!requested;
    var ui = hasTitle
      ? Wiki.layout({ page: requested, exists: exists, active: 'edit' })
      : Wiki.layout({ special: true });

    function currentTitle() {
      return Wiki.normalizeTitle(exists ? requested : titleInput.value);
    }

    function updateHeading() {
      var t = hasTitle ? requested : currentTitle();
      if (exists) ui.heading.textContent = '「' + t + '」を編集中';
      else if (t) ui.heading.textContent = '「' + t + '」を作成中';
      else ui.heading.textContent = '新しいページを作成';
      Wiki.setDocTitle(ui.heading.textContent);
    }

    // ---- 入力欄 -------------------------------------------------------------
    var titleInput = h('input', {
      type: 'text', id: 'wpTitle', name: 'title', maxlength: R.TITLE_MAX_CHARS * 2, autocomplete: 'off',
      readonly: exists ? true : null, 'aria-describedby': 'title-hint', placeholder: '例: はじめかた',
    });
    titleInput.value = requested;
    var TITLE_HINT = '使える文字：文字・数字・空白・_ - ( ) （ ） ・ ー（60文字まで）';
    var titleHint = h('div', { id: 'title-hint', class: 'field-hint' },
      exists ? '既にあるページの名前は変更できません。' : TITLE_HINT);

    var textarea = h('textarea', {
      id: 'wpTextbox1', name: 'content', rows: 25, spellcheck: 'false',
      'aria-label': '本文（Markdown）', placeholder: '本文を Markdown で書きます。書き方は「Wikiの書き方」を見てください。',
    });
    textarea.value = original || '';
    var counter = h('div', { id: 'size-counter', class: 'size-counter', 'aria-live': 'polite' });

    // ---- 書式ボタン -----------------------------------------------------------
    var tools = [
      { label: '太字', title: '太字', run: function () { wrap('**', '**', '太字'); } },
      { label: '見出し', title: '見出し（行頭に ## を付ける）', run: function () { prefixLines('## ', '見出し', /^#{1,6}\s*/); } },
      { label: 'リスト', title: '箇条書き（行頭に - を付ける）', run: function () { prefixLines('- ', '項目', /^[-*+]\s+/); } },
      { label: '内部リンク', title: 'Wiki 内のページへのリンク [[ページ名]]', run: function () { wrap('[[', ']]', 'ページ名'); } },
      { label: '外部リンク', title: '外部サイトへのリンク [文字](URL)', run: externalLink },
      { label: 'コード', title: 'コード（複数行なら ``` で囲む）', run: code },
      { label: '表', title: '表を挿入', run: table },
    ];
    var toolbar = h('div', { class: 'wikiEditor-toolbar', role: 'toolbar', 'aria-label': '書式' },
      tools.map(function (t) {
        return h('button', { type: 'button', class: 'tool-button', title: t.title, onclick: function () { t.run(); } }, t.label);
      }));

    // ---- タブ（編集 / プレビュー） -------------------------------------------
    var tabEdit = h('button', { type: 'button', role: 'tab', id: 'tab-edit', class: 'edit-tab', 'aria-selected': 'true', 'aria-controls': 'edit-pane' }, '編集');
    var tabPreview = h('button', { type: 'button', role: 'tab', id: 'tab-preview', class: 'edit-tab', 'aria-selected': 'false', 'aria-controls': 'preview-pane' }, 'プレビュー');
    var previewHeading = h('h1', { class: 'firstHeading preview-heading' });
    var previewBody = h('div', { id: 'wikiPreview', class: 'mw-body-content' });
    var editPane = h('div', { id: 'edit-pane', role: 'tabpanel', 'aria-labelledby': 'tab-edit' }, toolbar, textarea, counter);
    var previewPane = h('div', { id: 'preview-pane', role: 'tabpanel', 'aria-labelledby': 'tab-preview', hidden: true },
      Wiki.messageBox('warning', 'これはプレビューです。まだ投稿されていません。', { class: 'previewnote' }),
      previewHeading, previewBody);

    // ---- 投稿の手順 -----------------------------------------------------------
    var copyButton = h('button', { type: 'button', id: 'copy-button', class: 'mw-ui-button mw-ui-progressive' }, '① 本文をコピーする');
    var copyStatus = h('span', { id: 'copy-status', class: 'copy-status', 'aria-live': 'polite' });
    var githubLink = h('a', {
      id: 'github-link', class: 'mw-ui-button github-link', target: '_blank', rel: 'noopener noreferrer',
      href: Wiki.githubEditUrl(currentTitleSafe(), exists),
    }, '② GitHub の編集画面を開く');
    var result = h('div', { id: 'submit-result', 'aria-live': 'polite' });
    var cancelLink = h('a', { href: hasTitle ? Wiki.pageUrl(requested) : './', id: 'mw-editform-cancel' }, 'キャンセル');

    var pasteStep = exists
      ? ['GitHub の画面で、本文を全部選んで（Ctrl+A）貼り付け（Ctrl+V）、右上の緑のボタン「', h('b', null, 'Commit changes...'), '」→「', h('b', null, 'Propose changes'), '」を押す']
      : ['GitHub の画面で、本文の欄に貼り付け（Ctrl+V）、右上の緑のボタン「', h('b', null, 'Commit changes...'), '」→「', h('b', null, 'Propose changes'), '」を押す'];

    var licenseLink = h('a', { href: cfg.contentLicense.url, target: '_blank', rel: 'license noopener noreferrer' }, cfg.contentLicense.name);
    var termsLink = h('a', { href: Wiki.pageUrl(cfg.termsPage), target: '_blank' }, '利用規約');

    var steps = h('section', { class: 'editOptions submit-steps', id: 'submit-steps', 'aria-labelledby': 'submit-steps-title' },
      h('h2', { id: 'submit-steps-title', class: 'submit-steps-title' }, 'GitHub で投稿する'),
      h('p', { class: 'submit-steps-lead' },
        '投稿には ', h('a', { href: 'https://github.com/signup', target: '_blank', rel: 'noopener noreferrer' }, 'GitHub アカウント（無料）'),
        ' が必要です。書き終わったら、次の順に進めてください。'),
      h('ol', { class: 'submit-steps-list' },
        h('li', null, copyButton, ' ', copyStatus),
        h('li', null, githubLink, ' ', h('span', { class: 'step-note' }, '新しいタブで開きます。初めてのときは「Fork this repository」を押します')),
        h('li', null, pasteStep),
        h('li', null, '「', h('b', null, 'Create pull request'), '」を押し、説明欄の確認項目の [ ] を [x] に変えて、もう一度「', h('b', null, 'Create pull request'), '」を押す')),
      result,
      h('p', { class: 'edit-legal' },
        '投稿すると、', termsLink, 'に同意し、投稿した内容が ', licenseLink,
        ' で公開されることに同意したものとみなします。管理者が確認して承認すると、このページに反映されます。'),
      h('div', { class: 'editButtons' }, cancelLink));

    // ---- 画像付きの詳しい手順（「投稿のしかた」ページを読み込んで表示） ---------------
    var guideBody = h('div', { id: 'howto-body', class: 'mw-body-content howto-body' }, h('p', { class: 'preview-empty' }, '読み込み中…'));
    var guide = h('details', { id: 'howto', class: 'howto' },
      h('summary', null, '画像付きの詳しい手順（はじめての方はこちら）'),
      guideBody);
    guide.open = store('wiki-howto-closed') !== '1';
    guide.addEventListener('toggle', function () { store('wiki-howto-closed', guide.open ? null : '1'); });

    var form = h('form', { id: 'editform', novalidate: true },
      /OWNER\/REPO/.test(cfg.repo)
        ? Wiki.messageBox('warning', '管理者向け：js/config.js の repo がまだ設定されていません。', { class: 'config-warning' })
        : null,
      Wiki.messageBox('info', [
        'GitHub アカウントがあれば誰でも編集を提案できます。ここで書いてプレビューしたあと、下の手順で GitHub から投稿してください。',
        '書き方は ', h('a', { href: Wiki.pageUrl(cfg.helpPage), target: '_blank' }, 'Wikiの書き方'), ' を見てください。',
      ], { class: 'editnotice' }),
      h('div', { class: 'edit-field' }, h('label', { for: 'wpTitle' }, 'ページ名'), titleInput, titleHint),
      h('div', { class: 'edit-tabs', role: 'tablist', 'aria-label': '編集とプレビュー' }, tabEdit, tabPreview),
      editPane,
      previewPane,
      steps,
      guide);

    ui.body.append(form);
    updateHeading();
    updateCounter();
    updateTitleHint();

    Promise.all([indexPromise, Wiki.fetchPageIfListed(cfg.howtoPage).catch(function () { return null; })]).then(function (r) {
      if (r[1]) {
        Wiki.renderInto(guideBody, r[1], Wiki.pageSet(r[0]), { toc: false });
      } else {
        guideBody.replaceChildren(h('p', null, '「', h('a', { href: Wiki.pageUrl(cfg.howtoPage) }, cfg.howtoPage), '」のページを見てください。'));
      }
    });

    // ---- 状態 -----------------------------------------------------------------
    var copied = false; // 今の本文をコピーしたか
    var handedOff = false; // GitHub の画面を開いたか（このあとは離れるときの確認を出さない）
    var initialTitle = titleInput.value;
    var initialContent = textarea.value;
    function isDirty() {
      return !handedOff && (textarea.value !== initialContent || (!exists && titleInput.value !== initialTitle));
    }
    window.addEventListener('beforeunload', function (e) {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // ---- イベント -------------------------------------------------------------
    textarea.addEventListener('input', function () {
      updateCounter();
      markChanged();
    });
    titleInput.addEventListener('input', function () {
      updateHeading();
      updateTitleHint();
      githubLink.href = Wiki.githubEditUrl(currentTitleSafe(), exists);
      markChanged();
    });
    tabEdit.addEventListener('click', function () { showTab('edit'); });
    tabPreview.addEventListener('click', function () { showTab('preview'); });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    copyButton.addEventListener('click', copyContent);
    githubLink.addEventListener('click', openGitHub);

    function currentTitleSafe() {
      var t = exists ? requested : Wiki.normalizeTitle(titleInput ? titleInput.value : requested);
      return t || 'ページ名';
    }

    function markChanged() {
      if (copied) {
        copied = false;
        copyStatus.textContent = '本文が変わりました。もう一度コピーしてください。';
        copyStatus.classList.remove('done');
      }
      handedOff = false;
    }

    function showTab(which) {
      var preview = which === 'preview';
      editPane.hidden = preview;
      previewPane.hidden = !preview;
      tabEdit.setAttribute('aria-selected', preview ? 'false' : 'true');
      tabPreview.setAttribute('aria-selected', preview ? 'true' : 'false');
      if (preview) renderPreview();
      else textarea.focus();
    }

    function renderPreview() {
      previewHeading.textContent = currentTitle() || '（ページ名が未入力です）';
      indexPromise.then(function (list) {
        if (!textarea.value.trim()) {
          previewBody.replaceChildren(h('p', { class: 'preview-empty' }, '本文が空です。'));
          return;
        }
        Wiki.renderInto(previewBody, textarea.value, Wiki.pageSet(list));
      });
    }

    function updateCounter() {
      var bytes = R.byteLength(textarea.value);
      counter.textContent = bytes.toLocaleString('ja-JP') + ' / ' + R.CONTENT_MAX_BYTES.toLocaleString('ja-JP') + ' バイト';
      counter.classList.toggle('over', bytes > R.CONTENT_MAX_BYTES);
    }

    function updateTitleHint() {
      if (exists) return;
      var t = currentTitle();
      titleHint.classList.remove('error');
      var msg = titleInput.value !== '' ? R.checkTitle(titleInput.value.normalize('NFC')) : null;
      if (msg) {
        titleHint.classList.add('error');
        titleHint.textContent = msg;
        return;
      }
      indexPromise.then(function (list) {
        if (t && list && list.some(function (p) { return p.title === t; })) {
          titleHint.classList.add('error');
          titleHint.replaceChildren('「' + t + '」は既にあります。', h('a', { href: Wiki.editUrl(t) }, 'そのページを編集する'), 'か、別の名前にしてください。');
        } else if (!titleHint.classList.contains('error')) {
          titleHint.textContent = TITLE_HINT;
        }
      });
    }

    // ---- 書式ボタンの処理 -----------------------------------------------------
    /** textarea の s〜e を text に置き換える（できれば元に戻す履歴を残す） */
    function replaceRange(s, e, text) {
      textarea.focus();
      textarea.setSelectionRange(s, e);
      var ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }
      if (!ok || textarea.value.slice(s, s + text.length) !== text) {
        textarea.setRangeText(text, s, e, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    function wrap(before, after, placeholder) {
      var s = textarea.selectionStart;
      var e = textarea.selectionEnd;
      var sel = textarea.value.slice(s, e) || placeholder;
      replaceRange(s, e, before + sel + after);
      textarea.setSelectionRange(s + before.length, s + before.length + sel.length);
    }

    function prefixLines(prefix, placeholder, existing) {
      var v = textarea.value;
      var s = textarea.selectionStart;
      var e = textarea.selectionEnd;
      var ls = v.lastIndexOf('\n', s - 1) + 1;
      if (e > s && v.charAt(e - 1) === '\n') e--;
      var le = v.indexOf('\n', e);
      if (le < 0) le = v.length;
      var lines = v.slice(ls, le).split('\n');
      var out = lines.map(function (line) {
        var body = line.replace(existing, '');
        return prefix + (body || placeholder);
      }).join('\n');
      replaceRange(ls, le, out);
      if (lines.length === 1) textarea.setSelectionRange(ls + prefix.length, ls + out.length);
      else textarea.setSelectionRange(ls, ls + out.length);
    }

    function externalLink() {
      var s = textarea.selectionStart;
      var e = textarea.selectionEnd;
      var sel = textarea.value.slice(s, e);
      if (/^https?:\/\/\S+$/.test(sel)) {
        replaceRange(s, e, '[リンクの文字](' + sel + ')');
        textarea.setSelectionRange(s + 1, s + 7);
      } else {
        var label = sel || 'リンクの文字';
        replaceRange(s, e, '[' + label + '](https://)');
        var urlStart = s + label.length + 3;
        textarea.setSelectionRange(urlStart, urlStart + 8);
      }
    }

    function code() {
      var s = textarea.selectionStart;
      var e = textarea.selectionEnd;
      var sel = textarea.value.slice(s, e);
      if (sel.indexOf('\n') >= 0) {
        var before = (s > 0 && textarea.value.charAt(s - 1) !== '\n') ? '\n' : '';
        replaceRange(s, e, before + '```\n' + sel.replace(/\n$/, '') + '\n```\n');
      } else {
        wrap('`', '`', 'コード');
      }
    }

    function table() {
      var s = textarea.selectionStart;
      var v = textarea.value;
      var lead = s === 0 ? '' : (v.slice(Math.max(0, s - 2), s) === '\n\n' ? '' : (v.charAt(s - 1) === '\n' ? '\n' : '\n\n'));
      var tpl = '| 見出し1 | 見出し2 |\n| --- | --- |\n| 内容 | 内容 |\n| 内容 | 内容 |\n';
      replaceRange(s, textarea.selectionEnd, lead + tpl);
    }

    // ---- 投稿（コピー → GitHub を開く） ------------------------------------------
    function showResult(type, children) {
      result.replaceChildren(Wiki.messageBox(type, children));
    }

    /** 投稿する本文（改行を LF にそろえ、最後に改行を付ける） */
    function currentContent() {
      var c = textarea.value.replace(/\r\n?/g, '\n');
      return c && c.charAt(c.length - 1) !== '\n' ? c + '\n' : c;
    }

    /** 投稿できない理由（なければ null）。クリックの中で同期的に呼ぶ */
    function problem() {
      var title = currentTitle();
      var content = currentContent();
      var err = R.checkTitle(title);
      if (err) return err;
      if (!exists && indexList && indexList.some(function (p) { return p.title === title; })) {
        return '「' + title + '」は既にあります。既存のページを編集してください。';
      }
      if (!content.trim()) return '本文が空です。';
      if (R.byteLength(content) > R.CONTENT_MAX_BYTES) {
        return '本文が長すぎます（' + R.CONTENT_MAX_BYTES.toLocaleString('ja-JP') + ' バイトまで）。ページを分けてください。';
      }
      var bad = R.findForbidden(content);
      if (bad.length) {
        return '使えない記述が含まれています：' + bad.map(function (b) { return b.label + '（' + b.line + '行目）'; }).join('、');
      }
      if (exists && content === currentContentOf(original)) return '内容が変更されていません。';
      return null;
    }
    function currentContentOf(s) {
      var c = String(s || '').replace(/\r\n?/g, '\n');
      return c && c.charAt(c.length - 1) !== '\n' ? c + '\n' : c;
    }

    function legacyCopy(text) {
      var helper = h('textarea', { class: 'clipboard-helper', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      helper.remove();
      return ok;
    }

    function copyContent() {
      var p = problem();
      if (p) {
        showResult('error', p);
        return;
      }
      var text = currentContent();
      var copying = (navigator.clipboard && window.isSecureContext)
        ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); })
        : Promise.resolve(legacyCopy(text));
      copying.then(function (ok) {
        if (ok) {
          copied = true;
          copyStatus.textContent = '✔ コピーしました';
          copyStatus.classList.add('done');
          showResult('success', ['本文をコピーしました。次に「', h('b', null, '② GitHub の編集画面を開く'), '」を押してください。']);
          return;
        }
        // 自動でコピーできないブラウザ：本文を選択して、手でコピーしてもらう
        showTab('edit');
        textarea.focus();
        textarea.select();
        copied = true;
        copyStatus.textContent = '';
        showResult('warning', '自動でコピーできませんでした。本文を選択した状態にしたので、Ctrl+C（スマホは長押し →「コピー」）でコピーしてから、②に進んでください。');
      });
    }

    function openGitHub(e) {
      var p = problem();
      if (p) {
        e.preventDefault();
        showResult('error', p);
        return;
      }
      if (!copied) {
        e.preventDefault();
        showResult('error', '先に「① 本文をコピーする」を押してください。');
        return;
      }
      githubLink.href = Wiki.githubEditUrl(currentTitle(), exists);
      handedOff = true;
      showResult('success', [
        h('p', null, h('b', null, 'GitHub の画面を新しいタブで開きました。')),
        h('p', null, '貼り付けて「Commit changes...」→「Propose changes」→「Create pull request」と進めてください。',
          '管理者が確認して承認すると公開されます。'),
        h('p', null, '提案した内容は ', h('a', { href: Wiki.pullsUrl(), target: '_blank', rel: 'noopener noreferrer' }, '承認待ちの投稿（GitHub）'), ' で確認できます。'),
      ]);
    }
  }
})();
