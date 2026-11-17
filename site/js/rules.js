// 記事に関するルール（ブラウザ用）。
// scripts/rules.mjs と同じ内容です。片方を変えたら両方を直してください。
// （test/unit/rules.test.mjs が両方の結果が一致するか確認します）
(function (root) {
  'use strict';

  var TITLE_MAX_CHARS = 60;
  var TITLE_PATTERN = /^[\p{L}\p{N}\p{M}_()（）・ー\- ]+$/u;
  var CONTENT_MAX_BYTES = 60 * 1024;
  var SUMMARY_MAX_CHARS = 100;
  var AUTHOR_MAX_CHARS = 30;
  var WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

  var FORBIDDEN_PATTERNS = [
    { label: '<script', re: /<script/i },
    { label: '<iframe', re: /<iframe/i },
    { label: '<object', re: /<object/i },
    { label: '<embed', re: /<embed/i },
    { label: 'onxxx=', re: /\bon[a-z]+\s*=/i },
    { label: 'javascript:', re: /javascript:/i },
  ];

  function charLength(str) {
    return Array.from(str).length;
  }

  function byteLength(str) {
    return new TextEncoder().encode(str).length;
  }

  function checkTitle(title) {
    if (typeof title !== 'string' || title.length === 0) return 'ページ名を入力してください。';
    if (title !== title.trim()) return 'ページ名の前後に空白は使えません。';
    if (charLength(title) > TITLE_MAX_CHARS) return 'ページ名は' + TITLE_MAX_CHARS + '文字以内にしてください。';
    if (title.indexOf('..') !== -1) return 'ページ名に「..」は使えません。';
    if (!TITLE_PATTERN.test(title)) {
      return 'ページ名に使えない文字が含まれています。使えるのは文字・数字・空白・_ - ( ) （ ） ・ ー です。';
    }
    if (title !== title.normalize('NFC')) return 'ページ名の文字の形式が正しくありません。';
    if (WINDOWS_RESERVED.test(title)) return 'このページ名は使えません。別の名前にしてください。';
    return null;
  }

  function findForbidden(text) {
    var s = String(text);
    var found = [];
    FORBIDDEN_PATTERNS.forEach(function (p) {
      var m = p.re.exec(s);
      if (m) found.push({ label: p.label, line: s.slice(0, m.index).split('\n').length });
    });
    return found;
  }

  root.WikiRules = {
    TITLE_MAX_CHARS: TITLE_MAX_CHARS,
    CONTENT_MAX_BYTES: CONTENT_MAX_BYTES,
    SUMMARY_MAX_CHARS: SUMMARY_MAX_CHARS,
    AUTHOR_MAX_CHARS: AUTHOR_MAX_CHARS,
    charLength: charLength,
    byteLength: byteLength,
    checkTitle: checkTitle,
    findForbidden: findForbidden,
  };
})(typeof window !== 'undefined' ? window : globalThis);
