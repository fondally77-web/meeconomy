/** ゲーム本体：毎月を「お仕事体験」の工程で回す
 *  ①ファーム（✂️/🔪で羊を直接さわる）→ ②集荷（トラックが実際に運ぶ）
 *  → ③しこみ（紡績・と畜をタップ）→ ④配達 → ⑤加工（レシピをタップ）
 *  → ⑥出荷 → ⑦開店（値付け→売上）→ 月末リザルト
 *  会計の正はエンジン（simulateMonth）。工程で決めた量をMonthlyOrdersに積んで月末に渡す。
 */
import { initRun, simulateMonth } from '../../game/simulateMonth.js';
import { scoreRun } from '../../game/scoring.js';
import { stockQty, totalSheep } from '../../game/pipeline/flock.js';
import { mulberry32 } from '../../game/rng.js';
import { updateBallpark, rollEvent } from '../../game/ballpark.js';
import {
  SHEAR_CAPACITY, LAMB_PRICE, TRUCK_LOAD, ROUTES, RECIPES,
  MEAT_RECIPES, APPAREL_RECIPES, MEAT_PER_SHEEP, YARN_PER_WOOL, PUZZLE_REWARD,
  SHEAR_FEE, SLAUGHTER_FEE_PER_SHEEP, SPIN_FEE_PER_YARN, SHEEP_BOOK_VALUE, INITIAL_CASH,
} from '../../game/constants.js';
import type {
  EventId, MonthlyOrders, MonthlyResult, PriceStance, RecipeId, RouteId, RunState,
} from '../../game/types.js';
import { balancedBot } from '../../../sim/bots.js';
import { PipelineView, CW, CH, type Overlay, type GoodsItem } from './pipeline.js';
import { YARNROLL, GOLD_YARNROLL, MEATBOX, goodsSprite, goldify } from './sprites.js';
import { SE, unlockAudio, isSeOn, setSeOn } from './se.js';
import {
  MONTH_LABELS, EVENT_NAMES, RECIPE_NAMES, COMPANY_NAMES, RANK_COMMENTS, GOODS_NAMES,
} from './labels.js';
import type { EngineOptions, GoodsId, LedgerRow } from '../../game/types.js';
import { judgePuzzle } from '../../game/puzzle/ledgerGap.js';
import {
  LAB_NODES, loadMeta, saveMeta, levelOf, nextCost, betterRank, type MetaState,
} from './meta.js';

const fmt = (v: number) => Math.round(v).toLocaleString('ja-JP');

