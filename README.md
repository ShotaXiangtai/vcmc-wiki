# VoiceMC Wiki

Minecraft サーバー「VoiceMC」のプレイヤー向け攻略・ルール集 Wiki です。見た目は Wikipedia（Vector の旧デザイン）風です。

- 公開先：<https://wiki.vcmc.jp/>
- サイトは **GitHub Pages**（ビルド不要の HTML / CSS / JavaScript）。サーバーや秘密の設定は不要です
- **GitHub アカウントがあれば、だれでも編集を提案できます**。Wiki の編集画面で書いてプレビューし、本文をコピーして GitHub の編集画面に貼り付け、投稿者自身のアカウントでプルリクエスト（PR）を作ります
- **管理者が PR を確認してマージすると公開**されます

```
投稿者 ─ Wiki で書く・プレビュー ─▶ 本文をコピー ─▶ GitHub で貼り付けて PR ─▶ 自動で検証 ─▶ 管理者がマージ ─▶ 自動で公開
```

## 目次

0. [フォルダの中身](#0-フォルダの中身)
1. [リポジトリと GitHub Pages の設定](#1-リポジトリと-github-pages-の設定)
2. [設定ファイル（config.js）](#2-設定ファイルconfigjs)
3. [ローカルで確認する](#3-ローカルで確認する)
4. [投稿の流れ（投稿する人向け）](#4-投稿の流れ投稿する人向け)
5. [管理者向け：投稿（PR）を承認する](#5-管理者向け投稿pr-を承認する)
6. [運用：荒らし対策](#6-運用荒らし対策)
7. [セキュリティについて](#7-セキュリティについて)
8. [ライセンス](#8-ライセンス)

---

## 0. フォルダの中身

```
site/                        GitHub Pages で公開するもの
  index.html                 閲覧（?p=ページ名 / ?special=all / ?special=random / ?search=語）
  edit.html                  編集・プレビュー・投稿の手順
  404.html                   見つからない URL のページ（404 を 3 回クリック・↑↑↓↓←→←→BA・#games で、かくしミニゲームが開く）
  css/wiki.css               Wikipedia 風のスタイル
  img/logo.png               ロゴ・ファビコン（公式サイトと同じアイコン。192×192 の透過 PNG）
  img/apple-touch-icon.png   スマホのホーム画面用アイコン（180×180）
  img/guide/                 「投稿のしかた」の画像（1 枚目は実際の画面、2 枚目以降は GitHub の画面のイメージ図）
  js/config.js               設定（サイト名・リポジトリ・ライセンスなど）
  js/common.js               画面の枠と Markdown の描画（marked + DOMPurify）
  js/rules.js                ページ名などのルール（scripts/rules.mjs と同じ内容）
  js/view.js / edit.js       閲覧画面 / 編集画面
  js/notfound.js / games.js  404 ページ / かくしミニゲーム 10 種類（ほりほりチャレンジ〈CPS 測定つき〉・ジャンプでのぼれ！・どかんさがし・ブロックくずし・つみつみ鉱石・トロッコれっしゃ・スライムたたき・よけろ！落ちブロック・鉱石あわせ・はんのう速度）
  js/vendor/                 marked と DOMPurify（CDN は使わず同梱）
  pages/*.md                 記事。ファイル名がそのままページ名（日本語 OK）
scripts/
  rules.mjs                  ページ名・本文のルール
  build-index.mjs            pages/index.json（ページ名と抜粋の一覧）を作る
  validate.mjs               記事と、PR の説明欄の同意チェックを検証する
  serve.mjs                  ローカル確認用の Web サーバー
  capture-guide.mjs          「投稿のしかた」の 1 枚目の画像を撮り直す
  copy-vendor.mjs            marked / DOMPurify を site/js/vendor にコピー
.github/
  workflows/deploy.yml       main に push されたら 検証 → 一覧作成 → Pages に公開
  workflows/validate.yml     PR のときに記事と同意チェックを検証
  pull_request_template.md   PR の説明欄のひな形（利用規約・ライセンスへの同意）
test/                        テスト（unit: スクリプト / e2e: 画面）
docs/images/                 この README に貼るスクリーンショットの置き場
LICENSE                      プログラムのライセンス（MIT）
```

---

## 1. リポジトリと GitHub Pages の設定

公開時に [GitHub CLI](https://cli.github.com/)（`gh`）で次の設定をしてあります。作り直すときや、別のリポジトリに移すときの参考にしてください。

```bash
gh repo create vcmc-wiki --public --source . --push
```
```bash
gh api -X POST repos/ShotaXiangtai/vcmc-wiki/pages -f build_type=workflow
```
```bash
gh api -X PUT repos/ShotaXiangtai/vcmc-wiki/pages -f cname=wiki.vcmc.jp -F https_enforced=true
```
```bash
gh repo edit ShotaXiangtai/vcmc-wiki --delete-branch-on-merge --enable-wiki=false --enable-projects=false --homepage https://wiki.vcmc.jp/
```
```bash
gh api -X PUT repos/ShotaXiangtai/vcmc-wiki/actions/permissions/fork-pr-contributor-approval -f approval_policy=first_time_contributors
```
```bash
gh workflow run deploy.yml -R ShotaXiangtai/vcmc-wiki
```

| 設定 | 内容 | 画面での場所 |
| --- | --- | --- |
| 公開 | Pages の Source を「GitHub Actions」にする | Settings → Pages → Build and deployment |
| 独自ドメイン | `wiki.vcmc.jp`（DNS は `wiki` → `shotaxiangtai.github.io` の CNAME）。HTTPS を強制 | Settings → Pages → Custom domain / Enforce HTTPS |
| マージしたブランチを自動で消す | Automatically delete head branches | Settings → General → Pull Requests |
| 初めての投稿者の Actions | 初めて投稿する人の PR は、検証（Actions）を動かす前に管理者の承認が必要 | Settings → Actions → General → Approval for running fork pull request workflows |

![Pages の Source を GitHub Actions にする](docs/images/02-pages-source.png)

main に push（PR のマージを含む）すると、Actions の「Deploy」が動いて数分で公開されます。

GitHub Actions で公開しているので、独自ドメインは `CNAME` ファイルではなく Pages の設定で管理しています。以前の `https://shotaxiangtai.github.io/vcmc-wiki/` は、自動で `https://wiki.vcmc.jp/` に転送されます。

---

## 2. 設定ファイル（config.js）

`site/js/config.js` に公開してよい値だけを書きます。

| 項目 | 内容 | いまの値 |
| --- | --- | --- |
| `siteName` | サイト名 | `VoiceMC Wiki` |
| `siteTagline` | ロゴの下の説明 | `みんなで作る攻略・ルール集` |
| `mainPage` | トップに出すページ | `メインページ` |
| `helpPage` / `howtoPage` | 「Wikiの書き方」「投稿のしかた」のページ | `Wikiの書き方` / `投稿のしかた` |
| `termsPage` / `licensePage` | 利用規約・ライセンスのページ | `利用規約` / `ライセンス` |
| `imagesPage` | 画像のルールのページ | `画像のルール` |
| `skin` | `[[スキン:MCID]]` の顔の画像と、押したときに開くページ | mc-heads.net / NameMC |
| `contentLicense` | 記事のライセンス（名前と URL） | CC BY-SA 4.0 |
| `sidebarLinks` | 左メニューの「リンク」欄 | 公式サイト・公式 Discord |
| `repo` | 記事を置いているリポジトリ（編集の提案先・「履歴」タブ） | `ShotaXiangtai/vcmc-wiki` |
| `branch` | 公開に使うブランチ | `main` |

リポジトリ名を変えたときは、`repo` のほかに次も直してください。
- `.github/pull_request_template.md` の中のリンク
- `site/pages/ライセンス.md` の出典の書き方の例とリンク
- `scripts/capture-guide.mjs` で撮り直す画像と、`site/img/guide/*.svg` の中の文字（URL の表示）

---

## 3. ローカルで確認する

```bash
npm install
```
```bash
npm run build:index
```
```bash
npm run serve
```

`http://localhost:8000/` を開きます。

### テスト

```bash
npm test
```

ルールと検証スクリプトのテストです。画面のテストは Playwright で行います。

```bash
npx playwright install chromium
```
```bash
npm run test:e2e
```

Chromium を入れずに、インストール済みの Edge で動かすこともできます（PowerShell）：

```powershell
$env:PW_CHANNEL = 'msedge'; npm run test:e2e
```

スクリーンショットは `test-results/screenshots/` に保存されます。

### そのほかの作業

- 編集画面の見た目を変えたら、「投稿のしかた」の 1 枚目の画像を撮り直す：`npm run serve` は不要で、`node scripts/capture-guide.mjs`
- marked / DOMPurify を更新する：`npm install marked@latest dompurify@latest` のあと `npm run vendor`

---

## 4. 投稿の流れ（投稿する人向け）

Wiki の「[投稿のしかた](https://wiki.vcmc.jp/?p=投稿のしかた)」に画像付きでまとめています。編集画面の下にも同じ説明が出ます。

1. Wiki の編集画面で書いて、プレビューで確認する
2. 「① 本文をコピーする」→「② GitHub の編集画面を開く」
3. 初めてのときは「Fork this repository」を押す
4. GitHub で貼り付けて「Commit changes...」→「Propose changes」
5. 「Create pull request」→ 説明欄の確認項目を 3 つとも `[x]` にして、もう一度「Create pull request」

※ GitHub のアカウントは 13 歳以上でないと作れません。GitHub の画面は英語です。

---

## 5. 管理者向け：投稿（PR）を承認する

1. リポジトリの「**Pull requests**」タブを開く

   ![PR の一覧](docs/images/10-pr-list.png)

2. **初めて投稿した人の PR** には「Approve and run」というボタンが出ます。内容をざっと見て問題なければ押すと、検証（Validate）が動きます
3. PR の下のほうのチェック（**Validate**）が緑になっているか確認する
   - 赤いときは、使えない記述があるか、説明欄の確認項目（利用規約・ライセンス・無断転載）にチェックが付いていません。コメントで直してもらうか、Close してください
4. 「**Files changed**」タブで変更内容を確認する。ファイルの右上の表示切り替えで「rich diff」にすると、見た目に近い形で比べられます
   - `site/pages/` 以外のファイルの変更や、利用規約・ライセンスのページの変更には、Validate が警告を出します。特に注意してください
   - 埋め込んだ X のポスト・YouTube の動画（`[[埋め込み:URL]]`）、外部リンク、個人情報、無断転載、荒らしがないかを見ます。埋め込みの中身は、URL を開いて確かめてください
   - 画像のルールは Wiki の「画像のルール」のページにあります

   ![Files changed タブ](docs/images/11-pr-files.png)

5. 問題なければ「**Conversation**」タブに戻り、「**Merge pull request**」→「**Confirm merge**」

   ![Merge pull request](docs/images/12-pr-merge.png)

6. 数分で自動的に公開されます（GitHub Pages のキャッシュのため、反映まで最大 10 分ほどかかることがあります）

- **少し直してから公開したい**：fork からの PR は、ふつう「Allow edits by maintainers」が有効なので、「Files changed」でファイルの「…」→「Edit file」から直接直せます
- **公開しない**：理由をコメントしてから「**Close pull request**」
- **同じページへの投稿が重なった**：後の PR に「conflict」と出たら、Close して投稿し直してもらうのが簡単です

---

## 6. 運用：荒らし対策

### 荒らしをする人を止める

- **ブロック**：その人のプロフィール →「Block or report」→「Block user」。ブロックした人は、このアカウントのリポジトリに PR を出せなくなります
- **一時的に制限**：Settings →「Moderation options」→「**Interaction limits**」で、一定期間「以前に投稿したことがある人だけ」などに制限できます（荒らしが集中したとき）
- **報告**：悪質なものは「Report abuse」で GitHub に報告できます

### main ブランチを保護する

「Settings」→「**Rules**」→「**Rulesets**」→「New ruleset」→「New branch ruleset」で：

| 項目 | 設定 |
| --- | --- |
| Ruleset name | `main を保護` など |
| Enforcement status | **Active** |
| Bypass list | 自分（Repository admin）を追加（直接 push できるようにする） |
| Target branches | 「Add target」→「Include default branch」 |
| Restrict deletions | オン |
| Block force pushes | オン |
| Require a pull request before merging | オン（Required approvals は 0 または 1） |
| Require status checks to pass | オン →「Add checks」で **validate** を追加 |

![main の保護設定](docs/images/13-branch-protection.png)

### いらない PR をまとめて閉じる

```bash
gh pr list --state open
```
```bash
gh pr close 123 --comment "利用規約に反するため閉じました"
```

---

## 7. セキュリティについて

- **投稿内容は一切信頼しません**：表示するときは必ず DOMPurify で無害化し（スクリプト・フォーム・style 属性などを除去）、外部リンクには `rel="noopener noreferrer nofollow"` を付けます。さらに PR では人間が確認し、`validate.mjs` が `<script` `<iframe` `<object` `<embed` `onxxx=` `javascript:` などを機械的に弾きます
- **検証のすり抜けを防ぐ**：`validate.yml` は PR 側ではなく main 側の検証スクリプトを使います。fork からの PR の Actions は読み取り専用の権限で動き、秘密の値も使いません
- **ページの CSP**：`index.html` / `edit.html` の `<meta http-equiv="Content-Security-Policy">` で、自分のサイトと X の埋め込み用のスクリプト以外は動かないようにしています。画像はこのサイトとスキンの顔（mc-heads.net）だけを読み込みます
- **秘密の値はありません**：サーバーもトークンも使わないので、漏れて困る値がリポジトリにありません
- **画像・動画は埋め込みだけ**：画像は X のポスト、動画は YouTube を `[[埋め込み:URL]]` で埋め込みます。外部の画像 URL（`![](https://…)`）は表示せず、検証でもはじきます。X・YouTube は見る人が「表示する」を押したときだけ読み込むので、押すまで見る人の情報は外部に伝わりません。X の埋め込みはトラッキングを切る設定（dnt）で読み込み、YouTube は youtube-nocookie.com を使います
- **スキンの顔**：`[[スキン:MCID]]` は mc-heads.net の画像を表示し、押すと NameMC のプロフィールを開きます。使うサイトは `site/js/config.js` の `skin` で変えられます（変えたら CSP の `img-src` も直す）

---

## 8. ライセンス

| 対象 | ライセンス |
| --- | --- |
| サイトのプログラム | [MIT](LICENSE)（Copyright (c) 2026 ShotaXiangtai） |
| `site/pages/` の記事の文章 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ja) |
| VoiceMC のロゴ・アイコン（`site/img/logo.png`、`apple-touch-icon.png`） | 対象外（運営の許可なく使えません） |
| 埋め込んだ X のポスト・YouTube の動画、スキンの顔 | 対象外（それぞれの持ち主のもの） |
| `site/js/vendor/` のライブラリ | [marked](https://github.com/markedjs/marked)（MIT）、[DOMPurify](https://github.com/cure53/DOMPurify)（Apache-2.0 / MPL-2.0）。ライセンス文は同じフォルダにあります |

投稿のルールは Wiki の「利用規約」「ライセンス」のページにあります。Minecraft は Mojang Synergies AB の商標です。この Wiki は Mojang Studios・Microsoft の公式のものではなく、両社とは関係ありません。
