/**
 * 04_types.ts — 『メェコノミー』型定義 v0.5
 * 羊二股パイプライン版。実装時は src/game/types.ts に配置。
 * 01/02/03 の v0.5 と1対1対応。
 */

// ──────────────────────────────────
// 会社・モノ
// ──────────────────────────────────
export type CompanyId =
  | 'farm'     // ファーム（飼育・毛刈り・出荷判断）
  | 'meat'     // ミート（羊→ラム肉）
  | 'delica'   // デリカ（肉加工）
  | 'wool'     // ウール（毛→糸）
  | 'apparel'  // アパレル（糸→服）
  | 'sales'    // セールス（販売）
  | 'logi'     // ロジ（物流）
  | 'hq';      // 管理（固定費の受け皿・プレイヤー視点）

export type GoodsId =
  // 生体・素材
  | 'lamb' | 'sheep' | 'wool' | 'yarn' | 'lambMeat'
  // 肉加工品
  | 'genghis' | 'lambSausage' | 'lambCurry' | 'lambChop'
  // アパレル
  | 'muffler' | 'sweater' | 'blanket' | 'coat'
  | 'mystery';

export type MeatRecipeId = 'genghis' | 'lambSausage' | 'lambCurry' | 'lambChop';
export type ApparelRecipeId = 'muffler' | 'sweater' | 'blanket' | 'coat' | 'mystery';
export type RecipeId = MeatRecipeId | ApparelRecipeId;

/** 輸送区間（7区間） */
export type RouteId =
  | 'farm-meat' | 'farm-wool'
  | 'meat-delica' | 'meat-sales'
  | 'delica-sales'
  | 'wool-apparel' | 'apparel-sales';

/** 需要は肉系とアパレル系で別枠判定 */
export type MarketLine = 'meatLine' | 'apparelLine';

// ──────────────────────────────────
// 羊の群れ（個体管理せずバケットで持つ）
// ──────────────────────────────────
export interface FlockState {
  readyToShear: number;  // 毛刈り可能
  cooldown1: number;     // 刈って1ヶ月目（月末に cooldown2 へ…ではなく ready へ近づく側に注意）
  cooldown2: number;     // 刈った当月（翌月 cooldown1 → 翌々月 ready）
  capacity: number;      // 飼育枠（ラボ強化反映後）
}
// 月次シフト：ready += cooldown1; cooldown1 = cooldown2; cooldown2 = 今月刈った頭数
// 総頭数 = ready + cooldown1 + cooldown2（エサ代はこの合計に課金）

// ──────────────────────────────────
// 内部会計（利益センタ付き仕訳が唯一の真実）
// ──────────────────────────────────
export type AccountId =
  | 'cash' | 'inventory' | 'livestock'      // livestock: 羊の帳簿価額
  | 'sales' | 'cogs' | 'processingCost'
  | 'feedCost' | 'freight' | 'fixedCost'
  | 'disposalLoss' | 'bonusIncome';

export interface JournalLine {
  account: AccountId;
  side: 'debit' | 'credit';
  amount: number;
  companyId: CompanyId;
  counterpartyId?: CompanyId;  // 内部取引の相手（連結消去・ズレ探しの源泉）
  goodsId?: GoodsId;
}

export interface JournalEntry {
  id: string;
  month: number; // 0-11（4月=0）
  sourceDoc: {
    type: 'BUY_LAMB' | 'FEED' | 'SHEAR' | 'SHIP_SHEEP' | 'PROD'
        | 'TRANSFER' | 'SELL' | 'FREIGHT' | 'FIXED'
        | 'DISPOSE' | 'EVENT' | 'BONUS';
    docId: string;
  };
  lines: JournalLine[]; // 貸借一致をバリデーション必須
}

// ──────────────────────────────────
// 在庫・会社
// ──────────────────────────────────
export interface StockLot {
  goodsId: GoodsId;
  qty: number;
  ageMonths: number;   // 肉系のみ廃棄判定（羊毛/糸/服/カレーは無期限）
  unitCost: number;    // 移動平均
}

export interface CompanyState {
  id: CompanyId;
  capacity: number;    // 月間処理上限
  inbox: StockLot[];
  outbox: StockLot[];
}

export interface LogiState {
  trucks: number;
  capacityPerTruck: number;
  assignment: Record<RouteId, number>;
  expressUsedThisMonth: boolean;
}

// ──────────────────────────────────
// 毎月の指示
// ──────────────────────────────────
export type PriceStance = 'aggressive' | 'standard' | 'discount';

export interface MonthlyOrders {
  lambsToBuy: number;      // 子羊導入
  sheepToShear: number;    // 毛刈り頭数（ready上限・毛刈り班上限まで）
  sheepToShip: number;     // 出荷（肉行き）頭数
  slaughterQty: number;    // ミート：と畜数
  meatDirectRatio: number; // ラム肉の直販比率 0-1（残りはデリカへ）
  spinQty: number;         // ウール：紡績数（羊毛袋）
  yarnDirectRatio: number; // 糸の直販比率 0-1（残りはアパレルへ）
  meatRecipes: Partial<Record<MeatRecipeId, number>>;
  apparelRecipes: Partial<Record<ApparelRecipeId, number>>;
  priceStance: PriceStance;
  truckAssignment: Record<RouteId, number>;
}

