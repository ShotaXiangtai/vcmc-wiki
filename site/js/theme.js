// 表示の明るさ（ライト / ダーク）を、ページが表示される前に反映する（ちらつき防止）。
// 「自動」のときは何もしない（CSS が端末の設定に合わせる）。切り替えは common.js の Wiki.setTheme。
(function () {
  try {
    var v = window.localStorage.getItem('wiki-theme');
    if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
  } catch (e) { /* 保存できない環境では自動のまま */ }
})();
