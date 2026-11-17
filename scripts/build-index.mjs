// site/pages/*.md から site/pages/index.json（[{ title, excerpt }]）を作る。
// 使い方: node scripts/build-index.mjs [--root リポジトリのフォルダ]
// GitHub Actions（deploy.yml）が公開前に実行します。ローカルで確認するときも先に実行してください。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkTitle } from './rules.mjs';

export const EXCERPT_CHARS = 150;

/** Markdown から検索・一覧用の短い文章を作る */
export function makeExcerpt(md, max = EXCERPT_CHARS) {
  let s = String(md).replace(/\r\n?/g, '\n');
  s = s.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(\n\1[^\n]*|(?![\s\S]))/gm, ' '); // コードブロック（閉じていなければ最後まで）
  s = s.replace(/<!--[\s\S]*?-->/g, ' '); // コメント
  s = s.replace(/<[^>]*>/g, ' '); // HTML タグ
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // 画像
  s = s.replace(/\[\[(?:埋め込み|embed):[^[\]\n]*\]\]/gi, ' '); // [[埋め込み:URL]]
  s = s.replace(/\[\[(?:スキン|skin):([^[\]|\n]+?)(?:\|[^[\]\n]*)?\]\]/gi, '$1'); // [[スキン:MCID]] → MCID
  s = s.replace(/\[\[([^[\]|\n]+?)\|([^[\]\n]+?)\]\]/g, '$2'); // [[ページ|表示名]]
  s = s.replace(/\[\[([^[\]|\n]+?)\]\]/g, '$1'); // [[ページ]]
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // [文字](URL)
  s = s.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' '); // 表の区切り行
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, ''); // 見出し
  s = s.replace(/^\s{0,3}>\s?/gm, ''); // 引用
  s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, ''); // リスト
  s = s.replace(/^\s*(?:[-*_]\s*){3,}$/gm, ' '); // 水平線
  s = s.replace(/(\*\*|__|~~|`+)/g, ''); // 強調・コード
  s = s.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,、。]|$)/g, '$1$2');
  s = s.replace(/\|/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : s;
}

/** ページの一覧を作る（ファイル名が不正なものは除く） */
export function buildIndex(root) {
  const dir = join(root, 'site', 'pages');
  const pages = [];
  const skipped = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const title = entry.name.slice(0, -3).normalize('NFC');
    if (checkTitle(title)) {
      skipped.push(entry.name);
      continue;
    }
    const text = readFileSync(join(dir, entry.name), 'utf8');
    pages.push({ title, excerpt: makeExcerpt(text) });
  }
  pages.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  return { pages, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  const { pages, skipped } = buildIndex(root);
  for (const name of skipped) console.warn(`警告: ファイル名が不正なため一覧に入れませんでした: ${name}`);
  const out = join(root, 'site', 'pages', 'index.json');
  writeFileSync(out, `${JSON.stringify(pages, null, 1)}\n`);
  console.log(`${pages.length} ページを site/pages/index.json に書き出しました。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
