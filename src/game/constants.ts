/** メェコノミー — バランス定数（docs/02_ゲームデータ定義書_v0.5 を正とする） */
import type {
  CompanyId, GoodsId, RecipeId, MeatRecipeId, ApparelRecipeId,
  RouteId, MarketLine, PriceStance, EventId,
} from './types.js';

export const RUN_MONTHS = 12;
export const INITIAL_CASH = 30_000;
export const FIXED_COST_MONTHLY = 3_500; // 調整履歴#2: 6,000→3,500（初期スループットに対し過重）

// ── 羊 ──
export const LAMB_PRICE = 800;
export const FEED_PER_SHEEP = 200;
export const SHEAR_FEE = 50;
export const SHEAR_CAPACITY = 6;      // 毛刈り班/月
export const FLOCK_CAPACITY = 10;     // 飼育枠
export const SHEEP_BOOK_VALUE = 800;  // 帳簿価額（livestock）

// ── 内部振替価格 ──
export const TRANSFER_PRICE: Partial<Record<GoodsId, number>> = {
  sheep: 1_500,
  wool: 400,
  lambMeat: 1_000,
  yarn: 550,
};
/** 完成品（加工品・服）のセールスへの振替：市場価格×この係数 */
export const SALES_TRANSFER_RATIO = 0.8;

// ── 加工 ──
export const SLAUGHTER_FEE_PER_SHEEP = 300;  // 羊1頭→ラム肉2箱
export const MEAT_PER_SHEEP = 2;
export const SPIN_FEE_PER_YARN = 150;        // 羊毛1袋→糸2巻
export const YARN_PER_WOOL = 2;

export interface RecipeDef {
  inputGoods: GoodsId; inputQty: number; fee: number; marketPrice: number; line: MarketLine;
}
export const RECIPES: Record<RecipeId, RecipeDef> = {
  genghis:     { inputGoods: 'lambMeat', inputQty: 2, fee: 300, marketPrice: 3_600, line: 'meatLine' },
  lambSausage: { inputGoods: 'lambMeat', inputQty: 2, fee: 250, marketPrice: 3_300, line: 'meatLine' },
  lambCurry:   { inputGoods: 'lambMeat', inputQty: 1, fee: 350, marketPrice: 2_200, line: 'meatLine' },
  lambChop:    { inputGoods: 'lambMeat', inputQty: 3, fee: 600, marketPrice: 6_800, line: 'meatLine' },
  muffler:     { inputGoods: 'yarn', inputQty: 2, fee: 200, marketPrice: 2_600, line: 'apparelLine' },
  sweater:     { inputGoods: 'yarn', inputQty: 3, fee: 300, marketPrice: 4_200, line: 'apparelLine' },
  blanket:     { inputGoods: 'yarn', inputQty: 4, fee: 400, marketPrice: 5_800, line: 'apparelLine' },
  coat:        { inputGoods: 'yarn', inputQty: 6, fee: 800, marketPrice: 11_000, line: 'apparelLine' },
};
export const MEAT_RECIPES: MeatRecipeId[] = ['genghis','lambSausage','lambCurry','lambChop'];
export const APPAREL_RECIPES: ApparelRecipeId[] = ['muffler','sweater','blanket','coat'];

// ── 直販市場価格 ──
export const DIRECT_MARKET_PRICE: Partial<Record<GoodsId, number>> = {
  lambMeat: 1_400,
  yarn: 750,
};

// ── 商品→ライン ──
export const GOODS_LINE: Partial<Record<GoodsId, MarketLine>> = {
  lambMeat: 'meatLine', genghis: 'meatLine', lambSausage: 'meatLine',
  lambCurry: 'meatLine', lambChop: 'meatLine',
  yarn: 'apparelLine', muffler: 'apparelLine', sweater: 'apparelLine',
  blanket: 'apparelLine', coat: 'apparelLine',
};

