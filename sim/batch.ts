/** P2バランス検証バッチ：4ボット×Nシード（既定1000）＋balanced強化半分
 *  使い方: npx tsx sim/batch.ts [N]
 *  02_§11の目標を✓/✗で判定して表示する。
 */
import { HALF_UPGRADES } from './bots.js';
import { collectStats, type BotStats } from './stats.js';

const N = Number(process.argv[2]) || 1000;

const fmt = (v: number) => Math.round(v).toLocaleString('ja-JP');
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function show(label: string, s: BotStats) {
  console.log(`\n■ ${label}`);
  console.log(`  黒字率 ${pct(s.blackRate)} ／ 平均連結利益 ${fmt(s.avgProfit)}G（σ ${fmt(s.profitStd)}）／ 破産率 ${pct(s.bankruptRate)}`);
  console.log(`  ランク分布 ${JSON.stringify(s.ranks)}（最頻 ${s.modeRank}）`);
  console.log(`  月平均連結利益: 夏(7-9月) ${fmt(s.avgSummerProfit)}G ／ 夏以外 ${fmt(s.avgOffSummerProfit)}G`);
}

console.log(`P2バランス検証 × 各${N}ラン`);
const idle = collectStats(N, 'idle');
const balanced = collectStats(N, 'balanced');
const meatOnly = collectStats(N, 'meatOnly');
const woolOnly = collectStats(N, 'woolOnly');
const balancedHalf = collectStats(N, 'balanced', HALF_UPGRADES);
show('idle（毎月おまかせ）', idle);
show('balanced（季節運用）', balanced);
show('meatOnly（全頭出荷）', meatOnly);
show('woolOnly（毛だけ）', woolOnly);
show('balanced＋強化半分', balancedHalf);

console.log('\n── 02_§11 目標判定 ──');
const checks: [string, boolean][] = [
  [`idle黒字率60〜75%（実測 ${pct(idle.blackRate)}）`,
    idle.blackRate >= 0.60 && idle.blackRate <= 0.75],
  [`balancedが最良（平均利益で全ボットを上回る）`,
    balanced.avgProfit > idle.avgProfit
    && balanced.avgProfit > meatOnly.avgProfit
    && balanced.avgProfit > woolOnly.avgProfit],
  [`balanced初期はBランク中心（最頻 ${balanced.modeRank}）`, balanced.modeRank === 'B'],
  [`balanced強化半分でAランク中心（最頻 ${balancedHalf.modeRank}）`, balancedHalf.modeRank === 'A'],
  [`meatOnlyは夏強（夏の月平均 ${fmt(meatOnly.avgSummerProfit)}G > 夏以外 ${fmt(meatOnly.avgOffSummerProfit)}G）`,
    meatOnly.avgSummerProfit > meatOnly.avgOffSummerProfit],
  [`meatOnlyは年間で劣後（平均 ${fmt(meatOnly.avgProfit)}G < balanced ${fmt(balanced.avgProfit)}G）`,
    meatOnly.avgProfit < balanced.avgProfit],
  [`woolOnlyは低リターン（平均 ${fmt(woolOnly.avgProfit)}G < balanced）`,
    woolOnly.avgProfit < balanced.avgProfit],
  [`woolOnlyは低リスク（黒字率 ${pct(woolOnly.blackRate)} ≧ 95% かつ 利益σ ${fmt(woolOnly.profitStd)} < meatOnly ${fmt(meatOnly.profitStd)}）`,
    woolOnly.blackRate >= 0.95
    && woolOnly.blackRate >= idle.blackRate
    && woolOnly.profitStd < meatOnly.profitStd],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${label}`);
  if (!pass) ok = false;
}
console.log(ok ? '\nすべての目標を満たしています。' : '\n未達の目標があります。調整してください。');
process.exitCode = ok ? 0 : 1;
