/** P2 simボット4種（02_§11）＋共通ランナー
 *  - idle     : 毎月おまかせ（季節を見ない自動指示の想定品質）
 *  - balanced : 夏=肉・冬=ウールの季節運用（能力値から指示量を導出）
 *  - meatOnly : 全頭出荷・ウール未使用
 *  - woolOnly : 出荷ゼロ・毛だけ
 *  指示量は state の能力から導出するため、ラボ強化（能力アップ）を与えると
 *  そのままスループットが伸びる。
 */
import { initRun, simulateMonth } from '../src/game/simulateMonth.js';
import { scoreRun } from '../src/game/scoring.js';
import { judgePuzzle } from '../src/game/puzzle/ledgerGap.js';
import { totalSheep, stockQty } from '../src/game/pipeline/flock.js';
import { SHEAR_CAPACITY, PUZZLE_REWARD, TRUCK_LOAD, MEAT_PER_SHEEP, YARN_PER_WOOL } from '../src/game/constants.js';
import type {
  CompanyId, EngineOptions, GoodsId, MonthlyOrders, MonthlyResult, RouteId, RunResult, RunState,
} from '../src/game/types.js';

export type BotId = 'idle' | 'balanced' | 'meatOnly' | 'woolOnly';
export type Bot = (s: RunState, shearCap: number) => MonthlyOrders;

const NO_TRUCKS: Record<RouteId, number> = {
  'farm-meat': 0, 'farm-wool': 0, 'meat-delica': 0, 'meat-sales': 0,
  'delica-sales': 0, 'wool-apparel': 0, 'apparel-sales': 0,
};

/** 優先順リストへトラックを1台ずつ配る（総数はロジの台数） */
function assignTrucks(total: number, priority: RouteId[]): Record<RouteId, number> {
  const a = { ...NO_TRUCKS };
  for (let i = 0; i < total; i++) a[priority[i % priority.length]]++;
  return a;
}

// ── balanced：夏（7-9月）=肉、他=ウール ──
export const balancedBot: Bot = (s, shearCap) => {
  const m = s.month;
  const meatFocus = m >= 3 && m <= 5;
  const flockCap = s.flock.capacity;
  const delicaCap = s.companies.delica.capacity;
  const apparelCap = s.companies.apparel.capacity;

  if (meatFocus) {
    return {
      lambsToBuy: Math.round(flockCap * 0.3),
      sheepToShear: shearCap,
      sheepToShip: Math.round(flockCap * 0.3),
      slaughterQty: s.companies.meat.capacity,
      meatDirectRatio: 0.3,
      spinQty: 0,
      yarnDirectRatio: 0,
      meatRecipes: { genghis: Math.floor(delicaCap / 2), lambCurry: Math.floor(delicaCap / 4) },
      apparelRecipes: {},
      priceStance: 'standard',
      truckAssignment: assignTrucks(s.logi.trucks,
        ['farm-meat', 'meat-delica', 'delica-sales', 'meat-sales', 'delica-sales']),
    };
  }
  const sweater = m >= 6 ? Math.floor(apparelCap * 0.4) : 0;
  return {
    lambsToBuy: Math.round(flockCap * 0.2),
    sheepToShear: shearCap,
    sheepToShip: 0,
    slaughterQty: 0,
    meatDirectRatio: 0,
    spinQty: s.companies.wool.capacity,
    yarnDirectRatio: 0.1,
    meatRecipes: {},
    apparelRecipes: m >= 6
      ? { sweater, muffler: Math.max(0, apparelCap - sweater - 1) }
      : { muffler: Math.max(1, apparelCap - 2) },
    priceStance: 'standard',
    truckAssignment: assignTrucks(s.logi.trucks,
      ['farm-wool', 'wool-apparel', 'apparel-sales', 'wool-apparel', 'farm-wool']),
  };
};

// ── idle：毎月おまかせ ──
// トラック3台で完結する堅実運用＝ウールチェーンを毎月固定で回す。
// ただし季節を見ない・マフラー一辺倒・群れは満杯まで買う、という「おまかせの雑さ」を持つ
export const idleBot: Bot = (s, shearCap) => {
  const crowded = totalSheep(s.flock) >= s.flock.capacity;
  return {
    lambsToBuy: Math.max(0, s.flock.capacity - totalSheep(s.flock)),
    sheepToShear: Math.min(s.flock.ready, shearCap),
    sheepToShip: crowded ? 2 : 0,
    slaughterQty: 0,
    meatDirectRatio: 0,
    spinQty: s.companies.wool.capacity,
    yarnDirectRatio: 0.2,
    meatRecipes: {},
    apparelRecipes: { muffler: s.companies.apparel.capacity },
    priceStance: 'standard',
    truckAssignment: assignTrucks(s.logi.trucks,
      ['farm-wool', 'wool-apparel', 'apparel-sales', 'wool-apparel', 'farm-wool']),
  };
};

