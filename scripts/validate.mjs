// 記事の検証。問題があれば終了コード 1 で終わる。
// 使い方: node scripts/validate.mjs [--root リポジトリのフォルダ] [--base 比較するブランチ（例: origin/main）]
//         環境変数 PR_BODY にプルリクの説明欄を入れると、同意のチェックも確認する（validate.yml が設定する）
//
// 確認すること
//   - site/pages 直下に .md ファイルだけがある（フォルダ・ほかの種類のファイル・シンボリックリンクは不可）
//   - ファイル名（＝ページ名）のルールがブラウザ側と同じ（scripts/rules.mjs）
//   - 大きさが上限以下、UTF-8 として読める
//   - <script <iframe <object <embed onxxx= javascript: を含まない
//   - --base を付けたとき：site/pages/ 以外のファイルや、利用規約・ライセンスのページを変更していたら警告
//   - PR_BODY があり記事を変更しているとき：利用規約・ライセンス・無断転載の確認項目が [x] になっているか
import { execFileSync } from 'node:child_process';
import { appendFileSync, lstatSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONTENT_MAX_BYTES, checkTitle, findForbidden } from './rules.mjs';

const GENERATED = new Set(['index.json']); // build-index.mjs が作るファイル（Git には入れない）

// 変更されたら特に注意して見てほしいページ
export const PROTECTED_PAGES = [
  'site/pages/利用規約.md',
  'site/pages/ライセンス.md',
  'site/pages/利用規約（かんたん版）.md',
  'site/pages/ライセンス（かんたん版）.md',
  'site/pages/画像のルール.md',
  'site/pages/画像のルール（かんたん版）.md',
];

// プルリクの説明欄（.github/pull_request_template.md）の確認項目。各行の [ ] が [x] になっている必要がある
export const AGREEMENTS = [
  { key: '利用規約', label: '利用規約への同意' },
  { key: 'CC BY-SA 4.0', label: 'CC BY-SA 4.0 で公開することへの同意' },
  { key: '無断転載', label: '無断転載ではないことの確認' },
];

/** 説明欄でチェックされていない確認項目の名前を返す */
export function missingAgreements(body) {
  const checkedLines = String(body || '').split(/\r?\n/).filter((l) => /^\s*[-*]\s*\[[xX]\]/.test(l));
  return AGREEMENTS.filter((a) => !checkedLines.some((l) => l.includes(a.key))).map((a) => a.label);
}

/**
 * 検証して { errors, warnings, checked } を返す。各要素は { file, line?, message }
 * prBody: プルリクの説明欄（undefined なら同意の確認をしない）
 */
