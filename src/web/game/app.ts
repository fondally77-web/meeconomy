/** ゲーム本体：指示フェーズ → フロー → 月末リザルト → …… → 年度決算 */
import { initRun, simulateMonth } from '../../game/simulateMonth.js';
import { scoreRun } from '../../game/scoring.js';
import { stockQty, totalSheep } from '../../game/pipeline/flock.js';
import {
  SHEAR_CAPACITY, LAMB_PRICE, TRUCK_LOAD, ROUTES, RECIPES,
  MEAT_RECIPES, APPAREL_RECIPES, MEAT_PER_SHEEP, YARN_PER_WOOL,
} from '../../game/constants.js';
import type {
  MonthlyOrders, MonthlyResult, PriceStance, RecipeId, RouteId, RunState,
} from '../../game/types.js';
import { balancedBot } from '../../../sim/bots.js';
import { PipelineView, CW, CH } from './pipeline.js';
import { SE, unlockAudio, isSeOn, setSeOn } from './se.js';
import {
  MONTH_LABELS, EVENT_NAMES, RECIPE_NAMES, ROUTE_NAMES, COMPANY_NAMES, RANK_COMMENTS,
} from './labels.js';

const fmt = (v: number) => Math.round(v).toLocaleString('ja-JP');

function emptyOrders(): MonthlyOrders {
  return {
    lambsToBuy: 0, sheepToShear: 0, sheepToShip: 0, slaughterQty: 0,
    meatDirectRatio: 0, spinQty: 0, yarnDirectRatio: 0,
    meatRecipes: {}, apparelRecipes: {}, priceStance: 'standard',
    truckAssignment: {
      'farm-meat': 0, 'farm-wool': 0, 'meat-delica': 0, 'meat-sales': 0,
      'delica-sales': 0, 'wool-apparel': 0, 'apparel-sales': 0,
    },
  };
}

export class App {
  private s: RunState;
  private draft = emptyOrders();
  private feed: string[] = [];
  private unread = 0;
  private view: PipelineView;
  private hud: { money: HTMLElement; month: HTMLElement; meez: HTMLElement; bell: HTMLElement };
  private panel: HTMLElement;
  private texelEl: HTMLElement;
  private stage: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="wrap">
        <div id="hud">
          <span class="money">💰 <span id="hudMoney"></span>G</span>
          <span id="hudMonth"></span>
          <span class="meez" id="hudMeez"></span>
          <button id="hudBell" class="bell">🔔<span id="bellN"></span></button>
        </div>
        <div id="stage"><canvas id="game" width="${CW}" height="${CH}"
          aria-label="メェコノミーのパイプライン。上段がウールライン、下段が肉ライン"></canvas></div>
        <div class="tkwin" id="texelWin"><div id="texel"></div></div>
        <div id="panel"></div>
        <div id="feedWin" class="tkwin hidden"><b>🔔 つうち</b><div id="feedList"></div></div>
      </div>`;
    this.hud = {
      money: root.querySelector('#hudMoney')!,
      month: root.querySelector('#hudMonth')!,
      meez: root.querySelector('#hudMeez')!,
      bell: root.querySelector('#bellN')!,
    };
    this.panel = root.querySelector('#panel')!;
    this.texelEl = root.querySelector('#texel')!;
    this.stage = root.querySelector('#stage')!;
    const cv = root.querySelector<HTMLCanvasElement>('#game')!;
    this.view = new PipelineView(cv, (x, y, text, color) => this.popText(x, y, text, color));
    root.querySelector('#hudBell')!.addEventListener('click', () => {
      unlockAudio();
      root.querySelector('#feedWin')!.classList.toggle('hidden');
      this.unread = 0;
      this.renderHud();
    });
    this.s = initRun(((Date.now() % 90000) + 1));
    this.view.setState(this.s);
    this.pushFeed('🐑 新しい年度がはじまりました（4月）');
    this.ordersPhase();
  }

  // ── 共通 ──
  private popText(gx: number, gy: number, text: string, color = '#fff'): void {
    const cv = this.stage.querySelector('canvas')!;
    const r = cv.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(gx / CW) * r.width - 10}px`;
    el.style.top = `${(gy / CH) * r.height - 10}px`;
    this.stage.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  private texel(msg: string): void {
    this.texelEl.innerHTML = `<b>🧚テクセル</b><br>${msg}`;
  }

