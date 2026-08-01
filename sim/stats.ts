/** ボット×Nシードの集計（sim/batch.ts と tests/balance.test.ts で共用） */
import { BOTS, runBot, type BotId, type SimUpgrades } from './bots.js';

export interface BotStats {
  blackRate: number;
  avgProfit: number;
  profitStd: number;         // 年間連結利益の標準偏差（リスク指標）
  ranks: Record<string, number>;
  modeRank: string;
  avgSummerProfit: number;   // 7-9月（month 3-5）の月平均連結利益
  avgOffSummerProfit: number;
  bankruptRate: number;
}

export function collectStats(n: number, botId: BotId, upgrades: SimUpgrades = {}): BotStats {
  const ranks: Record<string, number> = {};
  const profits: number[] = [];
  let black = 0, bankrupt = 0, summerSum = 0, offSum = 0, summerN = 0, offN = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = runBot(seed, BOTS[botId], upgrades);
    ranks[r.score.rank] = (ranks[r.score.rank] ?? 0) + 1;
    profits.push(r.score.consolidatedProfitTotal);
    if (r.score.consolidatedProfitTotal > 0) black++;
    if (r.score.rank === 'FAIL') bankrupt++;
    for (const m of r.history) {
      if (m.month >= 3 && m.month <= 5) { summerSum += m.consolidatedProfit; summerN++; }
      else { offSum += m.consolidatedProfit; offN++; }
    }
  }
  const modeRank = Object.entries(ranks).sort((a, b) => b[1] - a[1])[0][0];
  const avgProfit = profits.reduce((t, v) => t + v, 0) / n;
  const profitStd = Math.sqrt(profits.reduce((t, v) => t + (v - avgProfit) ** 2, 0) / n);
  return {
    ranks, modeRank, avgProfit, profitStd,
    blackRate: black / n,
    avgSummerProfit: summerSum / Math.max(1, summerN),
    avgOffSummerProfit: offSum / Math.max(1, offN),
    bankruptRate: bankrupt / n,
  };
}
