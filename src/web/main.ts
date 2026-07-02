import { runBalancedScenario } from '../game/runScenario.js';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');
const appRoot = app;

const formatG = (value: number) => `${Math.round(value).toLocaleString('ja-JP')}G`;
const formatEvent = (eventId: string) => (eventId === 'none' ? '通常月' : eventId);

function render(seed: number) {
  const report = runBalancedScenario(seed);
  const maxProfit = Math.max(1, ...report.steps.map(step => Math.abs(step.result.consolidatedProfit)));
  const bestMonth = report.steps.reduce((best, step) =>
    step.result.consolidatedProfit > best.result.consolidatedProfit ? step : best, report.steps[0]);
  const worstMonth = report.steps.reduce((worst, step) =>
    step.result.consolidatedProfit < worst.result.consolidatedProfit ? step : worst, report.steps[0]);

  appRoot.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div>
          <p class="kicker">P0 Web Verification</p>
          <h1>メェコノミー</h1>
          <p class="lead">羊のサプライチェーンを12ヶ月まわして、れんけつ利益・現金・羊数・イベントの流れを眺める検証ビュー。</p>
        </div>
        <form class="seed-form" id="seed-form">
          <label for="seed">seed</label>
          <div class="seed-row">
            <input id="seed" name="seed" inputmode="numeric" value="${report.seed}" />
            <button type="submit">再実行</button>
          </div>
        </form>
      </section>

      <section class="summary" aria-label="年度決算">
        <article>
          <span>ランク</span>
          <strong>${report.score.rank}</strong>
        </article>
        <article>
          <span>スコア</span>
          <strong>${formatG(report.score.score)}</strong>
        </article>
        <article>
          <span>連結利益合計</span>
          <strong>${formatG(report.score.consolidatedProfitTotal)}</strong>
        </article>
        <article>
          <span>のれんP</span>
          <strong>${report.score.norenEarned}P</strong>
        </article>
      </section>

      <section class="insights">
        <div>
          <span>いちばん伸びた月</span>
          <strong>${bestMonth.monthLabel} ${formatG(bestMonth.result.consolidatedProfit)}</strong>
        </div>
        <div>
          <span>いちばん苦しい月</span>
          <strong>${worstMonth.monthLabel} ${formatG(worstMonth.result.consolidatedProfit)}</strong>
        </div>
        <div>
          <span>最後のメェーズニュース</span>
          <strong>${report.finalState.ballpark.newsLog.at(-1) ?? 'ニュースなし'}</strong>
        </div>
      </section>

      <section class="timeline" aria-label="月次推移">
        ${report.steps.map(step => {
          const profit = step.result.consolidatedProfit;
          const width = Math.max(8, Math.round((Math.abs(profit) / maxProfit) * 100));
          const profitClass = profit >= 0 ? 'positive' : 'negative';
          return `
            <article class="month-card">
              <div class="month-head">
                <h2>${step.monthLabel}</h2>
                <span>${formatEvent(step.result.eventId)}</span>
              </div>
              <div class="bar-track">
                <div class="bar ${profitClass}" style="width: ${width}%"></div>
              </div>
              <dl>
                <div><dt>れんけつ</dt><dd>${formatG(profit)}</dd></div>
                <div><dt>現金</dt><dd>${formatG(step.result.cashEnd)}</dd></div>
                <div><dt>羊</dt><dd>${step.result.sheepCount}頭</dd></div>
                <div><dt>売上箱</dt><dd>${step.result.soldBoxes}箱</dd></div>
                <div><dt>廃棄</dt><dd>${step.result.disposedBoxes}箱</dd></div>
              </dl>
              <p>${step.result.ballparkNews || '静かな月。倉庫と台帳だけが着実に動いている。'}</p>
            </article>
          `;
        }).join('')}
      </section>
    </main>
  `;

  document.querySelector<HTMLFormElement>('#seed-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const nextSeed = Number(form.get('seed') || seed);
    render(Number.isFinite(nextSeed) ? nextSeed : seed);
  });
}

render(20260613);