const TRUCK_PRICE = 5_000;   // 増車費用（暫定バランス。ラボ強化はP5で正式化）
const TRUCK_MAX = 8;
const GOLDEN_WOOL_BONUS = 800;
const GAP_LABELS: Record<string, string> = {
  qty: '数量ちがい', price: '単価ちがい', duplicate: '二重計上', missing: '記帳漏れ',
};

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
  private im!: Overlay;                  // 工程中の中間在庫（マップの山）
  private pool = 0;                      // 未配車トラック
  private eventId: EventId = 'none';
  private directMeat = 0;                // 直販に取り分けたラム肉
  private meatAtSplit = 0;               // 直販比率の分母（と畜後のラム肉量）
  private doSpin: (() => void) | null = null;      // 作業場シーンのcanvasタップ用
  private doSlaughter: (() => void) | null = null;
  private lambsLastMonth = 0;            // 先月買った子羊（今月「おとなに！」）
  private autoSkip = false;              // おまかせ再生の早送り
  private comboN = 0;                    // 連続作業コンボ
  private comboAt = 0;
  private puzzleTimer: ReturnType<typeof setInterval> | null = null;
  private apparelList: GoodsItem[] = []; // 完成品の内訳（棚の見た目用・金の商品含む）
  private delicaList: GoodsItem[] = [];
  private shelf: GoodsItem[] = [];
  private goldCarry = { farmWool: 0, woolWool: 0, woolYarn: 0, apparelYarn: 0 };  // 金の毛の月またぎ
  private meta: MetaState = loadMeta();  // のれんP・ラボ強化（永続）
  private engineOpts: EngineOptions = {};
  private baseShearCap = SHEAR_CAPACITY;
  private hintUsed = false;
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
    this.view = new PipelineView(cv, (x, y, text, color) => this.popText(x, y, text, color), {
      canShear: () => {
        const cap = this.shearCap();
        if (this.draft.sheepToShear >= cap) {
          this.texel(this.eventId === 'shearFes'
            ? `フェス中でも月${cap}頭が限界です`
            : `毛刈り班は月${cap}頭まで。つづきは来月（強化はラボ／P5）`);
          return false;
        }
        return true;
      },
      onSheared: (golden) => {
        this.draft.sheepToShear++;
        this.im.farmWool++;
        if (golden) this.im.goldFarmWool++;
        this.sync();
        this.updateFarmCounts();
        if (golden) this.goldenBonus();
        // ぜんぶ刈った！ボーナス演出
        const maxNow = Math.min(this.shearCap(), this.s.flock.ready);
        if (this.draft.sheepToShear >= maxNow && maxNow >= 3) {
          SE.fanfare();
          this.popText(130, 40, '🎉 ぜんぶ刈った！', '#ffd24a');
          this.texel('お見事！ぜんぶ刈りました。毛袋の山、うっとりしますね');
        }
      },
      canShip: () => true,
      onShipped: () => {
        this.draft.sheepToShip++;
        this.im.shipWait++;
        this.sync();
        this.updateFarmCounts();
      },
      onWorkTap: (kind) => {
        if (kind === 'spin') this.doSpin?.();
        else this.doSlaughter?.();
      },
      onTap: (id) => {
        const name = COMPANY_NAMES[id] ?? id;
        this.texel(`${name}のお仕事は、下のパネルの順番で回ってきます`);
      },
    });
    root.querySelector('#hudBell')!.addEventListener('click', () => {
      unlockAudio();
      root.querySelector('#feedWin')!.classList.toggle('hidden');
      this.unread = 0;
      this.renderHud();
    });
    this.s = this.newRun();
    this.view.setState(this.s);
    this.titlePhase();
  }

  // ── S01 タイトル ──
  private hasSave(): boolean {
    return this.meta.runs > 0 || this.meta.noren > 0 || Object.keys(this.meta.upgrades).length > 0;
  }

  private titlePhase(): void {
    this.view.setScene('map');
    this.view.setTool(null);
    this.renderHud();
    const save = this.hasSave();
    this.panel.innerHTML = `
      <div class="tkwin titleWin">
        <div class="titleLogo">🐑 メェコノミー <span class="titleCoin">🪙</span></div>
        <div class="titleSub">刈るか、肉にするか。──れんけつ経営ローグライト</div>
        ${save ? `<div class="note">📖 セーブデータ：${this.meta.runs}期おわり・のれん${this.meta.noren}P・ベスト${this.meta.bestRank}</div>` : ''}
        <div class="btnRow">
          ${save ? '<button id="contBtn" class="primary">📖 つづきから</button>' : ''}
          <button id="titleStart" class="${save ? '' : 'primary'}">🌱 はじめから</button>
        </div>
      </div>`;
    this.texel('ようこそ。仕訳の精、テクセルです。メェ');
    this.panel.querySelector('#contBtn')?.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.beginPeriod();
    });
    this.panel.querySelector('#titleStart')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      if (this.hasSave()) this.confirmReset();
      else this.intro();
    });
  }

  private confirmReset(): void {
    this.panel.innerHTML = `
      <div class="tkwin titleWin">
        <div class="note">⚠️ はじめからにすると、セーブ（${this.meta.runs}期・のれん${this.meta.noren}P・ラボ強化）は消えます。いいですか？</div>
        <div class="btnRow">
          <button id="backBtn">← もどる</button>
          <button id="wipeBtn">🗑 消してはじめから</button>
        </div>
      </div>`;
    this.panel.querySelector('#backBtn')!.addEventListener('click', () => { SE.decide(); this.titlePhase(); });
    this.panel.querySelector('#wipeBtn')!.addEventListener('click', () => {
      SE.deny();
      this.meta = { noren: 0, totalNoren: 0, runs: 0, bestRank: '-', upgrades: {} };
      saveMeta(this.meta);
      this.s = this.newRun();
      this.view.setState(this.s);
      this.intro();
    });
  }

  // ── ストーリー導入（台本03の口調で） ──
  private intro(page = 0): void {
    const pages: { scene: Parameters<PipelineView['setScene']>[0]; text: string }[] = [
      { scene: 'farm', text: 'ここは<b>メェダウ平原</b>。羊がすべての真ん中にいる土地です。<br>毛を刈れば服になり、お肉になればごちそうになる。<br>……そして、どちらもお金になります' },
      { scene: 'map', text: '<b>メェコノミーグループ</b>——初代が羊3頭から興した羊財閥。<br>牧場から店まで<b>7つの会社</b>、そして球団までまるごと、<br>今日、<b>3代目社長のあなた</b>が受け継ぎました' },
      { scene: 'farm', text: 'ボクはテクセル。経理部に代々住みつく<b>仕訳の精</b>です。<br>先代の口ぐせ、覚えておいてください。<br>「<b>羊は裏切らない。裏切るのは帳簿のほうだ</b>」……メェ' },
      { scene: 'farm', text: '社長の仕事は、毎月ひとつの二択です。<br><b>✂️刈って持ち続けるか、🔪売って現金にするか</b>。<br>持てばエサ代、売れば羊が減る。どちらも正解で、どちらも痛い' },
      { scene: 'market', text: '⚾<b>メェーズ</b>は<b>うちのグループの球団</b>です。<br>勝てばブランドが上がって商品が売れ、優勝すれば感謝セール。<br>補強するかどうかも、オーナーのあなたの決裁ですよ' },
      { scene: 'market', text: 'ゴールは<b>1年（12ヶ月）の決算</b>。れんけつ利益でランクが決まり、<br><b>のれん（信用）</b>が貯まって、次の期はもっと大きく戦えます。<br>目指せ、初代を超える羊財閥！' },
      { scene: 'farm', text: 'それでは第1期、<b>開幕</b>です。<br>まずは✂️を選んで、もこもこの羊をタップ。<br>いってらっしゃい、3代目！' },
    ];
    const p = pages[page];
    this.view.setScene(p.scene);
    this.panel.innerHTML = `
      <div class="tkwin titleWin">
        <div class="introText">${p.text}</div>
        <div class="btnRow">
          <button id="introSkip">⏩ スキップ</button>
          <button id="introNext" class="primary">${page < pages.length - 1 ? '▶ つぎへ' : '🐑 開幕！'}</button>
        </div>
      </div>`;
    this.texel(`📖 ものがたり ${page + 1}/${pages.length}`);
    this.panel.querySelector('#introNext')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      if (page < pages.length - 1) this.intro(page + 1);
      else { SE.fanfare(); this.beginPeriod(); }
    });
    this.panel.querySelector('#introSkip')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.beginPeriod();
    });
  }

  /** 期の開幕（口上つき） */
  private beginPeriod(): void {
    const period = this.meta.runs + 1;
    const goal = this.meta.bestRank !== '-' && this.meta.bestRank !== 'FAIL'
      ? `目標：ベスト「${this.meta.bestRank}」超え！`
      : '目標：まずは黒字でランクB！';
    this.pushFeed(`📖 第${period}期 開幕！ ${goal}`);
    this.startMonth();
  }

  /** ラボ強化を適用した新しいランを作る */
  private newRun(): RunState {
    const s = initRun(((Date.now() % 90000) + 1));
    const lv = (id: string) => levelOf(this.meta, id);
    s.flock.capacity += 5 * lv('farm');
    s.companies.farm.capacity = s.flock.capacity;
    s.companies.meat.capacity += 3 * lv('meat');
    s.companies.delica.capacity += 4 * lv('delica');
    s.companies.wool.capacity += 4 * lv('wool');
    s.companies.apparel.capacity += 3 * lv('apparel');
    s.companies.sales.capacity += 15 * lv('sales');
    s.logi.trucks += lv('trucks');
    s.cash += 5_000 * lv('cash');
    s.ballpark.teamPower = 50 + 10 * lv('meez');
    this.baseShearCap = SHEAR_CAPACITY + 3 * lv('shear');
    this.engineOpts = { shearCapacity: this.baseShearCap, fridge: lv('fridge') > 0 };
    return s;
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
    this.hud.month.textContent = `🗓 ${this.meta.runs + 1}期 ${MONTH_LABELS[Math.min(this.s.month, 11)]}`;
    this.hud.meez.textContent = `⚾${this.s.ballpark.headerLabel}`;
    this.hud.bell.textContent = this.unread > 0 ? String(this.unread) : '';
  }

  private sync(): void {
    const im = this.im;
    // 金の毛の内数は総量を超えない（普通の毛から先に消費される）
    im.goldFarmWool = Math.min(im.goldFarmWool, im.farmWool);
    im.goldWoolWool = Math.min(im.goldWoolWool, im.woolWool);
    im.goldWoolYarn = Math.min(im.goldWoolYarn, im.woolYarn);
    im.goldApparelYarn = Math.min(im.goldApparelYarn, im.apparelYarn);
    this.view.setOverlay(im);
    this.view.setCraftLists(this.apparelList, this.delicaList);
  }

  private cumProfit(): number {
    return this.s.history.reduce((t, m) => t + m.consolidatedProfit, 0);
  }

  /** 連続作業コンボ（2.5秒以内の連打で音程が上がる） */
  private comboHit(px: number, py: number): void {
    const now = performance.now();
    this.comboN = now - this.comboAt < 2500 ? this.comboN + 1 : 1;
    this.comboAt = now;
    SE.combo(this.comboN);
    if (this.comboN >= 3) this.popText(px, py, `×${this.comboN}コンボ！`, '#ffd24a');
  }

  private goodsName(g: GoodsId): string {
    return GOODS_NAMES[g] ?? RECIPE_NAMES[g as RecipeId] ?? g;
  }

  /** ✨金の毛：好事家が高値で買い取り（暫定。金レシピはP5ラボで検討） */
  private goldenBonus(): void {
    this.s.cash += GOLDEN_WOOL_BONUS;
    this.renderHud();
    SE.kaching();
    this.popText(60, 176, `✨金の毛！+${fmt(GOLDEN_WOOL_BONUS)}G`, '#ffd24a');
    this.pushFeed(`✨ 金の毛を好事家が${fmt(GOLDEN_WOOL_BONUS)}Gで買い取り`);
    this.texel('金色の毛！？めったに出ない逸品です。好事家が高値で…');
  }

  private shearCap(): number {
    return this.baseShearCap * (this.eventId === 'shearFes' ? 2 : 1);
  }

  private loadCap(): number {
    return this.eventId === 'roadWork' ? Math.floor(TRUCK_LOAD * 0.8) : TRUCK_LOAD;
  }

  /** 今月のイベントをエンジンと同じ乱数手順で先読み（表示と能力補正用） */
  private peekEvent(): EventId {
    const rng = mulberry32(0);
    rng.setState(this.s.rngState);
    const wasChampion = this.s.ballpark.leagueChampion && this.s.ballpark.phase === 'champion';
    updateBallpark(structuredClone(this.s.ballpark), this.s.month, rng);
    return rollEvent(this.s.month, rng, wasChampion, this.s.gapsTotal).eventId;
  }

  /** トラックを割り当てて運べる量を返す（エンジンと同じ丸め） */
  private alloc(route: RouteId, want: number): number {
    if (want <= 0 || this.pool <= 0) return 0;
    const n = Math.min(Math.ceil(want / this.loadCap()), this.pool);
    const moved = Math.min(want, n * this.loadCap());
    this.draft.truckAssignment[route] += n;
    this.pool -= n;
    this.view.setTrucksLeft(this.pool);
    return moved;
  }

  // ── 月のはじまり ──
  private startMonth(): void {
    const s = this.s;
    this.draft = emptyOrders();
    this.pool = s.logi.trucks;
    this.directMeat = 0;
    this.meatAtSplit = 0;
    this.eventId = this.peekEvent();
    const st = (cid: keyof RunState['companies'], g: Parameters<typeof stockQty>[1]) =>
      stockQty(s.companies[cid].stock, g);
    const goodsSum = (cid: keyof RunState['companies']) =>
      s.companies[cid].stock.reduce((t, l) => t + l.qty, 0);
    this.im = {
      farmWool: st('farm', 'wool'), shipWait: st('farm', 'sheep'),
      woolWool: st('wool', 'wool'), woolYarn: st('wool', 'yarn'),
      meatSheep: st('meat', 'sheep'), meatMeat: st('meat', 'lambMeat'),
      delicaMeat: st('delica', 'lambMeat'), delicaGoods: goodsSum('delica') - st('delica', 'lambMeat'),
      apparelYarn: st('apparel', 'yarn'), apparelGoods: goodsSum('apparel') - st('apparel', 'yarn'),
      salesBoxes: goodsSum('sales'),
      // 先月の金の毛は在庫が残っていれば金色のまま
      goldFarmWool: Math.min(this.goldCarry.farmWool, st('farm', 'wool')),
      goldWoolWool: Math.min(this.goldCarry.woolWool, st('wool', 'wool')),
      goldWoolYarn: Math.min(this.goldCarry.woolYarn, st('wool', 'yarn')),
      goldApparelYarn: Math.min(this.goldCarry.apparelYarn, st('apparel', 'yarn')),
    };
    // 完成品の内訳（棚に何の商品が並ぶか）
    const expand = (cid: keyof RunState['companies'], keep: (g: GoodsId) => boolean): GoodsItem[] =>
      s.companies[cid].stock.flatMap(l => keep(l.goodsId)
        ? Array.from({ length: l.qty }, () => ({ g: l.goodsId, gold: false }))
        : []);
    this.apparelList = expand('apparel', g => (APPAREL_RECIPES as string[]).includes(g));
    this.delicaList = expand('delica', g => (MEAT_RECIPES as string[]).includes(g));
    this.shelf = expand('sales', () => true);
    this.view.setShelf(this.shelf);
    this.sync();
    this.view.setTrucksLeft(this.pool);
    this.renderHud();
    if (this.eventId !== 'none') {
      this.pushFeed(`${MONTH_LABELS[s.month]}: ${EVENT_NAMES[this.eventId]}`);
    }
    this.stageFarm();
  }

  // ── ①ファーム ──
  private stageFarm(): void {
    this.view.setScene('farm');
    this.view.setTool('shear');
    const s = this.s;
    const room = Math.max(0, s.flock.capacity - totalSheep(s.flock));
    const eventNote = this.eventId !== 'none' ? `<div class="note event">${EVENT_NAMES[this.eventId]}</div>` : '';
    this.panel.innerHTML = `
      <div class="tkwin stageWin">
        <div class="secTitle">① 🐑ファームのお仕事 <small>${MONTH_LABELS[s.month]}・🚚${s.logi.trucks}台</small></div>
        ${eventNote}
        <div class="toolRow" id="toolRow">
          <button id="toolShear" class="on">✂️ 毛を刈る<br><small>刈毛費${fmt(SHEAR_FEE)}G/頭</small></button>
          <button id="toolShip">🔪 出荷する<br><small>羊はいなくなる</small></button>
        </div>
        <div class="note">道具を選んで<b>羊をタップ</b>！　✂️<span id="cntShear">0</span>/${this.shearCap()}頭　🔪<span id="cntShip">0</span>頭　<span id="truckNeed"></span></div>
        <div class="step" data-key="buy">
          <span class="lbl">子羊を買う <small>${fmt(LAMB_PRICE)}G/頭</small></span>
          <button class="mini" data-d="-1">−</button><b class="val">0</b><button class="mini" data-d="1">＋</button>
          <span class="hint">空き${room}</span>
        </div>
        <div class="step" data-key="truck">
          <span class="lbl">🚚 トラック増車 <small>${fmt(TRUCK_PRICE)}G/台</small></span>
          <button class="mini" data-d="1" id="buyTruck">＋</button>
          <span class="hint" id="truckHint">今${s.logi.trucks}台</span>
        </div>
        <div class="btnRow">
          <button id="omakase">🤖今月おまかせ</button>
          <button id="nextStage" class="primary">🚚 集荷にすすむ ▶</button>
        </div>
      </div>`;
    const m = s.month;
    const strategy = m >= 3 && m <= 5
      ? '☀️<b>夏は肉の季節</b>。🔪出荷多め・毛刈りは休みが吉。両方やるとトラックが足りません'
      : m >= 6 && m <= 8
        ? '❄️<b>冬物本番</b>。✂️毛刈りに集中してマフラー・セーターを！'
        : '✂️は2ヶ月で戻る資産、🔪は即現金。今月は片方に絞るとトラックが節約できます';
    this.texel(this.eventId === 'shearFes'
      ? '毛刈りフェス！今月はタダで倍まで刈れます✂️✂️'
      : strategy);
    this.updateFarmCounts();
    if (this.lambsLastMonth > 0) {
      this.popText(150, 110, `おとなに！×${this.lambsLastMonth}`, '#9fd0ff');
      this.lambsLastMonth = 0;
    }

    const buyStep = this.panel.querySelector('.step[data-key="buy"]')!;
    buyStep.querySelectorAll<HTMLButtonElement>('button.mini').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio(); SE.decide();
        const prev = this.draft.lambsToBuy;
        const v = Math.max(0, Math.min(room, prev + Number(btn.dataset.d)));
        this.draft.lambsToBuy = v;
        buyStep.querySelector('.val')!.textContent = String(v);
        if (v > prev) this.view.addLamb();      // 子羊がその場でやってくる
        else if (v < prev) this.view.removeLamb();
      });
    });
    const shearBtn = this.panel.querySelector('#toolShear')!;
    const shipBtn = this.panel.querySelector('#toolShip')!;
    shearBtn.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.view.setTool('shear');
      shearBtn.classList.add('on'); shipBtn.classList.remove('on');
      this.texel('✂️モード。もこもこの羊をタップ！');
    });
    shipBtn.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.view.setTool('ship');
      shipBtn.classList.add('on'); shearBtn.classList.remove('on');
      this.texel('🔪モード。タップした羊は乗り場へ歩いていきます');
    });
    this.panel.querySelector('#buyTruck')!.addEventListener('click', () => this.buyTruck());
    this.panel.querySelector('#omakase')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.runOmakase();
    });
    this.panel.querySelector('#nextStage')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.stageTransportA();
    });
  }

  /** 増車（どのステージのパネルからでも呼べる） */
  private buyTruck(): boolean {
    unlockAudio();
    if (this.s.logi.trucks >= TRUCK_MAX) { SE.deny(); this.texel(`車庫がいっぱい（最大${TRUCK_MAX}台）`); return false; }
    if (this.s.cash < TRUCK_PRICE) { SE.deny(); this.texel('現金が足りません。まず売上を…'); return false; }
    this.s.cash -= TRUCK_PRICE;
    this.s.logi.trucks++;
    this.pool++;
    this.view.setTrucksLeft(this.pool);
    this.renderHud();
    SE.buy();
    this.pushFeed(`🚚 トラックを増車（-${fmt(TRUCK_PRICE)}G・計${this.s.logi.trucks}台）`);
    this.texel(`🚚が${this.s.logi.trucks}台に！これで積み残しが減ります`);
    const hint = this.panel.querySelector('#truckHint');
    if (hint) hint.textContent = `今${this.s.logi.trucks}台`;
    this.updateFarmCounts();
    return true;
  }

  /** 積み残しパネル用の増車ボタンHTML＋バインド */
  private truckOfferHtml(leftovers: string[]): string {
    if (leftovers.length === 0 || this.s.logi.trucks >= TRUCK_MAX) return '';
    return `<div class="workRow"><button id="buyTruckNow">🚚 いま増車する <small>${fmt(TRUCK_PRICE)}G・今月から効く</small></button></div>`;
  }

  private bindTruckOffer(rerender: () => void): void {
    this.panel.querySelector('#buyTruckNow')?.addEventListener('click', () => {
      if (this.buyTruck()) rerender();
    });
  }

  private updateFarmCounts(): void {
    const cs = this.panel.querySelector('#cntShear');
    const cp = this.panel.querySelector('#cntShip');
    if (cs) cs.textContent = String(this.draft.sheepToShear);
    if (cp) cp.textContent = String(this.draft.sheepToShip);
    const tn = this.panel.querySelector('#truckNeed');
    if (tn) {
      // ざっくり必要台数：集荷（毛・羊）＋糸→アパレル＋店行きの見込み
      const load = this.loadCap();
      const yarn = Math.min(this.draft.sheepToShear + this.im.farmWool, this.s.companies.wool.capacity) * YARN_PER_WOOL;
      const need = Math.ceil(this.im.farmWool / load) + Math.ceil(this.im.shipWait / load)
        + Math.ceil(yarn / load) + (yarn > 0 ? 1 : 0) + (this.im.shipWait > 0 ? 1 : 0);
      tn.textContent = `見込み🚚${need}台/今${this.s.logi.trucks}台`;
      (tn as HTMLElement).style.color = need > this.s.logi.trucks ? '#ff9c9c' : '#9fe8a8';
    }
  }

  // ── ②集荷（ファーム→ウール/ミート） ──
  private stageTransportA(): void {
    this.view.setTool(null);
    this.view.setScene('map');
    this.panel.innerHTML = `<div class="tkwin flowNote">🚚 集荷中…</div>`;
    const mvW = this.alloc('farm-wool', this.im.farmWool);
    const mvS = this.alloc('farm-meat', this.im.shipWait);
    const leftovers: string[] = [];
    if (mvW < this.im.farmWool) leftovers.push(`羊毛${this.im.farmWool - mvW}袋`);
    if (mvS < this.im.shipWait) leftovers.push(`羊${this.im.shipWait - mvS}頭`);
    let waiting = 0;
    const done = () => { if (--waiting <= 0) this.enterWork(leftovers); };
    if (mvW > 0) {
      waiting++;
      const gm = Math.min(this.im.goldFarmWool, mvW);
      this.im.farmWool -= mvW;
      this.im.goldFarmWool -= gm;
      this.sync();
      this.view.animateTransport('farm-wool', 'wool', () => {
        this.im.woolWool += mvW;
        this.im.goldWoolWool += gm;
        this.sync();
        done();
      });
    }
    if (mvS > 0) {
      waiting++;
      this.im.shipWait -= mvS; this.sync();
      this.view.animateTransport('farm-meat', 'sheep', () => { this.im.meatSheep += mvS; this.sync(); done(); });
    }
    if (waiting === 0) this.enterWork(leftovers);
  }

  /** しこみ工程に用がなければ飛ばす（輸送完了時の入口でだけ判定） */
  private enterWork(leftovers: string[]): void {
    if (this.im.woolWool === 0 && this.im.meatSheep === 0 && this.im.meatMeat === 0 && leftovers.length === 0) {
      this.stageTransportB();
      return;
    }
    this.stageWork(leftovers);
  }

  // ── ③しこみ（紡績・と畜） ──
  private stageWork(leftovers: string[] = []): void {
    this.view.setScene('work');
    const s = this.s;
    const woolCap = s.companies.wool.capacity;
    const meatCap = s.companies.meat.capacity;
    const canSpin = this.im.woolWool > 0 && this.draft.spinQty < woolCap;
    const canSl = this.im.meatSheep > 0 && this.draft.slaughterQty < meatCap;
    this.panel.innerHTML = `
      <div class="tkwin stageWin">
        <div class="secTitle">② しこみのお仕事 <small>画面タップでも作業できます</small></div>
        <div class="workRow">
          <button id="spinBtn" ${canSpin ? '' : 'disabled'}>🧶 紡績する<br><small>羊毛${this.im.woolWool}袋 → 糸${YARN_PER_WOOL}巻・費用${fmt(SPIN_FEE_PER_YARN * YARN_PER_WOOL)}G（あと${woolCap - this.draft.spinQty}回）</small></button>
          <button id="spinAll" class="mini wide" ${canSpin ? '' : 'disabled'}>まとめて</button>
        </div>
        <div class="workRow">
          <button id="slBtn" ${canSl ? '' : 'disabled'}>🥩 と畜する<br><small>羊${this.im.meatSheep}頭 → ラム肉${MEAT_PER_SHEEP}箱・費用${fmt(SLAUGHTER_FEE_PER_SHEEP)}G（あと${meatCap - this.draft.slaughterQty}回）</small></button>
          <button id="slAll" class="mini wide" ${canSl ? '' : 'disabled'}>まとめて</button>
        </div>
        ${this.im.meatMeat > 0 ? `
        <div class="step" data-key="direct">
          <span class="lbl">🏪 ラム肉を直販へ <small>加工せずそのまま売る</small></span>
          <button class="mini" data-d="-1">−</button><b class="val">${this.directMeat}</b><button class="mini" data-d="1">＋</button>
          <span class="hint">在庫${this.im.meatMeat}箱</span>
        </div>` : ''}
        ${this.truckOfferHtml(leftovers)}
        <div class="btnRow"><button id="nextStage" class="primary">🚚 加工場へはこぶ ▶</button></div>
      </div>`;
    this.bindTruckOffer(() => this.stageWork(leftovers));
    if (leftovers.length > 0) {
      this.texel(`🚚が足りず ${leftovers.join('・')} は来月まで待機。増車すれば次の便から積めます`);
    } else {
      this.texel('画面かボタンをタップで1回ずつ加工。あなたが刈った毛が、糸に変わります');
    }

    const spin = () => {
      if (this.im.woolWool <= 0) { SE.deny(); this.texel('羊毛がありません'); return false; }
      if (this.draft.spinQty >= woolCap) { SE.deny(); this.texel(`紡績は月${woolCap}袋まで（ラボで強化できます）`); return false; }
      const goldSpin = this.im.goldWoolWool > 0; // 金の毛から先に紡ぐ
      this.draft.spinQty++;
      this.im.woolWool--;
      this.im.woolYarn += YARN_PER_WOOL;
      if (goldSpin) {
        this.im.goldWoolWool--;
        this.im.goldWoolYarn += YARN_PER_WOOL;
        this.view.craftPop('left', GOLD_YARNROLL);
        this.popText(76, 66, `✨金の糸x${YARN_PER_WOOL}！`, '#ffd24a');
      } else {
        this.view.craftPop('left', YARNROLL);
        this.popText(76, 66, `🧶x${YARN_PER_WOOL}`, '#9fd0ff');
      }
      this.comboHit(76, 40);
      return true;
    };
    const slaughter = () => {
      if (this.im.meatSheep <= 0) { SE.deny(); this.texel('と畜する羊がいません'); return false; }
      if (this.draft.slaughterQty >= meatCap) { SE.deny(); this.texel(`と畜は月${meatCap}頭まで（強化はラボ／P5）`); return false; }
      this.draft.slaughterQty++;
      this.im.meatSheep--;
      this.im.meatMeat += MEAT_PER_SHEEP;
      this.comboHit(236, 40);
      this.view.craftPop('right', MEATBOX);
      this.popText(236, 66, `🥩x${MEAT_PER_SHEEP}`, '#ff9c9c');
      return true;
    };
    this.doSpin = () => { if (spin()) { this.sync(); this.stageWork(); } };
    this.doSlaughter = () => { if (slaughter()) { this.sync(); this.stageWork(); } };
    const after = () => { this.sync(); this.stageWork(); };
    this.panel.querySelector('#spinBtn')?.addEventListener('click', () => { unlockAudio(); if (spin()) after(); });
    this.panel.querySelector('#slBtn')?.addEventListener('click', () => { unlockAudio(); if (slaughter()) after(); });
    this.panel.querySelector('#spinAll')?.addEventListener('click', () => {
      unlockAudio();
      let n = 0;
      while (spin()) n++;
      if (n > 0) after();
    });
    this.panel.querySelector('#slAll')?.addEventListener('click', () => {
      unlockAudio();
      let n = 0;
      while (slaughter()) n++;
      if (n > 0) after();
    });
    const directStep = this.panel.querySelector('.step[data-key="direct"]');
    directStep?.querySelectorAll<HTMLButtonElement>('button.mini').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio(); SE.decide();
        this.directMeat = Math.max(0, Math.min(this.im.meatMeat, this.directMeat + Number(btn.dataset.d)));
        directStep.querySelector('.val')!.textContent = String(this.directMeat);
      });
    });
    this.panel.querySelector('#nextStage')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.doSpin = null;
      this.doSlaughter = null;
      this.stageTransportB();
    });
  }

  // ── ④配達（糸→アパレル・肉→デリカ） ──
  private stageTransportB(): void {
    this.view.setScene('map');
    this.meatAtSplit = this.im.meatMeat;
    this.panel.innerHTML = `<div class="tkwin flowNote">🚚 配達中…</div>`;
    const mvY = this.alloc('wool-apparel', this.im.woolYarn);
    const wantM = Math.max(0, this.im.meatMeat - this.directMeat);
    const mvM = this.alloc('meat-delica', wantM);
    const leftovers: string[] = [];
    if (mvY < this.im.woolYarn) leftovers.push(`糸${this.im.woolYarn - mvY}巻`);
    if (mvM < wantM) leftovers.push(`ラム肉${wantM - mvM}箱`);
    let waiting = 0;
    const done = () => { if (--waiting <= 0) this.enterCraft(leftovers); };
    if (mvY > 0) {
      waiting++;
      const gm = Math.min(this.im.goldWoolYarn, mvY);
      this.im.woolYarn -= mvY;
      this.im.goldWoolYarn -= gm;
      this.sync();
      this.view.animateTransport('wool-apparel', 'yarn', () => {
        this.im.apparelYarn += mvY;
        this.im.goldApparelYarn += gm;
        this.sync();
        done();
      });
    }
    if (mvM > 0) {
      waiting++;
      this.im.meatMeat -= mvM; this.sync();
      this.view.animateTransport('meat-delica', 'lambMeat', () => { this.im.delicaMeat += mvM; this.sync(); done(); });
    }
    if (waiting === 0) this.enterCraft(leftovers);
  }

  /** 加工工程に用がなければ飛ばす（輸送完了時の入口でだけ判定） */
  private enterCraft(leftovers: string[]): void {
    if (this.im.apparelYarn === 0 && this.im.delicaMeat === 0 && leftovers.length === 0) {
      this.stageTransportC();
      return;
    }
    this.stageCraft(leftovers);
  }

  // ── ⑤加工（レシピ） ──
  private stageCraft(leftovers: string[] = []): void {
    this.view.setScene('craft');
    const s = this.s;
    const aCap = s.companies.apparel.capacity;
    const dCap = s.companies.delica.capacity;
    const aMade = Object.values(this.draft.apparelRecipes).reduce((t, v) => t + (v ?? 0), 0);
    const dMade = Object.values(this.draft.meatRecipes).reduce((t, v) => t + (v ?? 0), 0);
    const recipeBtn = (rid: RecipeId, stockLeft: number, capLeft: number) => {
      const def = RECIPES[rid];
      const ok = stockLeft >= def.inputQty && capLeft > 0;
      return `<button class="craftBtn" data-rid="${rid}" ${ok ? '' : 'disabled'}>
        ${RECIPE_NAMES[rid]}<br><small>${def.inputGoods === 'yarn' ? '糸' : '肉'}${def.inputQty}＋加工費${fmt(def.fee)}G→${fmt(def.marketPrice)}G</small>
      </button>`;
    };
    this.panel.innerHTML = `
      <div class="tkwin stageWin">
        <div class="secTitle">③ 加工のお仕事 <small>👕アパレル・🍖デリカ</small></div>
        <div class="note">👕 糸${this.im.apparelYarn}巻・のこり能力${aCap - aMade}着</div>
        <div class="craftRow">${APPAREL_RECIPES.map(r => recipeBtn(r, this.im.apparelYarn, aCap - aMade)).join('')}</div>
        <div class="note">🍖 ラム肉${this.im.delicaMeat}箱・のこり能力${dCap - dMade}箱</div>
        <div class="craftRow">${MEAT_RECIPES.map(r => recipeBtn(r, this.im.delicaMeat, dCap - dMade)).join('')}</div>
        ${this.truckOfferHtml(leftovers)}
        <div class="btnRow"><button id="nextStage" class="primary">🚚 店にならべる ▶</button></div>
      </div>`;
    this.bindTruckOffer(() => this.stageCraft(leftovers));
    if (leftovers.length > 0) {
      this.texel(`🚚が足りず ${leftovers.join('・')} は届きませんでした。増車すれば次の便から積めます`);
    } else if (this.im.apparelYarn > 0 || this.im.delicaMeat > 0) {
      this.texel('レシピをタップして1つずつ加工。加工するほど高く売れます');
    } else if (aMade + dMade > 0) {
      this.texel('材料をぜんぶ加工しました！店にならべましょう');
    } else {
      this.texel('今月は加工する材料なし。そのまま店へ');
    }
    this.panel.querySelectorAll<HTMLButtonElement>('.craftBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio();
        const rid = btn.dataset.rid as RecipeId;
        const def = RECIPES[rid];
        const isApparel = def.inputGoods === 'yarn';
        if (isApparel) {
          if (this.im.apparelYarn < def.inputQty) return;
          // 金の糸を優先して使い、1巻でも使えば金の商品に
          const goldUse = Math.min(this.im.goldApparelYarn, def.inputQty);
          this.im.goldApparelYarn -= goldUse;
          this.im.apparelYarn -= def.inputQty;
          this.im.apparelGoods++;
          const gold = goldUse > 0;
          this.apparelList.push({ g: rid, gold });
          this.draft.apparelRecipes[rid as keyof typeof this.draft.apparelRecipes] =
            (this.draft.apparelRecipes[rid as keyof typeof this.draft.apparelRecipes] ?? 0) + 1;
          this.view.craftPop('left', gold ? goldify(goodsSprite(rid)) : goodsSprite(rid));
          this.comboHit(76, 40);
          this.popText(76, 66, gold ? `✨金の${RECIPE_NAMES[rid]}！` : `👕${RECIPE_NAMES[rid]}！`, gold ? '#ffd24a' : '#f3b0dd');
        } else {
          if (this.im.delicaMeat < def.inputQty) return;
          this.im.delicaMeat -= def.inputQty;
          this.im.delicaGoods++;
          this.delicaList.push({ g: rid, gold: false });
          this.draft.meatRecipes[rid as keyof typeof this.draft.meatRecipes] =
            (this.draft.meatRecipes[rid as keyof typeof this.draft.meatRecipes] ?? 0) + 1;
          this.view.craftPop('right', goodsSprite(rid));
          this.comboHit(236, 40);
          this.popText(236, 66, `🍖${RECIPE_NAMES[rid]}！`, '#ffc98a');
        }
        this.sync();
        this.stageCraft();
      });
    });
    this.panel.querySelector('#nextStage')!.addEventListener('click', () => {
      unlockAudio(); SE.buy();
      this.stageTransportC();
    });
  }

  // ── ⑥出荷（→セールス） ──
  private stageTransportC(): void {
    this.view.setScene('map');
    this.panel.innerHTML = `<div class="tkwin flowNote">🚚 店へ出荷中…</div>`;
    const mvA = this.alloc('apparel-sales', this.im.apparelGoods);
    const mvD = this.alloc('delica-sales', this.im.delicaGoods);
    const mvM = this.alloc('meat-sales', Math.min(this.directMeat, this.im.meatMeat));
    const leftovers: string[] = [];
    if (mvA < this.im.apparelGoods) leftovers.push(`服${this.im.apparelGoods - mvA}着`);
    if (mvD < this.im.delicaGoods) leftovers.push(`加工品${this.im.delicaGoods - mvD}箱`);
    if (mvM < this.directMeat) leftovers.push(`直販肉${this.directMeat - mvM}箱`);
    let waiting = 0;
    const done = () => { if (--waiting <= 0) this.stageMarket(leftovers); };
    const move = (route: RouteId, goods: Parameters<PipelineView['animateTransport']>[1], qty: number, sub: () => void, items: GoodsItem[]) => {
      if (qty <= 0) return;
      waiting++;
      sub(); this.sync();
      this.view.animateTransport(route, goods, () => {
        this.im.salesBoxes += qty;
        this.shelf.push(...items);
        this.view.setShelf(this.shelf);
        this.sync();
        done();
      });
    };
    move('apparel-sales', 'muffler', mvA, () => { this.im.apparelGoods -= mvA; }, this.apparelList.splice(0, mvA));
    move('delica-sales', 'genghis', mvD, () => { this.im.delicaGoods -= mvD; }, this.delicaList.splice(0, mvD));
    move('meat-sales', 'lambMeat', mvM, () => { this.im.meatMeat -= mvM; },
      Array.from({ length: mvM }, () => ({ g: 'lambMeat' as GoodsId, gold: false })));
    if (waiting === 0) this.stageMarket(leftovers);
  }

  // ── ⑦開店 ──
  private stageMarket(leftovers: string[] = []): void {
    this.view.setScene('market');
    const d = this.draft;
    this.panel.innerHTML = `
      <div class="tkwin stageWin">
        <div class="secTitle">④ 🏪開店じゅんび <small>店頭 ${this.im.salesBoxes}箱</small></div>
        <div class="note">今月の値付けをどうぞ</div>
        <div class="stanceRow" id="stance">
          <button data-st="aggressive">強気×1.15<br><small>客は減る</small></button>
          <button data-st="standard" class="on">標準</button>
          <button data-st="discount">弱気×0.9<br><small>客が増える</small></button>
        </div>
        <div class="btnRow"><button id="openShop" class="primary">🔔 開店する！</button></div>
      </div>`;
    this.texel(leftovers.length > 0
      ? `🚚不足で ${leftovers.join('・')} は店に届かず…（増車は${fmt(TRUCK_PRICE)}G）。値付けをどうぞ`
      : 'いよいよ開店。強気で儲けるか、弱気で数をさばくか');
    this.panel.querySelector('#stance')!.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio(); SE.decide();
        d.priceStance = btn.dataset.st as PriceStance;
        this.panel.querySelectorAll('#stance button').forEach(b => b.classList.toggle('on', b === btn));
      });
    });
    this.panel.querySelector('#openShop')!.addEventListener('click', () => {
      unlockAudio(); SE.fanfare();
      d.meatDirectRatio = this.meatAtSplit > 0 ? Math.min(1, this.directMeat / this.meatAtSplit) : 0;
      this.runEngine();
    });
  }

  /** エンジン実行→売上演出→月末リザルト */
  private runEngine(): void {
    this.view.setTool(null);
    this.view.setScene('market');
    this.lambsLastMonth = this.draft.lambsToBuy;
    // 使い残した金の毛は来月へ持ち越し（在庫が残っていれば）
    this.goldCarry = {
      farmWool: this.im.goldFarmWool, woolWool: this.im.goldWoolWool,
      woolYarn: this.im.goldWoolYarn, apparelYarn: this.im.goldApparelYarn,
    };
    this.panel.innerHTML = `<div class="tkwin flowNote">🏪 えいぎょう中…（タップでスキップ）</div>`;
    const { next, result } = simulateMonth(this.s, this.draft, this.engineOpts);
    this.view.startMarket(result, () => this.monthResult(next, result));
  }

  private wait(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, this.autoSkip ? 0 : ms));
  }

  private autoTransport(
    route: RouteId, goods: Parameters<PipelineView['animateTransport']>[1],
    qty: number, sub: () => void, add: () => void,
  ): Promise<void> {
    return new Promise(res => {
      if (qty <= 0) { res(); return; }
      sub(); this.sync();
      if (this.autoSkip) { add(); this.sync(); res(); return; }
      this.view.animateTransport(route, goods, () => { add(); this.sync(); res(); });
    });
  }

  /** 🤖おまかせ：テクセルが全工程を目の前で代行（⏩で早送り） */
  private async runOmakase(): Promise<void> {
    const o = balancedBot(this.s, SHEAR_CAPACITY);
    const d = this.draft;
    const im = this.im;
    this.autoSkip = false;
    this.view.setTool(null);
    this.panel.innerHTML = `
      <div class="tkwin flowNote">🤖 テクセルが作業中…
        <div class="btnRow"><button id="skipAuto">⏩ 早送り</button></div>
      </div>`;
    this.panel.querySelector('#skipAuto')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.autoSkip = true;
    });

    // ①ファーム
    this.view.setScene('farm');
    this.texel('🤖「まず牧場。季節に合わせてお世話しますね」');
    for (let i = 0; i < o.lambsToBuy; i++) {
      this.view.addLamb();
      d.lambsToBuy++;
      await this.wait(220);
    }
    for (let i = 0; i < o.sheepToShear; i++) {
      const res = this.view.autoShearOne();
      if (!res) break;
      d.sheepToShear++;
      im.farmWool++;
      if (res.golden) { im.goldFarmWool++; this.goldenBonus(); }
      this.sync();
      await this.wait(260);
    }
    for (let i = 0; i < o.sheepToShip; i++) {
      if (!this.view.autoShipOne()) break;
      d.sheepToShip++;
      im.shipWait++;
      this.sync();
      await this.wait(220);
    }
    await this.wait(450);

    // ②集荷
    this.view.setScene('map');
    this.texel('🤖「集荷トラック、しゅっぱーつ」');
    const mvW = this.alloc('farm-wool', im.farmWool);
    const mvS = this.alloc('farm-meat', im.shipWait);
    const gmW = Math.min(im.goldFarmWool, mvW);
    await Promise.all([
      this.autoTransport('farm-wool', 'wool', mvW,
        () => { im.farmWool -= mvW; im.goldFarmWool -= gmW; },
        () => { im.woolWool += mvW; im.goldWoolWool += gmW; }),
      this.autoTransport('farm-meat', 'sheep', mvS, () => { im.shipWait -= mvS; }, () => { im.meatSheep += mvS; }),
    ]);

    // ③しこみ
    if (im.woolWool > 0 || im.meatSheep > 0) {
      this.view.setScene('work');
      this.texel('🤖「紡績と、と畜です。えいっ」');
      const spinN = Math.min(o.spinQty, this.s.companies.wool.capacity, im.woolWool);
      for (let i = 0; i < spinN; i++) {
        const goldSpin = im.goldWoolWool > 0;
        d.spinQty++; im.woolWool--; im.woolYarn += YARN_PER_WOOL;
        if (goldSpin) { im.goldWoolWool--; im.goldWoolYarn += YARN_PER_WOOL; }
        SE.pop(); this.view.craftPop('left', goldSpin ? GOLD_YARNROLL : YARNROLL); this.sync();
        await this.wait(200);
      }
      const slN = Math.min(o.slaughterQty, this.s.companies.meat.capacity, im.meatSheep);
      for (let i = 0; i < slN; i++) {
        d.slaughterQty++; im.meatSheep--; im.meatMeat += MEAT_PER_SHEEP;
        SE.pop(); this.view.craftPop('right', MEATBOX); this.sync();
        await this.wait(200);
      }
    }
    this.meatAtSplit = im.meatMeat;
    this.directMeat = Math.round(this.meatAtSplit * o.meatDirectRatio);

    // ④配達
    this.view.setScene('map');
    const mvY = this.alloc('wool-apparel', im.woolYarn);
    const wantM = Math.max(0, im.meatMeat - this.directMeat);
    const mvM = this.alloc('meat-delica', wantM);
    const gmY = Math.min(im.goldWoolYarn, mvY);
    await Promise.all([
      this.autoTransport('wool-apparel', 'yarn', mvY,
        () => { im.woolYarn -= mvY; im.goldWoolYarn -= gmY; },
        () => { im.apparelYarn += mvY; im.goldApparelYarn += gmY; }),
      this.autoTransport('meat-delica', 'lambMeat', mvM, () => { im.meatMeat -= mvM; }, () => { im.delicaMeat += mvM; }),
    ]);

    // ⑤加工
    if (im.apparelYarn > 0 || im.delicaMeat > 0) {
      this.view.setScene('craft');
      this.texel('🤖「加工タイム。今日のレシピはこちら」');
      const aCap = this.s.companies.apparel.capacity;
      const dCap = this.s.companies.delica.capacity;
      let aMade = 0, dMade = 0;
      for (const [rid, n] of Object.entries(o.apparelRecipes) as [RecipeId, number][]) {
        const def = RECIPES[rid];
        for (let i = 0; i < (n ?? 0) && aMade < aCap && im.apparelYarn >= def.inputQty; i++) {
          const goldUse = Math.min(im.goldApparelYarn, def.inputQty);
          im.goldApparelYarn -= goldUse;
          im.apparelYarn -= def.inputQty; im.apparelGoods++; aMade++;
          const gold = goldUse > 0;
          this.apparelList.push({ g: rid, gold });
          d.apparelRecipes[rid as keyof typeof d.apparelRecipes] =
            (d.apparelRecipes[rid as keyof typeof d.apparelRecipes] ?? 0) + 1;
          SE.pop(); this.view.craftPop('left', gold ? goldify(goodsSprite(rid)) : goodsSprite(rid)); this.sync();
          await this.wait(220);
        }
      }
      for (const [rid, n] of Object.entries(o.meatRecipes) as [RecipeId, number][]) {
        const def = RECIPES[rid];
        for (let i = 0; i < (n ?? 0) && dMade < dCap && im.delicaMeat >= def.inputQty; i++) {
          im.delicaMeat -= def.inputQty; im.delicaGoods++; dMade++;
          this.delicaList.push({ g: rid, gold: false });
          d.meatRecipes[rid as keyof typeof d.meatRecipes] =
            (d.meatRecipes[rid as keyof typeof d.meatRecipes] ?? 0) + 1;
          SE.pop(); this.view.craftPop('right', goodsSprite(rid)); this.sync();
          await this.wait(220);
        }
      }
    }

    // ⑥出荷
    this.view.setScene('map');
    const mvA = this.alloc('apparel-sales', im.apparelGoods);
    const mvD = this.alloc('delica-sales', im.delicaGoods);
    const mvDM = this.alloc('meat-sales', Math.min(this.directMeat, im.meatMeat));
    const takeA = this.apparelList.splice(0, mvA);
    const takeD = this.delicaList.splice(0, mvD);
    await Promise.all([
      this.autoTransport('apparel-sales', 'muffler', mvA, () => { im.apparelGoods -= mvA; },
        () => { im.salesBoxes += mvA; this.shelf.push(...takeA); this.view.setShelf(this.shelf); }),
      this.autoTransport('delica-sales', 'genghis', mvD, () => { im.delicaGoods -= mvD; },
        () => { im.salesBoxes += mvD; this.shelf.push(...takeD); this.view.setShelf(this.shelf); }),
      this.autoTransport('meat-sales', 'lambMeat', mvDM, () => { im.meatMeat -= mvDM; },
        () => {
          im.salesBoxes += mvDM;
          this.shelf.push(...Array.from({ length: mvDM }, () => ({ g: 'lambMeat' as GoodsId, gold: false })));
          this.view.setShelf(this.shelf);
        }),
    ]);

    // ⑦開店
    d.priceStance = o.priceStance;
    d.meatDirectRatio = this.meatAtSplit > 0 ? Math.min(1, this.directMeat / this.meatAtSplit) : 0;
    this.texel('🤖「開店です！売上はいかに…」');
    await this.wait(300);
    this.runEngine();
  }

  // ── 月末リザルト ──
  private monthResult(next: RunState, r: MonthlyResult): void {
    this.s = next;
    this.view.setScene('map');
    this.view.setOverlay(null);
    this.view.setState(next);
    this.view.setTrucksLeft(next.logi.trucks);
    this.renderHud();
    if (r.ballparkNews) this.pushFeed(`⚾ ${r.ballparkNews}`);
    if (next.puzzle) {
      this.puzzlePhase(r);
      return;
    }
    this.renderMonthResult(r);
  }

  // ── 🧾ズレ探し ──
  private puzzlePhase(r: MonthlyResult): void {
    const p = this.s.puzzle!;
    SE.deny();
    this.pushFeed('🧾 帳簿ズレ発生！売り手と買い手の帳簿がくいちがっています');
    this.texel(`${COMPANY_NAMES[p.sellerCompanyId]}と${COMPANY_NAMES[p.buyerCompanyId]}の帳簿、<b>1行だけ</b>くいちがいがあります。おかしい行をタップ！`);
    const rowBtn = (row: LedgerRow) => `
      <button class="ledgerRow" data-rowid="${row.rowId}">
        ${this.goodsName(row.goodsId)}　${row.qty}×${fmt(row.unitPrice)}G＝<b>${fmt(row.amount)}G</b>
      </button>`;
    this.panel.innerHTML = `
      <div class="tkwin puzzleWin">
        <div class="secTitle">🧾 帳簿ズレをさがせ！ <span id="pzTime" class="pzTime">${p.timeLimitSec}</span>秒</div>
        <div class="ledgerGrid">
          <div class="ledgerCol">
            <div class="colTitle">${COMPANY_NAMES[p.sellerCompanyId]}の売上帳</div>
            ${p.sellerRows.map(rowBtn).join('')}
          </div>
          <div class="ledgerCol">
            <div class="colTitle">${COMPANY_NAMES[p.buyerCompanyId]}の仕入帳</div>
            ${p.buyerRows.map(rowBtn).join('')}
          </div>
        </div>
        <div class="btnRow">
          ${levelOf(this.meta, 'buddy') > 0 ? '<button id="pzHint">🧚 ヒント（1回）</button>' : ''}
          <button id="giveUp">🏳 テクセルに任せる（報酬なし）</button>
        </div>
      </div>`;

    let remain = p.timeLimitSec + 15 * levelOf(this.meta, 'buddy');
    this.hintUsed = false;
    this.panel.querySelector('#pzTime')!.textContent = String(remain);
    this.panel.querySelector('#pzHint')?.addEventListener('click', () => {
      unlockAudio();
      if (this.hintUsed) { SE.deny(); return; }
      this.hintUsed = true;
      SE.decide();
      const wrongs = [...this.panel.querySelectorAll<HTMLButtonElement>('.ledgerRow:not([disabled])')]
        .filter(b => b.dataset.rowid !== p.answerRowId).slice(0, 3);
      for (const b of wrongs) { b.disabled = true; b.classList.add('wrong'); b.insertAdjacentHTML('afterbegin', '🧚 '); }
      this.texel('🧚「このへんは合ってました！のこりから探して」');
    });
    const timeEl = this.panel.querySelector('#pzTime')!;
    const finish = (solved: boolean) => {
      if (this.puzzleTimer) { clearInterval(this.puzzleTimer); this.puzzleTimer = null; }
      if (solved) {
        this.s.gapsFound++;
        this.s.cash += PUZZLE_REWARD;
        SE.fanfare();
        this.renderHud();
        this.pushFeed(`🧾 ズレを発見！【${GAP_LABELS[p.gapType]}】 +${fmt(PUZZLE_REWARD)}G`);
      } else {
        this.pushFeed('🧾 ズレはテクセルが修正（翌月に自動反映・ペナルティなし）');
        this.texel('だいじょうぶ、修正しておきました。来月もチャンスはあります');
      }
      this.s.puzzle = undefined;
      this.renderMonthResult(r);
    };
    // 解答後は自動で進まず「けっさんへ」ボタンで進む（読む時間を確保）
    const showContinue = (solved: boolean) => {
      this.panel.querySelectorAll<HTMLButtonElement>('.ledgerRow').forEach(b => { b.disabled = true; });
      const row = this.panel.querySelector('.puzzleWin .btnRow')!;
      row.innerHTML = `<button id="pzCont" class="primary">📋 けっさんへ ▶</button>`;
      row.querySelector('#pzCont')!.addEventListener('click', () => { unlockAudio(); SE.decide(); finish(solved); });
    };
    this.puzzleTimer = setInterval(() => {
      remain--;
      timeEl.textContent = String(remain);
      if (remain <= 10) (timeEl as HTMLElement).style.color = '#ff9c9c';
      if (remain <= 0) {
        if (this.puzzleTimer) { clearInterval(this.puzzleTimer); this.puzzleTimer = null; }
        this.texel('じかんぎれ…！ズレはテクセルが直しておきます。ペナルティはありません');
        showContinue(false);
      }
    }, 1000);
    this.panel.querySelectorAll<HTMLButtonElement>('.ledgerRow').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio();
        if (judgePuzzle(p, btn.dataset.rowid!)) {
          if (this.puzzleTimer) { clearInterval(this.puzzleTimer); this.puzzleTimer = null; }
          // ⭕正解演出：正解行を光らせ、相方の行と差分を見せる
          btn.classList.add('correct');
          btn.insertAdjacentHTML('afterbegin', '⭕ ');
          const pair = (p.gapType === 'missing' ? p.buyerRows : p.sellerRows)
            .find(row => row.rowId === btn.dataset.rowid);
          const target = [...p.sellerRows, ...p.buyerRows].find(row => row.rowId === btn.dataset.rowid)!;
          const detail = p.gapType === 'duplicate' ? '同じ行が2回記帳されています'
            : p.gapType === 'missing' ? '買い手の帳簿に相手方の行がありません'
            : pair ? `${fmt(pair.amount)}G のはずが ${fmt(target.amount)}G` : '';
          SE.coin();
          this.texel(`⭕ 正解！【${GAP_LABELS[p.gapType]}】${detail}。報酬<b>+${fmt(PUZZLE_REWARD)}G</b>`);
          showContinue(true);
        } else {
          SE.deny();
          btn.disabled = true;
          btn.classList.add('wrong');
          btn.insertAdjacentHTML('afterbegin', '❌ ');
          this.texel('❌ そこは両方の帳簿で一致しています。くいちがう行を…！');
        }
      });
    });
    this.panel.querySelector('#giveUp')!.addEventListener('click', () => { unlockAudio(); SE.decide(); finish(false); });
  }

  private renderMonthResult(r: MonthlyResult): void {
    const plRows = r.companyPLs.map(p =>
      `<tr><td>${COMPANY_NAMES[p.companyId]}</td><td class="num">${fmt(p.revenue)}</td>
       <td class="num">${fmt(p.cost)}</td>
       <td class="num ${p.profit >= 0 ? 'plus' : 'minus'}">${fmt(p.profit)}</td></tr>`).join('');
    // B/S（貸借対照表）: 現金＋在庫（グループ原価）＋羊
    const s = this.s;
    const inventory = (Object.keys(s.companies) as (keyof RunState['companies'])[])
      .reduce((t, cid) => t + s.companies[cid].stock.reduce((u, l) => u + l.groupCost * l.qty, 0), 0);
    const livestock = totalSheep(s.flock) * SHEEP_BOOK_VALUE;
    const assets = s.cash + inventory + livestock;
    this.panel.innerHTML = `
      <div class="tkwin result">
        <div class="secTitle">📋 ${MONTH_LABELS[r.month]}のけっさん（P/L）</div>
        <table class="pl">
          <tr><th>会社</th><th class="num">売上</th><th class="num">費用</th><th class="num">利益</th></tr>
          ${plRows}
          <tr class="line"><td>たんじゅん合計</td><td></td><td></td><td class="num">${fmt(r.simpleSum)}</td></tr>
          <tr class="star"><td>グループれんけつ <button class="mini" id="whyBtn">★</button></td><td></td><td></td>
            <td class="num ${r.consolidatedProfit >= 0 ? 'plus' : 'minus'}"><b>${fmt(r.consolidatedProfit)}</b></td></tr>
        </table>
        <div id="whyBox" class="hidden">内部どうしの売買 <b>${fmt(r.eliminations)}G</b> は、グループの外から見ると
          「右のポケットから左のポケット」。れんけつでは消えます</div>
        <div id="bsBox" class="hidden">
          <div class="secTitle">🏦 いまの財産（B/S・グループ）</div>
          <table class="pl">
            <tr><td>💰 現金</td><td class="num">${fmt(s.cash)}G</td></tr>
            <tr><td>📦 在庫（原価で評価）</td><td class="num">${fmt(inventory)}G</td></tr>
            <tr><td>🐑 羊（${totalSheep(s.flock)}頭×${fmt(SHEEP_BOOK_VALUE)}G）</td><td class="num">${fmt(livestock)}G</td></tr>
            <tr class="line"><td><b>資産合計</b>（借金なし＝ぜんぶ自前）</td>
              <td class="num"><b>${fmt(assets)}G</b></td></tr>
            <tr><td>スタート時からの増減</td>
              <td class="num ${assets - INITIAL_CASH >= 0 ? 'plus' : 'minus'}">${assets - INITIAL_CASH >= 0 ? '+' : ''}${fmt(assets - INITIAL_CASH)}G</td></tr>
          </table>
          <div class="note dim">在庫はまだお金になっていない財産。売れれば現金に、腐れば消えます</div>
        </div>
        <div class="cashRow">💰 現金 ${fmt(r.cashEnd)}G（収入${fmt(r.cashIn)}／支出${fmt(r.cashOut)}）
          ／ 販売${r.soldBoxes}箱${r.disposedBoxes > 0 ? `／<span class="minus">廃棄${r.disposedBoxes}箱</span>` : ''}</div>
        <div class="cashRow">📈 年度累計 <b class="${this.cumProfit() >= 0 ? 'plus' : 'minus'}">${fmt(this.cumProfit())}G</b>
          <small>（ランクBの目安：スコア20,000G〜）</small></div>
        <div class="btnRow">
          <button id="bsBtn">🏦 B/S</button>
          <button id="nextBtn" class="primary">${this.s.month >= 12 || this.s.bankrupt ? '📊 年度決算へ' : '▶ 次の月へ'}</button>
        </div>
      </div>`;
    this.panel.querySelector('#whyBtn')!.addEventListener('click', () => {
      this.panel.querySelector('#whyBox')!.classList.toggle('hidden');
    });
    this.panel.querySelector('#bsBtn')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      this.panel.querySelector('#bsBox')!.classList.toggle('hidden');
    });
    this.panel.querySelector('#nextBtn')!.addEventListener('click', () => {
      unlockAudio(); SE.decide();
      if (this.s.month >= 12 || this.s.bankrupt) this.annual();
      else this.startMonth();
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
    // メタ更新（のれんPを獲得して永続化）
    this.meta.noren += score.norenEarned;
    this.meta.totalNoren += score.norenEarned;
    this.meta.runs++;
    this.meta.bestRank = betterRank(this.meta.bestRank, score.rank);
    saveMeta(this.meta);
    const bonusRows = score.bonuses.map(b => `<div class="bonus">✅ ${b.label} <b>+${fmt(b.amount)}G</b></div>`).join('')
      || '<div class="bonus dim">ボーナスなし</div>';
    this.panel.innerHTML = `
      <div class="tkwin annual">
        <div class="secTitle">📊 年度決算 <small>${this.meta.runs}期目・自己ベスト${this.meta.bestRank}</small></div>
        <div class="rankBig rank${score.rank}">${score.rank === 'FAIL' ? '倒産…' : `ランク ${score.rank}`}</div>
        <div class="scoreRow">スコア <b>${fmt(score.score)}G</b>（連結利益 ${fmt(score.consolidatedProfitTotal)}G）</div>
        ${bonusRows}
        <div class="scoreRow">のれんP <b>+${score.norenEarned}P</b>（所持 ${this.meta.noren}P）</div>
        <div class="btnRow">
          <button id="againBtn">🐑 すぐもう一度</button>
          <button id="labBtn" class="primary">🔬 ラボで強化する</button>
        </div>
      </div>`;
    this.texel(RANK_COMMENTS[score.rank] ?? '');
    this.panel.querySelector('#againBtn')!.addEventListener('click', () => { unlockAudio(); SE.buy(); this.restartRun(); });
    this.panel.querySelector('#labBtn')!.addEventListener('click', () => { unlockAudio(); SE.decide(); this.labPhase(); });
  }

  // ── 🔬ラボ ──
  private labPhase(): void {
    const rows = LAB_NODES.map(node => {
      const lv = levelOf(this.meta, node.id);
      const cost = nextCost(this.meta, node);
      const btn = cost === null
        ? '<span class="labMax">MAX</span>'
        : `<button class="mini labBuy" data-id="${node.id}" ${this.meta.noren >= cost ? '' : 'disabled'}>${cost}Pで強化</button>`;
      // 「いま→次」を数字で見せる（例: 10頭 → 15頭）
      const nowNext = node.base != null && node.step != null
        ? (cost === null
          ? `いま${fmt(node.base + node.step * lv)}${node.unit}`
          : `いま${fmt(node.base + node.step * lv)}${node.unit} → <b>${fmt(node.base + node.step * (lv + 1))}${node.unit}</b>`)
        : node.effect;
      return `<div class="labRow">
        <span class="labName">${node.icon} ${node.name} <small>Lv${lv}/${node.costs.length}・${nowNext}</small></span>
        ${btn}
      </div>`;
    }).join('');
    this.panel.innerHTML = `
      <div class="tkwin lab">
        <div class="secTitle">🔬 ラボ <small>のれんP <b id="norenN">${this.meta.noren}</b>P</small></div>
        <div class="note">強化は<b>次のランから</b>ずっと有効。のれんPは決算のたびに貯まります</div>
        ${rows}
        <div class="btnRow"><button id="startRun" class="primary">🐑 このつよさで開業する ▶</button></div>
      </div>`;
    this.texel('のれん（信用）が力になります。どこを伸ばしましょう？');
    this.panel.querySelectorAll<HTMLButtonElement>('.labBuy').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudio();
        const node = LAB_NODES.find(n => n.id === btn.dataset.id)!;
        const cost = nextCost(this.meta, node);
        if (cost === null || this.meta.noren < cost) { SE.deny(); return; }
        this.meta.noren -= cost;
        this.meta.upgrades[node.id] = levelOf(this.meta, node.id) + 1;
        saveMeta(this.meta);
        SE.buy();
        this.pushFeed(`🔬 ${node.name}を強化（Lv${levelOf(this.meta, node.id)}・-${cost}P）`);
        this.labPhase();
      });
    });
    this.panel.querySelector('#startRun')!.addEventListener('click', () => { unlockAudio(); SE.fanfare(); this.restartRun(); });
  }

  private restartRun(): void {
    this.s = this.newRun();
    this.view.setState(this.s);
    this.beginPeriod();
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
