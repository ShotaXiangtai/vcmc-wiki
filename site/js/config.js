// Wiki の設定（公開される値だけを書く。秘密の値は置かない）
window.WIKI_CONFIG = {
  // サイト名（左上のロゴの下とタブのタイトルに出ます）
  siteName: 'VoiceMC Wiki',
  // ロゴの下に出る短い説明
  siteTagline: 'みんなで作る攻略・ルール集',
  // トップに表示するページ（site/pages/<この名前>.md）
  mainPage: 'メインページ',
  // 左メニューやフッターから開くページ
  helpPage: 'Wikiの書き方',
  howtoPage: '投稿のしかた',
  termsPage: '利用規約',
  licensePage: 'ライセンス',
  imagesPage: '画像のルール',
  // 記事のライセンス（文章だけ。画像・動画は X / YouTube の埋め込みで、それぞれの持ち主のもの）
  contentLicense: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja' },
  // [[スキン:MCID]] で使う、スキンの顔の画像と、押したときに開くページ（{name} と {size} が置き換わる）
  // 画像のサイトを変えたときは、index.html と edit.html の CSP の img-src も直す
  skin: {
    face: 'https://mc-heads.net/avatar/{name}/{size}',
    profile: 'https://namemc.com/profile/{name}',
  },
  // 左メニューの「リンク」欄（不要なら [] にする）
  sidebarLinks: [
    { text: '公式サイト', url: 'https://www.vcmc.jp/' },
    { text: '公式 Discord', url: 'https://discord.gg/UC7Zgvkps8' },
  ],
  // 記事を置いている GitHub のリポジトリ（owner/repo）。編集の提案先と「履歴」タブに使う
  repo: 'ShotaXiangtai/vcmc-wiki',
  // 公開に使うブランチ
  branch: 'main',
};
