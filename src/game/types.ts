/** メェコノミー P1 経済エンジン — 型定義（実装版 v0.5.1）
 *  docs/04_types_v0.5.ts を実装都合で最小限調整：
 *  - StockLot に groupCost（グループ真実原価）を追加 ＝ 連結の未実現利益を正しく消すため
 *  - CompanyState は inbox/outbox を廃止し stock 一本化
 */

export type CompanyId = 'farm'|'meat'|'delica'|'wool'|'apparel'|'sales'|'logi'|'hq';

export type GoodsId =
  | 'sheep'|'wool'|'yarn'|'lambMeat'
  | 'genghis'|'lambSausage'|'lambCurry'|'lambChop'
  | 'muffler'|'sweater'|'blanket'|'coat';

export type MeatRecipeId = 'genghis'|'lambSausage'|'lambCurry'|'lambChop';
export type ApparelRecipeId = 'muffler'|'sweater'|'blanket'|'coat';
export type RecipeId = MeatRecipeId|ApparelRecipeId;

export type RouteId =
  | 'farm-meat'|'farm-wool'|'meat-delica'|'meat-sales'
  | 'delica-sales'|'wool-apparel'|'apparel-sales';

export type MarketLine = 'meatLine'|'apparelLine';

export type AccountId =
  | 'cash'|'inventory'|'livestock'
  | 'sales'|'cogs'|'processingCost'
  | 'feedCost'|'freight'|'fixedCost'
  | 'disposalLoss'|'bonusIncome';

export interface JournalLine {
  account: AccountId;
  side: 'debit'|'credit';
  amount: number;
  companyId: CompanyId;
  counterpartyId?: CompanyId; // 内部取引の相手（連結消去・ズレ探しの源泉）
  goodsId?: GoodsId;
}

export type SourceDocType =
  | 'BUY_LAMB'|'FEED'|'SHEAR'|'PROD'|'TRANSFER'|'SELL'
  | 'FREIGHT'|'FUEL'|'FIXED'|'DISPOSE'|'BONUS';

export interface JournalEntry {
  id: string;
  month: number; // 0-11（4月=0）
  sourceDoc: { type: SourceDocType; docId: string };
  lines: JournalLine[];
}

export interface StockLot {
  goodsId: GoodsId;
  qty: number;
  ageMonths: number;
  unitCost: number;   // 会社視点の原価（振替価格ベース）→ 各社P/L用
  groupCost: number;  // グループ真実原価 → 連結P/L用
}

export interface FlockState {
  ready: number;      // 毛刈り可能
  cd1: number;        // 刈って1ヶ月経過（来月ready）
  cd2: number;        // 刈った当月
  lambs: number;      // 子羊（来月readyに合流）
  capacity: number;   // 飼育枠
}

export interface CompanyState {
  id: CompanyId;
  capacity: number;
  stock: StockLot[];
}

export interface LogiState {
  trucks: number;
  capacityPerTruck: number;
}

export type PriceStance = 'aggressive'|'standard'|'discount';

export interface MonthlyOrders {
  lambsToBuy: number;
  sheepToShear: number;
  sheepToShip: number;
  slaughterQty: number;
  meatDirectRatio: number;   // 0-1
  spinQty: number;
  yarnDirectRatio: number;   // 0-1
  meatRecipes: Partial<Record<MeatRecipeId, number>>;
  apparelRecipes: Partial<Record<ApparelRecipeId, number>>;
  priceStance: PriceStance;
  truckAssignment: Record<RouteId, number>;
}

export interface BallparkState {
  teamPower: number;
  savings: number;
  standing: 1|2|3|4|5|6;
  brandFactor: number;
  phase: 'pennant'|'climax'|'offseason'|'champion';
  headerLabel: string;
  leagueChampion: boolean;
  japanChampion: boolean;
  newsLog: string[];
}

export type EventId =
  | 'feedSpike'|'lambCheap'|'bbqBoom'|'coldWave'|'warmWinter'
  | 'craftBoom'|'tvFeature'|'roadWork'|'fuelSpike'
  | 'shearFes'|'lineTrouble'|'ledgerGap'|'championSale'|'none';

export interface ActiveEvent { eventId: EventId; payload?: Record<string, number>; }

export type GapType = 'qty'|'price'|'duplicate'|'missing';

export interface LedgerRow {
  rowId: string; goodsId: GoodsId; qty: number; unitPrice: number; amount: number;
}

export interface LedgerGapPuzzle {
  id: string;
  sellerCompanyId: CompanyId;
  buyerCompanyId: CompanyId;
  sellerRows: LedgerRow[];
  buyerRows: LedgerRow[];
  gapType: GapType;
  answerRowId: string;
  timeLimitSec: number;
  solved?: boolean;
}

export interface CompanyPL { companyId: CompanyId; revenue: number; cost: number; profit: number; }

export interface MonthlyResult {
  month: number;
  companyPLs: CompanyPL[];
  simpleSum: number;
  eliminations: number;        // 表示用：simpleSum - consolidatedProfit
  consolidatedProfit: number;  // 外部売上 − グループ真実原価 − 外部経費
  lineRevenue: Record<MarketLine, number>;
  lineGroupProfit: Record<MarketLine, number>;
  cashIn: number;
  cashOut: number;
  cashEnd: number;
  disposedBoxes: number;
  sheepCount: number;
  soldBoxes: number;
  eventId: EventId;
  ballparkNews: string;
}

export type RunRank = 'C'|'B'|'A'|'S'|'SS'|'FAIL';

export interface RunResult {
  score: number;
  rank: RunRank;
  consolidatedProfitTotal: number;
  bonuses: { label: string; amount: number }[];
  norenEarned: number;
  seed: number;
  bankruptMonth?: number;
  failReason?: string;
}

export interface RunState {
  month: number;
  cash: number;
  journal: JournalEntry[];
  flock: FlockState;
  companies: Record<CompanyId, CompanyState>;
  logi: LogiState;
  ballpark: BallparkState;
  activeEvent: ActiveEvent;
  puzzle?: LedgerGapPuzzle;
  history: MonthlyResult[];
  disposedTotal: number;
  gapsFound: number;
  gapsTotal: number;
  bankrupt: boolean;
  rngState: number; // シード付き乱数の内部状態
}

/** ラボ強化のうちエンジンに効くもの（P1では引数で受ける） */
export interface EngineOptions {
  fridge?: boolean;          // 肉系鮮度+1
  shearCapacity?: number;    // 毛刈り班上限（既定6）
  freshLifeMeat?: number;    // 既定2
}