// ── 鮮度：肉系のみ廃棄（レトルトカレーは無期限） ──
export const PERISHABLE: GoodsId[] = ['lambMeat','genghis','lambSausage','lambChop'];
export const FRESH_LIFE_MEAT = 2; // ヶ月（冷蔵庫強化で+1）

// ── 物流 ──
export const ROUTES: RouteId[] = [
  'farm-meat','farm-wool','meat-delica','meat-sales',
  'delica-sales','wool-apparel','apparel-sales',
];
export const TRUCKS_INITIAL = 3;
export const TRUCK_LOAD = 8;          // 箱/台/区間（調整履歴#2: 6→8）
export const FREIGHT_PER_BOX = 120;   // 荷主→ロジ（内部売上）
export const FUEL_PER_BOX = 50;       // ロジ→外部（燃料）

// ── 会社能力（初期） ──
export const COMPANY_CAPACITY: Record<CompanyId, number> = {
  farm: FLOCK_CAPACITY, meat: 6, delica: 6, wool: 8, apparel: 5, sales: 35, logi: 0, hq: 0,
};

// ── 需要 ──
export const BASE_DEMAND: Record<MarketLine, number> = { meatLine: 40, apparelLine: 30 };
export const SEASON_FACTOR = (month: number): Record<MarketLine, number> => {
  // month: 0=4月 … 11=3月
  if (month <= 2)  return { meatLine: 1.0, apparelLine: 0.8 };  // 4-6月
  if (month <= 5)  return { meatLine: 1.4, apparelLine: 0.5 };  // 7-9月
  if (month <= 8)  return { meatLine: 1.1, apparelLine: 1.6 };  // 10-12月
  return { meatLine: 0.9, apparelLine: 1.2 };                   // 1-3月
};
export const STANCE: Record<PriceStance, { price: number; demand: number }> = {
  aggressive: { price: 1.15, demand: 0.8 },
  standard:   { price: 1.0,  demand: 1.0 },
  discount:   { price: 0.9,  demand: 1.15 },
};

// ── メェーズ ──
export const BRAND_BY_STANDING: Record<number, number> = { 1: 1.2, 2: 1.1, 3: 1.1, 4: 1.0, 5: 0.92, 6: 0.92 };
export const CHAMPION_RATE: Record<number, number> = { 50: 0.15, 60: 0.30, 70: 0.50 };

// ── イベント（抽選テーブル） ──
export interface EventDef { weight: number; months?: number[] } // months: 発火可能月（0-11）
export const EVENT_TABLE: Partial<Record<EventId, EventDef>> = {
  feedSpike:  { weight: 10 },
  lambCheap:  { weight: 10 },
  bbqBoom:    { weight: 8, months: [3,4,5] },        // 7-9月
  coldWave:   { weight: 8, months: [7,8,9,10] },     // 11-2月
  warmWinter: { weight: 6, months: [7,8,9,10] },
  craftBoom:  { weight: 8 },
  tvFeature:  { weight: 10 },
  roadWork:   { weight: 8 },
  fuelSpike:  { weight: 8 },
  shearFes:   { weight: 6 },
  lineTrouble:{ weight: 6 },
};
export const LEDGER_GAP_WINDOWS: number[][] = [[2,3,4],[9,10]]; // 6-8月窓・1-2月窓で各1回

// ── ズレ探し ──
export const PUZZLE_TIME_LIMIT = 60;
export const PUZZLE_REWARD = 1_500;

// ── スコア ──
export const RANK_THRESHOLDS: [number, string][] = [
  [150_000,'SS'],[90_000,'S'],[50_000,'A'],[20_000,'B'],[1,'C'],
];
export const BONUS = {
  noDisposal: 3_000,
  allGapsFound: 2_000,
  leagueChampion: 3_000,
  japanChampion: 5_000,
  bothLinesProfit: 3_000,
  cashNeverBelow10k: 1_000,
  allMonthsProfit: 3_000,
};
