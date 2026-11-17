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
];

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

/** 本文から禁止された記述を探す。[{ label, line }] を返す（line は 1 始まり） */
export function findForbidden(text) {
  const s = String(text);
  const found = [];
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    const m = re.exec(s);
    if (m) found.push({ label, line: s.slice(0, m.index).split('\n').length });
  }
  return found;
}
