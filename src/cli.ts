/** CUIランナー — `npm run cli [seed]`
 *  季節対応の素朴なボット（balanced相当）で12ヶ月回し、月次テーブルと決算を表示 */
import { runBalancedScenario } from './game/runScenario.js';

const seed = Number(process.argv[2] ?? 20260613);
const report = runBalancedScenario(seed);

console.log(`\n🐑 メェコノミー P1 CUIラン（seed=${seed}）\n`);
console.log('月    | 単純合計 | 消去    | れんけつ | 現金    | 羊 | 売 | 廃 | イベント/ニュース');
console.log('------+----------+---------+----------+---------+----+----+----+------------------');

for (const step of report.steps) {
  const r = step.result;
  console.log(
    `${step.monthLabel.padEnd(4)} | ${String(r.simpleSum).padStart(8)} | ${String(r.eliminations).padStart(7)} | ${String(r.consolidatedProfit).padStart(8)} | ${String(r.cashEnd).padStart(7)} | ${String(r.sheepCount).padStart(2)} | ${String(r.soldBoxes).padStart(2)} | ${String(r.disposedBoxes).padStart(2)} | ${r.eventId !== 'none' ? r.eventId : ''} ${r.ballparkNews.slice(0, 28)}`,
  );
}

console.log('\n════ 年度けっさん ════');
console.log(`連結利益合計: ${report.score.consolidatedProfitTotal.toLocaleString()}G`);
for (const b of report.score.bonuses) console.log(`ボーナス: ${b.label} +${b.amount.toLocaleString()}`);
console.log(`スコア: ${report.score.score.toLocaleString()} → ランク ${report.score.rank}`);
console.log(`のれんP獲得: ${report.score.norenEarned}P`);
if (report.score.failReason) console.log(`敗因: ${report.score.failReason}`);
console.log('');