// ──────────────────────────────────
// メェーズ（ヘッダー常時表示）
// ──────────────────────────────────
export interface BallparkState {
  teamPower: 50 | 60 | 70;
  savings: number;                   // 貯金（ヘッダー「3位(+2)」の+2）
  standing: 1 | 2 | 3 | 4 | 5 | 6;
  brandFactor: number;               // 0.92-1.20
  phase: 'pennant' | 'climax' | 'offseason' | 'champion';
  headerLabel: string;               // 例:「3位(+2)」「⛺キャンプ中」「🎉日本一！」
  leagueChampion: boolean;
  japanChampion: boolean;
  newsLog: string[];
}

// ──────────────────────────────────
// イベント・ズレ探し
// ──────────────────────────────────
export type EventId =
  | 'feedSpike' | 'lambCheap' | 'bbqBoom' | 'coldWave' | 'warmWinter'
  | 'craftBoom' | 'tvFeature' | 'roadWork' | 'fuelSpike'
  | 'shearFes' | 'lineTrouble' | 'ledgerGap' | 'championSale';

export interface ActiveEvent {
  eventId: EventId;
  payload?: Record<string, number>;
}

export type GapType = 'qty' | 'price' | 'duplicate' | 'missing';

export interface LedgerRow {
  rowId: string;
  goodsId: GoodsId;
  qty: number;
  unitPrice: number;
  amount: number;
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
  solveTimeSec?: number;
}

// ──────────────────────────────────
// リザルト・スコア
// ──────────────────────────────────
export interface CompanyPL {
  companyId: CompanyId;
  revenue: number;
  cost: number;
  profit: number;
}

export interface MonthlyResult {
  month: number;
  companyPLs: CompanyPL[];
  simpleSum: number;
  eliminations: number;
  consolidatedProfit: number;
  lineProfit: Record<MarketLine, number>; // 両ライン黒字ボーナス判定用
  cashEnd: number;
  disposedBoxes: number;
  sheepCount: number;
  mvpCompany: CompanyId;
  texelComment: string;
}

export type RunRank = 'C' | 'B' | 'A' | 'S' | 'SS' | 'FAIL';

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

// ──────────────────────────────────
// ラン状態
// ──────────────────────────────────
export interface RunState {
  month: number; // 0-11
  phase: 'orders' | 'flow' | 'result' | 'puzzle' | 'yearEnd';
  cash: number;
  journal: JournalEntry[];
  flock: FlockState;
  companies: Record<CompanyId, CompanyState>;
  logi: LogiState;
  currentOrders: MonthlyOrders;
  lastOrders?: MonthlyOrders;
  ballpark: BallparkState;
  activeEvent?: ActiveEvent;
  puzzle?: LedgerGapPuzzle;
  history: MonthlyResult[];
  disposedTotal: number;
  gapsFound: number;
  gapsTotal: number;
  rngSeed: number;
}

// ──────────────────────────────────
// メタ進行
// ──────────────────────────────────
export type UpgradeId =
  // ロジ
  | 'truck1' | 'truck2' | 'truck3' | 'truck4' | 'truck5'
  | 'express' | 'autoAssign'
  // 能力
  | 'flockCap1' | 'flockCap2' | 'flockCap3'
  | 'shearCap1' | 'shearCap2'
  | 'meatCap1' | 'meatCap2' | 'meatCap3'
  | 'delicaCap1' | 'delicaCap2' | 'delicaCap3'
  | 'woolCap1' | 'woolCap2'
  | 'apparelCap1' | 'apparelCap2' | 'apparelCap3'
  | 'salesCap1' | 'salesCap2'
  | 'fridge' | 'autoPilot'
  // レシピ
  | 'recipeLambSausage' | 'recipeLambCurry' | 'recipeLambChop'
  | 'recipeSweater' | 'recipeBlanket' | 'recipeCoat'
  // 球団
  | 'teamBoost1' | 'teamBoost2' | 'stadiumContract'
  // テクセル・資金
  | 'jamForecast' | 'gapBuddy'
  | 'startCash1' | 'startCash2' | 'startCash3';

export interface MetaState {
  schemaVersion: 1;
  noren: number;
  upgrades: UpgradeId[];
  achievements: string[];
  zukanGoods: GoodsId[];
  zukanSap: string[];
  bestScore: number;
  bestRank: RunRank;
  totalRuns: number;
  settings: {
    seVolume: number;
    flowSpeed: 1 | 1.5 | 2;
    showExplanations: boolean;
  };
}

// ──────────────────────────────────
// アクション
// ──────────────────────────────────
export type GameAction =
  | { type: 'SET_ORDERS'; orders: Partial<MonthlyOrders> }
  | { type: 'COPY_LAST_ORDERS' }
  | { type: 'CONFIRM_ORDERS' }
  | { type: 'FLOW_DONE' }
  | { type: 'ANSWER_PUZZLE'; rowId: string; elapsedSec: number }
  | { type: 'PUZZLE_TIMEOUT' }
  | { type: 'NEXT_MONTH' }
  | { type: 'END_RUN' };

export type MetaAction =
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'UNLOCK_ACHIEVEMENT'; id: string }
  | { type: 'ADD_ZUKAN'; kind: 'goods' | 'sap'; id: string }
  | { type: 'APPLY_RUN_RESULT'; result: RunResult };

// ──────────────────────────────────
// 主要関数シグネチャ
// ──────────────────────────────────
export type SimulateMonthFn = (
  state: RunState,
  meta: MetaState
) => { next: RunState; result: MonthlyResult };

export type ConsolidateFn = (
  entries: JournalEntry[],
  month?: number
) => {
  companyPLs: CompanyPL[];
  simpleSum: number;
  eliminations: number;
  consolidatedProfit: number;
};

export type ShiftFlockFn = (
  flock: FlockState,
  shearedThisMonth: number,
  shippedThisMonth: number,
  lambsMatured: number
) => FlockState;
