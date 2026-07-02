/** CUIランナー — `npm run cli [seed]`
 *  季節対応の素朴なボット（balanced相当）で12ヶ月回し、月次テーブルと決算を表示 */
import { initRun, simulateMonth } from './game/simulateMonth.js';
import { scoreRun } from './game/scoring.js';
import { judgePuzzle } from './game/puzzle/ledgerGap.js';
import type { MonthlyOrders, RunState } from './game/types.js';

function seasonalOrders(s: RunState): MonthlyOrders {
  const m = s.month;
  const meatFocus = m >= 3 && m <= 5; // 7-9月：肉ライン集中（BBQ最盛期）
  // 羊毛は腐らないため、肉集中期はファームに貯めて冬に一気に紡ぐ
  return meatFocus
    ? {
        lambsToBuy: 3, sheepToShear: 6, sheepToShip: 3, slaughterQty: 6,
        meatDirectRatio: 0.3, spinQty: 0, yarnDirectRatio: 0,
        meatRecipes: { genghis: 3, lambCurry: 1 }, apparelRecipes: {},
        priceStance: 'standard',
        truckAssignment: {
          'farm-meat': 1, 'farm-wool': 0, 'meat-delica': 1, 'meat-sales': 0,
          'delica-sales': 1, 'wool-apparel': 0, 'apparel-sales': 0,
        },
      }
    : {
        lambsToBuy: 2, sheepToShear: 6, sheepToShip: 0, slaughterQty: 0,
        meatDirectRatio: 0, spinQty: 8, yarnDirectRatio: 0.1,
        meatRecipes: {},
        apparelRecipes: m >= 6 ? { sweater: 2, muffler: 2 } : { muffler: 3 },
        priceStance: 'standard',
        truckAssignment: {
          'farm-meat': 0, 'farm-wool': 1, 'meat-delica': 0, 'meat-sales': 0,
          'delica-sales': 0, 'wool-apparel': 1, 'apparel-sales': 1,
        },
      };
}

const seed = Number(process.argv[2] ?? 20260613);
let s = initRun(seed);
const MONTH_JP = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];

console.log(`\n🐑 メェコノミー P1 CUIラン（seed=${seed}）\n`);
console.log('月    | 単純合計 | 消去    | れんけつ | 現金    | 羊 | 売 | 廃 | イベント/ニュース');
console.log('------+----------+---------+----------+---------+----+----+----+------------------');

for (let i = 0; i < 12 && !s.bankrupt; i++) {
  const orders = seasonalOrders(s);
  const { next, result } = simulateMonth(s, orders);
  s = next;
  if (s.puzzle) {
    // ボットは50%の確率で正解する体で
    const guess = Math.random() < 0.5 ? s.puzzle.answerRowId : 'R1';
    if (judgePuzzle(s.puzzle, guess)) { s.gapsFound++; s.cash += 1500; }
  }
  const r = result;
  console.log(
    `${MONTH_JP[r.month].padEnd(4)} | ${String(r.simpleSum).padStart(8)} | ${String(r.eliminations).padStart(7)} | ${String(r.consolidatedProfit).padStart(8)} | ${String(r.cashEnd).padStart(7)} | ${String(r.sheepCount).padStart(2)} | ${String(r.soldBoxes).padStart(2)} | ${String(r.disposedBoxes).padStart(2)} | ${r.eventId !== 'none' ? r.eventId : ''} ${r.ballparkNews.slice(0, 28)}`,
  );
}

const result = scoreRun(s, seed);
console.log('\n════ 年度けっさん ════');
console.log(`連結利益合計: ${result.consolidatedProfitTotal.toLocaleString()}G`);
for (const b of result.bonuses) console.log(`ボーナス: ${b.label} +${b.amount.toLocaleString()}`);
console.log(`スコア: ${result.score.toLocaleString()} → ランク ${result.rank}`);
console.log(`のれんP獲得: ${result.norenEarned}P`);
if (result.failReason) console.log(`敗因: ${result.failReason}`);
console.log('');
