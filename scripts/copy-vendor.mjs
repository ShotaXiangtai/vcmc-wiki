// node_modules の marked と DOMPurify を site/js/vendor/ にコピーする。
// 使い方: npm install のあと `npm run vendor`
// サイトは CDN を使わず、ここでコピーしたファイルを読み込みます（コピーしたファイルはリポジトリに含めます）。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site', 'js', 'vendor');
mkdirSync(out, { recursive: true });

const files = [
  ['node_modules/marked/lib/marked.umd.js', 'marked.umd.js'],
  ['node_modules/marked/LICENSE', 'marked.LICENSE.txt'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/dompurify/LICENSE', 'dompurify.LICENSE.txt'],
];

for (const [from, to] of files) {
  copyFileSync(join(root, from), join(out, to));
  console.log(`コピー: ${from} -> site/js/vendor/${to}`);
}

const versions = {
  marked: JSON.parse(readFileSync(join(root, 'node_modules/marked/package.json'), 'utf8')).version,
  dompurify: JSON.parse(readFileSync(join(root, 'node_modules/dompurify/package.json'), 'utf8')).version,
};
writeFileSync(
  join(out, 'VERSIONS.txt'),
  `marked ${versions.marked}\ndompurify ${versions.dompurify}\n（scripts/copy-vendor.mjs でコピー）\n`,
);
console.log(`バージョン: marked ${versions.marked} / dompurify ${versions.dompurify}`);
