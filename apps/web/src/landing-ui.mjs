// The supplied reference image contains baked-in lettering. This page uses a
// separate, text-free photograph so all copy remains selectable HTML.
export const landingCopy = Object.freeze([
  'SUITE',
  'Your Vision. Fully Realized.',
  '写真はクラウドへ。',
  '編集を、一台のパソコンから解き放つ。',
  '肌・人物補正はプラン内。チケット不要、枚数課金なし。',
  '色も、質感も、思いのままに。',
  'AI編集モードで、さらに表現を広げる。',
  '※AI生成は別料金を予定',
  '編集へ',
  '神戸発、安心の日本品質の写真編集アプリ。',
  'Made in Kobe, Japan.'
]);

export function mountLanding(root=document.querySelector('#app')) {
  if (!root) throw Error('LANDING_ROOT_MISSING');
  document.body.classList.add('editorial-home-page');
  root.innerHTML = `
    <main class="editorial-home" id="main-content">
      <div class="editorial-home__photograph">
        <img src="/assets/suite-editorial-hero-clean.png" alt="淡い石壁の前に佇む三人のファッションモデル。青緑のドレス、白の衣装、茶系のドレス。" fetchpriority="high">
      </div>
      <section class="editorial-home__copy" aria-labelledby="suite-title">
        <h1 id="suite-title">SUITE</h1>
        <p class="editorial-home__english">Your Vision. Fully Realized.</p>
        <p class="editorial-home__headline"><span>写真はクラウドへ。</span><span>編集を、一台のパソコンから<span class="editorial-home__small-break">解き放つ。</span></span></p>
        <div class="editorial-home__body"><p><span>肌・人物補正はプラン内。</span><span>チケット不要、枚数課金なし。</span></p><p>色も、質感も、思いのままに。</p><p>AI編集モードで、さらに表現を広げる。</p></div>
        <p class="editorial-home__ai-note">※AI生成は別料金を予定</p>
        <p class="editorial-home__availability">※現Web試用版では人物解析・AI編集・クラウド保存は未提供です。プラン・料金も未確定です。</p>
        <a class="editorial-home__cta" href="/?view=editor">編集へ</a>
        <button class="editorial-home__logout" id="landing-logout" type="button" hidden>ログアウト</button>
        <p class="editorial-home__account-status" id="landing-account-status" role="status" aria-live="polite" hidden></p>
        <p class="editorial-home__origin">神戸発、安心の日本品質の写真編集アプリ。<span>Made in Kobe, Japan.</span></p>
      </section>
    </main>
    <aside class="editorial-trial-notice" role="note">
      <p>Web試用版です。実カメラRAWの画質、実人物補正、iPad実機操作は未検証です。一般販売版ではありません。</p>
      <p>写真の基本編集はブラウザ内で利用できます。クラウド保存・作者提出・管理機能は現在未接続です。</p>
    </aside>`;
  return root;
}
