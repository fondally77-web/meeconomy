/** 簡易バッチ検証：balancedボット×200シードのランク分布 */
import { initRun, simulateMonth } from '../src/game/simulateMonth.js';
import { scoreRun } from '../src/game/scoring.js';
import type { MonthlyOrders, RunState } from '../src/game/types.js';

function orders(s: RunState): MonthlyOrders {
  const m = s.month;
  const meatFocus = m >= 3 && m <= 5;
  return meatFocus
    ? { lambsToBuy: 3, sheepToShear: 6, sheepToShip: 3, slaughterQty: 6,
        meatDirectRatio: 0.3, spinQty: 0, yarnDirectRatio: 0,
        meatRecipes: { genghis: 3, lambCurry: 1 }, apparelRecipes: {}, priceStance: 'standard',
        truckAssignment: {'farm-meat':1,'farm-wool':0,'meat-delica':1,'meat-sales':0,'delica-sales':1,'wool-apparel':0,'apparel-sales':0} }
    : { lambsToBuy: 2, sheepToShear: 6, sheepToShip: 0, slaughterQty: 0,
        meatDirectRatio: 0, spinQty: 8, yarnDirectRatio: 0.1,
        meatRecipes: {}, apparelRecipes: m >= 6 ? { sweater: 2, muffler: 2 } : { muffler: 3 }, priceStance: 'standard',
        truckAssignment: {'farm-meat':0,'farm-wool':1,'meat-delica':0,'meat-sales':0,'delica-sales':0,'wool-apparel':1,'apparel-sales':1} };
}

const ranks: Record<string, number> = {};
let profitSum = 0, black = 0;
const N = 200;
for (let seed = 1; seed <= N; seed++) {
  let s = initRun(seed);
  for (let i = 0; i < 12 && !s.bankrupt; i++) s = simulateMonth(s, orders(s)).next;
  const r = scoreRun(s, seed);
  ranks[r.rank] = (ranks[r.rank] ?? 0) + 1;
  profitSum += r.consolidatedProfitTotal;
  if (r.consolidatedProfitTotal > 0) black++;
}
console.log(`balancedボット × ${N}ラン`);
console.log('ランク分布:', ranks);
console.log(`黒字率: ${(black/N*100).toFixed(1)}%  平均連結利益: ${Math.round(profitSum/N).toLocaleString()}G`);
