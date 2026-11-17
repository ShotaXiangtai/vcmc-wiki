// 記事に関するルール（scripts/validate.mjs と scripts/build-index.mjs で使う）
// ブラウザ側の同じルールは site/js/rules.js にあります。片方を変えたら両方を直してください。
// （test/unit/rules.test.mjs が両方の結果が一致するか確認します）

export const TITLE_MAX_CHARS = 60;
export const TITLE_PATTERN = /^[\p{L}\p{N}\p{M}_()（）・ー\- ]+$/u;
export const CONTENT_MAX_BYTES = 60 * 1024; // 60KB（UTF-8 のバイト数）
export const SUMMARY_MAX_CHARS = 100;
export const AUTHOR_MAX_CHARS = 30;

// Windows で作れないファイル名（clone できなくなるのを防ぐ）
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

// 本文に含めてはいけない記述
export const FORBIDDEN_PATTERNS = [
  { label: '<script', re: /<script/i },
  { label: '<iframe', re: /<iframe/i },
  { label: '<object', re: /<object/i },
  { label: '<embed', re: /<embed/i },
  { label: 'onxxx=', re: /\bon[a-z]+\s*=/i },
  { label: 'javascript:', re: /javascript:/i },
  // 画像は X のポストの埋め込みだけ（外部の画像サイトは使わない）。コードの中の書き方の例は対象外
  { label: '外部の画像', re: /!\[[^\]\n]*\]\(\s*<?\s*(?:https?:)?\/\//i, skipCode: true },
  { label: '外部の画像', re: /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i, skipCode: true },
];

/** コードブロックとインラインコードを空白に置き換える（行と位置は変えない） */
export function maskCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return String(text)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*|(?![\s\S]))/gm, blank)
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, blank);
}

// 埋め込みとスキンの書き方：[[埋め込み:URL]] / [[スキン:MCID]] / [[スキン:MCID|64]]
export const EMBED_PREFIXES = ['埋め込み:', 'embed:'];
export const SKIN_PREFIXES = ['スキン:', 'skin:'];
const X_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:[/?#][^\s]*)?$/i;
const YT_WATCH = /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^\s#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#][^\s]*)?$/i;
const YT_PATH = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:[/?#][^\s]*)?$/i;
const YT_SHORT = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#][^\s]*)?$/i;
const MCID = /^[A-Za-z0-9_]{1,16}$/;

/** 埋め込みの URL を読み取る。X / YouTube 以外や形がおかしいときは null */
export function parseEmbed(url) {
  const s = String(url || '').trim();
  let m = X_URL.exec(s);
  if (m) return { type: 'x', user: m[1], id: m[2], url: `https://x.com/${m[1]}/status/${m[2]}` };
  m = YT_WATCH.exec(s) || YT_PATH.exec(s) || YT_SHORT.exec(s);
  if (m) return { type: 'youtube', id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` };
  return null;
}

/** Minecraft の名前（MCID）として使えるか */
export function isMcid(name) {
  return MCID.test(String(name || '').trim());
}

/** 文字数（サロゲートペアを 1 文字と数える） */
export function charLength(str) {
  return [...str].length;
}

/** UTF-8 でのバイト数 */
export function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

/**
 * ページ名を確認する。問題がなければ null、あれば日本語の理由を返す。
 * 呼び出し側で NFC に正規化してから渡すこと。
 */
export function checkTitle(title) {
  if (typeof title !== 'string' || title.length === 0) return 'ページ名を入力してください。';
  if (title !== title.trim()) return 'ページ名の前後に空白は使えません。';
  if (charLength(title) > TITLE_MAX_CHARS) return `ページ名は${TITLE_MAX_CHARS}文字以内にしてください。`;
  if (title.includes('..')) return 'ページ名に「..」は使えません。';
  if (!TITLE_PATTERN.test(title)) {
    return 'ページ名に使えない文字が含まれています。使えるのは文字・数字・空白・_ - ( ) （ ） ・ ー です。';
  }
  if (title !== title.normalize('NFC')) return 'ページ名の文字の形式が正しくありません。';
  if (WINDOWS_RESERVED.test(title)) return 'このページ名は使えません。別の名前にしてください。';
  return null;
}

/** 本文から禁止された記述と、書き方のおかしい埋め込み・スキンを探す。[{ label, line }] を返す（line は 1 始まり） */
export function findForbidden(text) {
  const s = String(text);
  const masked = maskCode(s);
  const found = [];
  const lineOf = (index) => s.slice(0, index).split('\n').length;
  for (const { label, re, skipCode } of FORBIDDEN_PATTERNS) {
    if (found.some((f) => f.label === label)) continue;
    const m = re.exec(skipCode ? masked : s);
    if (m) found.push({ label, line: lineOf(m.index) });
  }
  const link = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
  let m;
  while ((m = link.exec(masked))) {
    const target = m[1].trim();
    const embed = EMBED_PREFIXES.find((p) => target.startsWith(p));
    const skin = SKIN_PREFIXES.find((p) => target.startsWith(p));
    if (embed && !parseEmbed(target.slice(embed.length))) {
      found.push({ label: '埋め込めない URL（X のポストか YouTube の動画だけ）', line: lineOf(m.index) });
    } else if (skin && !isMcid(target.slice(skin.length))) {
      found.push({ label: 'MCID の形が正しくない', line: lineOf(m.index) });
    }
  }
  return found;
}
