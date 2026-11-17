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
    { label: '外部の画像', re: /!\[[^\]\n]*\]\(\s*<?\s*(?:https?:)?\/\//i, skipCode: true },
    { label: '外部の画像', re: /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i, skipCode: true },
  ];

  function maskCode(text) {
    function blank(m) { return m.replace(/[^\n]/g, ' '); }
    return String(text)
      .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*|(?![\s\S]))/gm, blank)
      .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, blank);
  }

  var EMBED_PREFIXES = ['埋め込み:', 'embed:'];
  var SKIN_PREFIXES = ['スキン:', 'skin:'];
  var CATEGORY_PREFIXES = ['カテゴリ:', 'category:'];
  var X_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:[/?#][^\s]*)?$/i;
  var YT_WATCH = /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^\s#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#][^\s]*)?$/i;
  var YT_PATH = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:[/?#][^\s]*)?$/i;
  var YT_SHORT = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#][^\s]*)?$/i;
  var MCID = /^[A-Za-z0-9_]{1,16}$/;

  function parseEmbed(url) {
    var s = String(url || '').trim();
    var m = X_URL.exec(s);
    if (m) return { type: 'x', user: m[1], id: m[2], url: 'https://x.com/' + m[1] + '/status/' + m[2] };
    m = YT_WATCH.exec(s) || YT_PATH.exec(s) || YT_SHORT.exec(s);
    if (m) return { type: 'youtube', id: m[1], url: 'https://www.youtube.com/watch?v=' + m[1] };
    return null;
  }

  function isMcid(name) {
    return MCID.test(String(name || '').trim());
  }

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
    var masked = maskCode(s);
    var found = [];
    function lineOf(index) { return s.slice(0, index).split('\n').length; }
    FORBIDDEN_PATTERNS.forEach(function (p) {
      if (found.some(function (f) { return f.label === p.label; })) return;
      var m = p.re.exec(p.skipCode ? masked : s);
      if (m) found.push({ label: p.label, line: lineOf(m.index) });
    });
    var link = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
    var m;
    while ((m = link.exec(masked))) {
      var target = m[1].trim();
      var embed = EMBED_PREFIXES.filter(function (p) { return target.indexOf(p) === 0; })[0];
      var skin = SKIN_PREFIXES.filter(function (p) { return target.indexOf(p) === 0; })[0];
      var cat = CATEGORY_PREFIXES.filter(function (p) { return target.indexOf(p) === 0; })[0];
      if (cat && checkTitle(target.slice(cat.length).trim().normalize('NFC'))) {
        found.push({ label: 'カテゴリ名が正しくない', line: lineOf(m.index) });
      } else if (embed && !parseEmbed(target.slice(embed.length))) {
        found.push({ label: '埋め込めない URL（X のポストか YouTube の動画だけ）', line: lineOf(m.index) });
      } else if (skin && !isMcid(target.slice(skin.length))) {
        found.push({ label: 'MCID の形が正しくない', line: lineOf(m.index) });
      }
    }
    return found;
  }

  root.WikiRules = {
    TITLE_MAX_CHARS: TITLE_MAX_CHARS,
    CONTENT_MAX_BYTES: CONTENT_MAX_BYTES,
    SUMMARY_MAX_CHARS: SUMMARY_MAX_CHARS,
    AUTHOR_MAX_CHARS: AUTHOR_MAX_CHARS,
    EMBED_PREFIXES: EMBED_PREFIXES,
    SKIN_PREFIXES: SKIN_PREFIXES,
    CATEGORY_PREFIXES: CATEGORY_PREFIXES,
    parseEmbed: parseEmbed,
    isMcid: isMcid,
    charLength: charLength,
    byteLength: byteLength,
    checkTitle: checkTitle,
    findForbidden: findForbidden,
  };
})(typeof window !== 'undefined' ? window : globalThis);