export function validate(root, { base, prBody } = {}) {
  const errors = [];
  const warnings = [];
  const dir = join(root, 'site', 'pages');
  let checked = 0;

  if (!existsSync(dir)) {
    errors.push({ file: 'site/pages', message: 'site/pages フォルダがありません。' });
    return { errors, warnings, checked };
  }

  const seen = new Map(); // 小文字にした名前 → 元の名前（大文字小文字だけ違う重複の検出）
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `site/pages/${entry.name}`;
    if (GENERATED.has(entry.name) && entry.isFile()) continue;
    if (entry.isSymbolicLink()) {
      errors.push({ file: rel, message: 'シンボリックリンクは置けません。' });
      continue;
    }
    if (entry.isDirectory()) {
      errors.push({ file: rel, message: 'site/pages の中にフォルダは作れません（記事は site/pages 直下の .md だけ）。' });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      errors.push({ file: rel, message: 'site/pages には .md ファイルだけを置けます。' });
      continue;
    }
    checked++;

    const title = entry.name.slice(0, -3);
    const titleError = checkTitle(title);
    if (titleError) errors.push({ file: rel, message: `ファイル名（ページ名）が不正です：${titleError}` });

    const lower = title.normalize('NFC').toLowerCase();
    if (seen.has(lower)) {
      errors.push({ file: rel, message: `「${seen.get(lower)}.md」と大文字・小文字だけが違う名前です。別の名前にしてください。` });
    } else {
      seen.set(lower, title);
    }

    const size = lstatSync(join(dir, entry.name)).size;
    if (size > CONTENT_MAX_BYTES) {
      errors.push({ file: rel, message: `ファイルが大きすぎます（${size.toLocaleString('en-US')} バイト。上限 ${CONTENT_MAX_BYTES.toLocaleString('en-US')} バイト）。` });
      continue;
    }
    if (size === 0) warnings.push({ file: rel, message: 'ファイルが空です。' });

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(join(dir, entry.name)));
    } catch {
      errors.push({ file: rel, message: 'UTF-8 として読めません。文字コードを UTF-8 にしてください。' });
      continue;
    }
    for (const f of findForbidden(text)) {
      errors.push({ file: rel, line: f.line, message: `使えない記述「${f.label}」が含まれています。` });
    }
  }

  let contentChanged = true; // 比較先がないときは「記事を変更した」とみなす
  if (base) {
    let changed = [];
    try {
      const out = execFileSync('git', ['diff', '--name-only', '-z', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
      changed = out.split('\0').filter(Boolean);
    } catch {
      warnings.push({ file: '.', message: `変更されたファイルの一覧を取得できませんでした（比較先: ${base}）。` });
    }
    contentChanged = changed.length === 0 || changed.some((f) => f.startsWith('site/pages/') || f.startsWith('site/img/'));
    for (const file of changed) {
      if (!/^site\/pages\/[^/]+\.md$/.test(file)) {
        warnings.push({ file, message: 'site/pages/ の記事以外のファイルが変更されています。内容をよく確認してください。' });
      } else if (PROTECTED_PAGES.includes(file)) {
        warnings.push({ file, message: '利用規約・ライセンスのページが変更されています。内容をよく確認してください。' });
      }
    }
  }

  if (prBody !== undefined && contentChanged) {
    const missing = missingAgreements(prBody);
    if (missing.length) {
      errors.push({
        file: null,
        message: `プルリクエストの説明欄で「${missing.join('」「')}」にチェックしてください（[ ] を [x] に書き換えて保存すると、もう一度確認されます）。`,
      });
    }
  }

  return { errors, warnings, checked };
}

/** GitHub Actions の注釈で使えない文字を置き換える */
function escapeAnnotation(s, isProperty = false) {
  let out = String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  if (isProperty) out = out.replace(/:/g, '%3A').replace(/,/g, '%2C');
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = opt('--root') ? resolve(opt('--root')) : join(dirname(fileURLToPath(import.meta.url)), '..');
  const base = opt('--base');
  const inActions = process.env.GITHUB_ACTIONS === 'true';

  const { errors, warnings, checked } = validate(root, { base, prBody: process.env.PR_BODY });
  const where = (x) => (x.file ? (x.line ? `${x.file}:${x.line}` : x.file) : 'プルリクエスト');
  const annotationProps = (x) => (x.file ? ` file=${escapeAnnotation(x.file, true)}${x.line ? `,line=${x.line}` : ''}` : '');

  for (const w of warnings) {
    console.log(`警告: ${where(w)}  ${w.message}`);
    if (inActions) console.log(`::warning${annotationProps(w)}::${escapeAnnotation(w.message)}`);
  }
  for (const e of errors) {
    console.log(`エラー: ${where(e)}  ${e.message}`);
    if (inActions) console.log(`::error${annotationProps(e)}::${escapeAnnotation(e.message)}`);
  }
  console.log(`${checked} ページを確認しました。エラー ${errors.length} 件、警告 ${warnings.length} 件。`);

  if (inActions && process.env.GITHUB_STEP_SUMMARY) {
    const rows = [
      '## 記事の検証',
      '',
      `${checked} ページを確認しました。エラー **${errors.length}** 件、警告 **${warnings.length}** 件。`,
      '',
      ...errors.map((e) => `- ❌ \`${where(e)}\` ${e.message}`),
      ...warnings.map((w) => `- ⚠️ \`${where(w)}\` ${w.message}`),
      '',
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, rows.join('\n'));
  }

  process.exitCode = errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