// ── meatOnly：全頭出荷・ウール未使用 ──
// 直販全振り＝トラック3台で回る唯一の全頭出荷運用。回転は速いが
// 需要に弾かれた月はラム肉が2ヶ月で腐る（現金は速い・リスクは高い）
export const meatOnlyBot: Bot = (s) => {
  const meatCap = s.companies.meat.capacity;
  return {
    lambsToBuy: meatCap,
    sheepToShear: 0,
    sheepToShip: meatCap,
    slaughterQty: meatCap,
    meatDirectRatio: 1,
    spinQty: 0,
    yarnDirectRatio: 0,
    meatRecipes: {},
    apparelRecipes: {},
    priceStance: 'standard',
    truckAssignment: assignTrucks(s.logi.trucks,
      ['farm-meat', 'meat-sales', 'meat-sales', 'farm-meat', 'meat-sales']),
  };
};

// ── woolOnly：出荷ゼロ・毛だけ ──
export const woolOnlyBot: Bot = (s, shearCap) => {
  const apparelCap = s.companies.apparel.capacity;
  const sweater = s.month >= 6 ? Math.floor(apparelCap * 0.4) : 0;
  return {
    lambsToBuy: Math.max(0, s.flock.capacity - totalSheep(s.flock)),
    sheepToShear: shearCap,
    sheepToShip: 0,
    slaughterQty: 0,
    meatDirectRatio: 0,
    spinQty: s.companies.wool.capacity,
    yarnDirectRatio: 0.1,
    meatRecipes: {},
    apparelRecipes: { sweater, muffler: Math.max(1, apparelCap - sweater - 1) },
    priceStance: 'standard',
    truckAssignment: assignTrucks(s.logi.trucks,
      ['farm-wool', 'wool-apparel', 'apparel-sales', 'apparel-sales', 'farm-wool']),
  };
};

export const BOTS: Record<BotId, Bot> = {
  idle: idleBot, balanced: balancedBot, meatOnly: meatOnlyBot, woolOnly: woolOnlyBot,
};

// ── ラボ強化（sim用）──
// 「強化半分」＝26ノード中、能力系を各1段＋トラック2段＋開始資金I相当（02_§6）
export interface SimUpgrades {
  flockCapacity?: number;   // +5/段
  shearCapacity?: number;   // +3/段（EngineOptions経由）
  meatCapacity?: number;    // +3/段
  delicaCapacity?: number;  // +4/段
  woolCapacity?: number;    // +4/段
  apparelCapacity?: number; // +3/段
  salesCapacity?: number;   // +15/段
  trucks?: number;          // +1/段
  extraCash?: number;       // +5,000/段
}

export const HALF_UPGRADES: SimUpgrades = {
  flockCapacity: 5, shearCapacity: 3, meatCapacity: 3, delicaCapacity: 4,
  woolCapacity: 4, apparelCapacity: 3, salesCapacity: 15, trucks: 2, extraCash: 5_000,
};

function applyUpgrades(s: RunState, up: SimUpgrades): { opts: EngineOptions; shearCap: number } {
  s.flock.capacity += up.flockCapacity ?? 0;
  s.companies.farm.capacity = s.flock.capacity;
  s.companies.meat.capacity += up.meatCapacity ?? 0;
  s.companies.delica.capacity += up.delicaCapacity ?? 0;
  s.companies.wool.capacity += up.woolCapacity ?? 0;
  s.companies.apparel.capacity += up.apparelCapacity ?? 0;
  s.companies.sales.capacity += up.salesCapacity ?? 0;
  s.logi.trucks += up.trucks ?? 0;
  s.cash += up.extraCash ?? 0;
  const shearCap = SHEAR_CAPACITY + (up.shearCapacity ?? 0);
  return { opts: { shearCapacity: shearCap }, shearCap };
}

// ── 共通ランナー（ズレ探しは自動正解＝平均的プレイヤー想定） ──
export interface BotRun {
  seed: number;
  score: RunResult;
  history: MonthlyResult[];
}

export function runBot(seed: number, bot: Bot, upgrades: SimUpgrades = {}): BotRun {
  let s = initRun(seed);
  const { opts, shearCap } = applyUpgrades(s, upgrades);
  for (let i = 0; i < 12 && !s.bankrupt; i++) {
    s = simulateMonth(s, bot(s, shearCap), opts).next;
    if (s.puzzle && judgePuzzle(s.puzzle, s.puzzle.answerRowId)) {
      s.gapsFound++;
      s.cash += PUZZLE_REWARD;
    }
  }
  return { seed, score: scoreRun(s, seed), history: s.history };
}
