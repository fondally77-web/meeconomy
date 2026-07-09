import{i as u,s as m,j as h,c as f}from"./scoring-DsJzPQpv.js";const v=["4月","5月","6月","7月","8月","9月","10月","11月","12月","1月","2月","3月"];function g(s){const e=s.month;return e>=3&&e<=5?{lambsToBuy:3,sheepToShear:6,sheepToShip:3,slaughterQty:6,meatDirectRatio:.3,spinQty:0,yarnDirectRatio:0,meatRecipes:{genghis:3,lambCurry:1},apparelRecipes:{},priceStance:"standard",truckAssignment:{"farm-meat":1,"farm-wool":0,"meat-delica":1,"meat-sales":0,"delica-sales":1,"wool-apparel":0,"apparel-sales":0}}:{lambsToBuy:2,sheepToShear:6,sheepToShip:0,slaughterQty:0,meatDirectRatio:0,spinQty:8,yarnDirectRatio:.1,meatRecipes:{},apparelRecipes:e>=6?{sweater:2,muffler:2}:{muffler:3},priceStance:"standard",truckAssignment:{"farm-meat":0,"farm-wool":1,"meat-delica":0,"meat-sales":0,"delica-sales":0,"wool-apparel":1,"apparel-sales":1}}}function b(s){let e=u(s);const n=[];for(let i=0;i<12&&!e.bankrupt;i++){const d=g(e),{next:t,result:a}=m(e,d);if(e=t,e.puzzle){const o=e.puzzle.answerRowId;h(e.puzzle,o)&&(e.gapsFound++,e.cash+=1500)}n.push({monthLabel:v[a.month],result:a})}return{seed:s,steps:n,finalState:e,score:f(e,s)}}const l=document.querySelector("#app");if(!l)throw new Error("Missing #app");const $=l,r=s=>`${Math.round(s).toLocaleString("ja-JP")}G`,w=s=>s==="none"?"通常月":s;function c(s){const e=b(s),n=Math.max(1,...e.steps.map(t=>Math.abs(t.result.consolidatedProfit))),i=e.steps.reduce((t,a)=>a.result.consolidatedProfit>t.result.consolidatedProfit?a:t,e.steps[0]),d=e.steps.reduce((t,a)=>a.result.consolidatedProfit<t.result.consolidatedProfit?a:t,e.steps[0]);$.innerHTML=`
    <main class="shell">
      <section class="hero">
        <div>
          <p class="kicker">P2 経済エンジン検証（バランス収束済み）</p>
          <h1>メェコノミー</h1>
          <p class="lead">羊のサプライチェーンを12ヶ月まわして、れんけつ利益・現金・羊数・イベントの流れを眺める検証ビュー。</p>
        </div>
        <form class="seed-form" id="seed-form">
          <label for="seed">seed</label>
          <div class="seed-row">
            <input id="seed" name="seed" inputmode="numeric" value="${e.seed}" />
            <button type="submit">再実行</button>
          </div>
        </form>
      </section>

      <section class="summary" aria-label="年度決算">
        <article>
          <span>ランク</span>
          <strong>${e.score.rank}</strong>
        </article>
        <article>
          <span>スコア</span>
          <strong>${r(e.score.score)}</strong>
        </article>
        <article>
          <span>連結利益合計</span>
          <strong>${r(e.score.consolidatedProfitTotal)}</strong>
        </article>
        <article>
          <span>のれんP</span>
          <strong>${e.score.norenEarned}P</strong>
        </article>
      </section>

      <section class="insights">
        <div>
          <span>いちばん伸びた月</span>
          <strong>${i.monthLabel} ${r(i.result.consolidatedProfit)}</strong>
        </div>
        <div>
          <span>いちばん苦しい月</span>
          <strong>${d.monthLabel} ${r(d.result.consolidatedProfit)}</strong>
        </div>
        <div>
          <span>最後のメェーズニュース</span>
          <strong>${e.finalState.ballpark.newsLog.at(-1)??"ニュースなし"}</strong>
        </div>
      </section>

      <section class="timeline" aria-label="月次推移">
        ${e.steps.map(t=>{const a=t.result.consolidatedProfit,o=Math.max(8,Math.round(Math.abs(a)/n*100)),p=a>=0?"positive":"negative";return`
            <article class="month-card">
              <div class="month-head">
                <h2>${t.monthLabel}</h2>
                <span>${w(t.result.eventId)}</span>
              </div>
              <div class="bar-track">
                <div class="bar ${p}" style="width: ${o}%"></div>
              </div>
              <dl>
                <div><dt>れんけつ</dt><dd>${r(a)}</dd></div>
                <div><dt>現金</dt><dd>${r(t.result.cashEnd)}</dd></div>
                <div><dt>羊</dt><dd>${t.result.sheepCount}頭</dd></div>
                <div><dt>売上箱</dt><dd>${t.result.soldBoxes}箱</dd></div>
                <div><dt>廃棄</dt><dd>${t.result.disposedBoxes}箱</dd></div>
              </dl>
              <p>${t.result.ballparkNews||"静かな月。倉庫と台帳だけが着実に動いている。"}</p>
            </article>
          `}).join("")}
      </section>
    </main>
  `,document.querySelector("#seed-form")?.addEventListener("submit",t=>{t.preventDefault();const a=new FormData(t.currentTarget),o=Number(a.get("seed")||s);c(Number.isFinite(o)?o:s)})}c(20260613);
