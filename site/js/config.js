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
  // 記事のライセンス
  contentLicense: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja' },
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
