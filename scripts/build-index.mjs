// site/pages/*.md から、記事の一覧と検索用のデータを作る。
//   site/pages/index.json  … [{ title, excerpt, updated, author, categories, links }]（一覧・最近の更新・カテゴリ・リンク元）
//   site/pages/search.json … [{ title, text }]（全文検索）
// 使い方: node scripts/build-index.mjs [--root リポジトリのフォルダ]
// GitHub Actions（deploy.yml）が公開前に実行します。ローカルで確認するときも先に実行してください。
// 更新日と更新した人は Git の履歴から取ります（履歴がないときはファイルの日時）。
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORY_PREFIXES, EMBED_PREFIXES, SKIN_PREFIXES, checkTitle, maskCode } from './rules.mjs';

export const EXCERPT_CHARS = 150;

/** Markdown から、記号を取りのぞいた文章を作る（検索用） */
export function makePlainText(md) {
  let s = String(md).replace(/\r\n?/g, '\n');
  s = s.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(\n\1[^\n]*|(?![\s\S]))/gm, ' '); // コードブロック（閉じていなければ最後まで）
  s = s.replace(/<!--[\s\S]*?-->/g, ' '); // コメント
  s = s.replace(/<[^>]*>/g, ' '); // HTML タグ
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // 画像
  s = s.replace(/\[\[(?:埋め込み|embed|カテゴリ|category):[^[\]\n]*\]\]/gi, ' '); // [[埋め込み:URL]] / [[カテゴリ:名前]]
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
  return s.replace(/\s+/g, ' ').trim();
}

/** 検索・一覧用の短い文章 */
export function makeExcerpt(md, max = EXCERPT_CHARS) {
  const chars = [...makePlainText(md)];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

/** 記事の中のリンク先（[[ページ]]）とカテゴリ（[[カテゴリ:名前]]）を取り出す。コードの中は除く */
export function extractLinks(md) {
  const links = new Set();
  const categories = new Set();
  const re = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
  const text = maskCode(String(md).replace(/\r\n?/g, '\n'));
  let m;
  while ((m = re.exec(text))) {
    const target = m[1].trim();
    const cat = CATEGORY_PREFIXES.find((p) => target.startsWith(p));
    if (cat) {
      const name = target.slice(cat.length).trim().normalize('NFC');
      if (!checkTitle(name)) categories.add(name);
      continue;
    }
    if (EMBED_PREFIXES.some((p) => target.startsWith(p)) || SKIN_PREFIXES.some((p) => target.startsWith(p))) continue;
    const title = target.split('#')[0].trim().normalize('NFC');
    if (title && !checkTitle(title)) links.add(title);
  }
  return { links: [...links], categories: [...categories] };
}

/** Git の履歴から最終更新日時と更新した人を取る。取れなければファイルの日時 */
function lastChange(root, relPath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI%x1f%an', '--', relPath], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) {
      const [updated, author] = out.split('\x1f');
      return { updated, author: author || '' };
    }
  } catch { /* Git がない・リポジトリでない */ }
  return { updated: statSync(join(root, relPath)).mtime.toISOString(), author: '' };
}

/** ページの一覧と検索データを作る（ファイル名が不正なものは除く） */
export function buildIndex(root) {
  const dir = join(root, 'site', 'pages');
  const pages = [];
  const search = [];
  const skipped = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const title = entry.name.slice(0, -3).normalize('NFC');
    if (checkTitle(title)) {
      skipped.push(entry.name);
      continue;
    }
    const md = readFileSync(join(dir, entry.name), 'utf8');
    const { links, categories } = extractLinks(md);
    const { updated, author } = lastChange(root, `site/pages/${entry.name}`);
    pages.push({ title, excerpt: makeExcerpt(md), updated, author, categories, links });
    search.push({ title, text: makePlainText(md) });
  }
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'ja');
  pages.sort(byTitle);
  search.sort(byTitle);
  return { pages, search, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  const { pages, search, skipped } = buildIndex(root);
  for (const name of skipped) console.warn(`警告: ファイル名が不正なため一覧に入れませんでした: ${name}`);
  writeFileSync(join(root, 'site', 'pages', 'index.json'), `${JSON.stringify(pages, null, 1)}\n`);
  writeFileSync(join(root, 'site', 'pages', 'search.json'), `${JSON.stringify(search)}\n`);
  console.log(`${pages.length} ページを site/pages/index.json と search.json に書き出しました。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