  private pushFeed(line: string): void {
    this.feed.unshift(line);
    this.feed = this.feed.slice(0, 30);
    this.unread++;
    const list = document.querySelector('#feedList')!;
    list.innerHTML = this.feed.map(l => `<div class="feedItem">${l}</div>`).join('');
    this.renderHud();
  }

  private renderHud(): void {
    this.hud.money.textContent = fmt(this.s.cash);
    this.hud.month.textContent = `🗓 ${MONTH_LABELS[Math.min(this.s.month, 11)]}`;
    this.hud.meez.textContent = `⚾${this.s.ballpark.headerLabel}`;
    this.hud.bell.textContent = this.unread > 0 ? String(this.unread) : '';
  }

  // ── 指示フェーズ ──
  private ordersPhase(): void {
    this.renderHud();
    const s = this.s;
    const d = this.draft;
    const shearMax = Math.min(s.flock.ready, SHEAR_CAPACITY);
    const room = Math.max(0, s.flock.capacity - totalSheep(s.flock));
    const season = s.month >= 3 && s.month <= 5 ? '☀️夏＝肉が旬' : s.month >= 6 && s.month <= 8 ? '❄️冬物本番＝アパレルが旬' : '';
    this.texel(`${MONTH_LABELS[s.month]}の指示をどうぞ。${season || '刈るか、肉にするか。'}`);

    const stepper = (label: string, get: () => number, set: (v: number) => void, max: number, hint = '') => `
      <div class="step" data-max="${max}">
        <span class="lbl">${label}</span>
        <button class="mini" data-d="-1">−</button><b class="val">${get()}</b><button class="mini" data-d="1">＋</button>
        <span class="hint">${hint || `最大${max}`}</span>
      </div>`;

    const recipeRows = (ids: RecipeId[], rec: Partial<Record<RecipeId, number>>) => ids.map(rid =>
      `<div class="step recipe" data-rid="${rid}">
        <span class="lbl">${RECIPE_NAMES[rid]}<small> ${RECIPES[rid].inputQty}${RECIPES[rid].inputGoods === 'yarn' ? '巻' : '箱'}→${fmt(RECIPES[rid].marketPrice)}G</small></span>
        <button class="mini" data-d="-1">−</button><b class="val">${rec[rid] ?? 0}</b><button class="mini" data-d="1">＋</button>
      </div>`).join('');

    const truckRows = ROUTES.map(r =>
      `<div class="step truck" data-route="${r}">
        <span class="lbl">${ROUTE_NAMES[r]}</span>
        <button class="mini" data-d="-1">−</button><b class="val">${d.truckAssignment[r]}</b><button class="mini" data-d="1">＋</button>
      </div>`).join('');

    this.panel.innerHTML = `
      <div class="tkwin orders">
        <div class="secTitle">🐑 ファーム <small>群れ${totalSheep(s.flock)}頭（毛OK ${s.flock.ready}・回復待ち ${s.flock.cd1 + s.flock.cd2}・子羊 ${s.flock.lambs}）</small></div>
        <div id="farmSteps"></div>
        <div class="secTitle">🥩 ミート／🍖 デリカ <small>と畜1頭→ラム肉${MEAT_PER_SHEEP}箱</small></div>
        <div id="meatSteps"></div>
        <div class="recipes" id="meatRecipes">${recipeRows(MEAT_RECIPES, d.meatRecipes)}</div>
        <div class="secTitle">🧶 ウール／👕 アパレル <small>紡績1袋→糸${YARN_PER_WOOL}巻</small></div>
        <div id="woolSteps"></div>
        <div class="recipes" id="apparelRecipes">${recipeRows(APPAREL_RECIPES, d.apparelRecipes)}</div>
        <div class="secTitle">🏪 セールス</div>
        <div class="stanceRow" id="stance">
          <button data-st="aggressive" class="${d.priceStance === 'aggressive' ? 'on' : ''}">強気×1.15</button>
          <button data-st="standard" class="${d.priceStance === 'standard' ? 'on' : ''}">標準</button>
          <button data-st="discount" class="${d.priceStance === 'discount' ? 'on' : ''}">弱気×0.9</button>
        </div>
        <div id="ratioSteps"></div>
        <div class="secTitle">🚚 ロジ <small>トラック<span id="truckLeft"></span>台（1台${TRUCK_LOAD}箱）</small>
          <button class="mini wide" id="autoTruck">自動配分</button></div>
        ${truckRows}
        <div class="btnRow">
          <button id="omakase">🤖おまかせ</button>
          <button id="go" class="primary">▶ この指示で1ヶ月すすめる</button>
        </div>
      </div>`;

    const farm = this.panel.querySelector('#farmSteps')!;
    const meat = this.panel.querySelector('#meatSteps')!;
    const wool = this.panel.querySelector('#woolSteps')!;
    const ratio = this.panel.querySelector('#ratioSteps')!;
    farm.innerHTML =
      stepper(`子羊を買う <small>${fmt(LAMB_PRICE)}G/頭</small>`, () => d.lambsToBuy, v => { d.lambsToBuy = v; }, room, `空き${room}`) +
      stepper('✂️ 毛を刈る', () => d.sheepToShear, v => { d.sheepToShear = v; }, shearMax) +
      stepper('🔪 出荷（肉行き）', () => d.sheepToShip, v => { d.sheepToShip = v; }, totalSheep(s.flock));
    meat.innerHTML =
      stepper('と畜する', () => d.slaughterQty, v => { d.slaughterQty = v; }, s.companies.meat.capacity);
    wool.innerHTML =
      stepper('紡績する', () => d.spinQty, v => { d.spinQty = v; }, s.companies.wool.capacity);
    ratio.innerHTML =
      stepper('ラム肉の直販', () => Math.round(d.meatDirectRatio * 10), v => { d.meatDirectRatio = v / 10; }, 10, `${Math.round(d.meatDirectRatio * 100)}%`) +
      stepper('糸の直販', () => Math.round(d.yarnDirectRatio * 10), v => { d.yarnDirectRatio = v / 10; }, 10, `${Math.round(d.yarnDirectRatio * 100)}%`);

    // ステッパー群のイベント束縛
    const bindStep = (el: Element, get: () => number, set: (v: number) => void, max: () => number) => {
      el.querySelectorAll<HTMLButtonElement>('button.mini').forEach(btn => {
        btn.addEventListener('click', () => {
          unlockAudio(); SE.decide();
          const v = Math.max(0, Math.min(max(), get() + Number(btn.dataset.d)));
          set(v);
          el.querySelector('.val')!.textContent = String(v);
          if (el.classList.contains('truck')) this.updateTruckLeft();
          if (el.parentElement === ratio || el.closest('#ratioSteps')) {
            const hint = el.querySelector('.hint');
            if (hint) hint.textContent = `${v * 10}%`;
          }
        });
      });
    };
    const farmSteps = farm.querySelectorAll('.step');
    bindStep(farmSteps[0], () => d.lambsToBuy, v => { d.lambsToBuy = v; }, () => room);
    bindStep(farmSteps[1], () => d.sheepToShear, v => { d.sheepToShear = v; }, () => shearMax);
    bindStep(farmSteps[2], () => d.sheepToShip, v => { d.sheepToShip = v; }, () => totalSheep(s.flock));
    bindStep(meat.querySelector('.step')!, () => d.slaughterQty, v => { d.slaughterQty = v; }, () => s.companies.meat.capacity);
    bindStep(wool.querySelector('.step')!, () => d.spinQty, v => { d.spinQty = v; }, () => s.companies.wool.capacity);
    const ratioSteps = ratio.querySelectorAll('.step');
    bindStep(ratioSteps[0], () => Math.round(d.meatDirectRatio * 10), v => { d.meatDirectRatio = v / 10; }, () => 10);
    bindStep(ratioSteps[1], () => Math.round(d.yarnDirectRatio * 10), v => { d.yarnDirectRatio = v / 10; }, () => 10);
    this.panel.querySelectorAll('#meatRecipes .step').forEach(el => {
      const rid = (el as HTMLElement).dataset.rid as RecipeId;
      bindStep(el, () => d.meatRecipes[rid as keyof typeof d.meatRecipes] ?? 0,
        v => { (d.meatRecipes as Record<string, number>)[rid] = v; }, () => s.companies.delica.capacity);
    });
    this.panel.querySelectorAll('#apparelRecipes .step').forEach(el => {
      const rid = (el as HTMLElement).dataset.rid as RecipeId;
      bindStep(el, () => d.apparelRecipes[rid as keyof typeof d.apparelRecipes] ?? 0,
        v => { (d.apparelRecipes as Record<string, number>)[rid] = v; }, () => s.companies.apparel.capacity);
    });
    this.panel.querySelectorAll('.step.truck').forEach(el => {
      const route = (el as HTMLElement).dataset.route as RouteId;
      bindStep(el, () => d.truckAssignment[route],
        v => { d.truckAssignment[route] = v; },
        () => d.truckAssignment[route] + this.trucksLeft());
    });
    this.updateTruckLeft();

    this.panel.querySelector('#stance')!.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio(); SE.decide();
        d.priceStance = btn.dataset.st as PriceStance;
        this.panel.querySelectorAll('#stance button').forEach(b => b.classList.toggle('on', b === btn));
      });
    });
    this.panel.querySelector('#autoTruck')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.autoAssignTrucks();
      this.ordersPhase();
      this.texel('在庫の多い区間へトラックを割り振りました');
    });
    this.panel.querySelector('#omakase')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.draft = balancedBot(this.s, SHEAR_CAPACITY);
      this.ordersPhase();
      this.texel('季節に合わせた指示を用意しました。微調整してどうぞ');
    });
    this.panel.querySelector('#go')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.runMonth();
    });
  }

  private trucksLeft(): number {
    const used = ROUTES.reduce((t, r) => t + this.draft.truckAssignment[r], 0);
    return Math.max(0, this.s.logi.trucks - used);
  }

  private updateTruckLeft(): void {
    const el = this.panel.querySelector('#truckLeft');
    if (el) el.textContent = ` 残り${this.trucksLeft()}/${this.s.logi.trucks}`;
  }

  /** 自動配分：運びたい量（在庫＋当月見込み）に比例して割当 */
  private autoAssignTrucks(): void {
    const s = this.s, d = this.draft;
    const st = (cid: keyof RunState['companies'], g: Parameters<typeof stockQty>[1]) =>
      stockQty(s.companies[cid].stock, g);
    const plannedRecipes = (rec: Partial<Record<RecipeId, number>>) =>
      Object.values(rec).reduce((t, v) => t + (v ?? 0), 0);
    const need: [RouteId, number][] = [
      ['farm-wool', st('farm', 'wool') + Math.min(d.sheepToShear, s.flock.ready)],
      ['farm-meat', st('farm', 'sheep') + d.sheepToShip],
      ['meat-delica', st('meat', 'lambMeat') + d.slaughterQty * MEAT_PER_SHEEP],
      ['meat-sales', Math.round((st('meat', 'lambMeat') + d.slaughterQty * MEAT_PER_SHEEP) * d.meatDirectRatio)],
      ['delica-sales', st('delica', 'genghis') + plannedRecipes(d.meatRecipes)],
      ['wool-apparel', st('wool', 'yarn') + d.spinQty * YARN_PER_WOOL],
      ['apparel-sales', st('apparel', 'muffler') + plannedRecipes(d.apparelRecipes)],
    ];
    for (const r of ROUTES) d.truckAssignment[r] = 0;
    const remain = new Map(need);
    for (let i = 0; i < s.logi.trucks; i++) {
      const [route, qty] = [...remain.entries()].sort((a, b) => b[1] - a[1])[0];
      if (qty <= 0) break;
      d.truckAssignment[route]++;
      remain.set(route, qty - TRUCK_LOAD);
    }
  }

  // ── フロー ──
  private runMonth(): void {
    const prev = this.s;
    const { next, result } = simulateMonth(prev, this.draft);
    this.panel.innerHTML = `<div class="tkwin flowNote">🚚 フロー中…（画面タップでスキップ）</div>`;
    if (result.eventId !== 'none') {
      this.pushFeed(`${MONTH_LABELS[result.month]}: ${EVENT_NAMES[result.eventId]}`);
      this.texel(EVENT_NAMES[result.eventId]);
    }
    this.view.startFlow(prev, this.draft, result, () => this.monthResult(next, result));
  }

  // ── 月末リザルト ──
  private monthResult(next: RunState, r: MonthlyResult): void {
    this.s = next;
    this.view.setState(next);
    this.renderHud();
    if (r.ballparkNews) this.pushFeed(`⚾ ${r.ballparkNews}`);
    if (next.puzzle) {
      this.pushFeed('🧾 帳簿ズレが発生…テクセルが自動修正しました（ズレ探しはP4で搭載予定）');
      next.puzzle = undefined;
    }
    const plRows = r.companyPLs.map(p =>
      `<tr><td>${COMPANY_NAMES[p.companyId]}</td><td class="num">${fmt(p.revenue)}</td>
       <td class="num ${p.profit >= 0 ? 'plus' : 'minus'}">${fmt(p.profit)}</td></tr>`).join('');
    this.panel.innerHTML = `
      <div class="tkwin result">
        <div class="secTitle">📋 ${MONTH_LABELS[r.month]}のけっさん</div>
        <table class="pl">
          <tr><th>会社</th><th class="num">売上</th><th class="num">利益</th></tr>
          ${plRows}
          <tr class="line"><td>たんじゅん合計</td><td></td><td class="num">${fmt(r.simpleSum)}</td></tr>
          <tr class="star"><td>グループれんけつ <button class="mini" id="whyBtn">★</button></td><td></td>
            <td class="num ${r.consolidatedProfit >= 0 ? 'plus' : 'minus'}"><b>${fmt(r.consolidatedProfit)}</b></td></tr>
        </table>
        <div id="whyBox" class="hidden">内部どうしの売買 <b>${fmt(r.eliminations)}G</b> は、グループの外から見ると
          「右のポケットから左のポケット」。れんけつでは消えます</div>
        <div class="cashRow">💰 現金 ${fmt(r.cashEnd)}G（収入${fmt(r.cashIn)}／支出${fmt(r.cashOut)}）
          ／ 販売${r.soldBoxes}箱${r.disposedBoxes > 0 ? `／<span class="minus">廃棄${r.disposedBoxes}箱</span>` : ''}</div>
        <div class="btnRow"><button id="nextBtn" class="primary">${this.s.month >= 12 || this.s.bankrupt ? '📊 年度決算へ' : '▶ 次の月へ'}</button></div>
      </div>`;
    this.panel.querySelector('#whyBtn')!.addEventListener('click', () => {
      this.panel.querySelector('#whyBox')!.classList.toggle('hidden');
    });
    this.panel.querySelector('#nextBtn')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      if (this.s.month >= 12 || this.s.bankrupt) this.annual();
      else this.ordersPhase();
    });
    this.texel(r.consolidatedProfit >= 0
      ? 'れんけつ黒字！たんじゅん合計との差は内部売買のぶんです'
      : '赤字の月もあります。エサ代と固定費、思ったより重いでしょう？');
    if (this.s.bankrupt) this.texel('現金が尽きてしまいました…');
  }

  // ── 年度決算 ──
  private annual(): void {
    const score = scoreRun(this.s, 0);
    if (score.rank === 'S' || score.rank === 'SS') SE.fanfare();
    else if (score.rank !== 'FAIL') SE.coin();
    const bonusRows = score.bonuses.map(b => `<div class="bonus">✅ ${b.label} <b>+${fmt(b.amount)}G</b></div>`).join('')
      || '<div class="bonus dim">ボーナスなし</div>';
    this.panel.innerHTML = `
      <div class="tkwin annual">
        <div class="secTitle">📊 年度決算</div>
        <div class="rankBig rank${score.rank}">${score.rank === 'FAIL' ? '倒産…' : `ランク ${score.rank}`}</div>
        <div class="scoreRow">スコア <b>${fmt(score.score)}G</b>（連結利益 ${fmt(score.consolidatedProfitTotal)}G）</div>
        ${bonusRows}
        <div class="scoreRow">のれんP <b>+${score.norenEarned}P</b> <small>（ラボ強化はP5で搭載予定）</small></div>
        <div class="btnRow"><button id="againBtn" class="primary">🐑 もう一度あそぶ</button></div>
      </div>`;
    this.texel(RANK_COMMENTS[score.rank] ?? '');
    this.panel.querySelector('#againBtn')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.s = initRun(((Date.now() % 90000) + 1));
      this.draft = emptyOrders();
      this.view.setState(this.s);
      this.pushFeed('🐑 新しい年度がはじまりました（4月）');
      this.ordersPhase();
    });
  }
}

export function bootSoundToggle(root: HTMLElement): void {
  const btn = document.createElement('button');
  btn.id = 'seToggle';
  btn.textContent = '🔊';
  btn.title = '効果音 ON/OFF';
  btn.addEventListener('click', () => {
    setSeOn(!isSeOn());
    btn.textContent = isSeOn() ? '🔊' : '🔇';
    if (isSeOn()) { unlockAudio(); SE.coin(); }
  });
  root.appendChild(btn);
}
