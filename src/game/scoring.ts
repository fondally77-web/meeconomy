/** 年度決算スコアリング */
import type { RunState, RunResult, RunRank } from './types.js';
import { BONUS, RANK_THRESHOLDS } from './constants.js';

export function scoreRun(s: RunState, seed: number): RunResult {
  const total = s.history.reduce((t, m) => t + m.consolidatedProfit, 0);
  const bonuses: { label: string; amount: number }[] = [];

  if (s.bankrupt) {
    const m = s.history[s.history.length - 1];
    return {
      score: Math.max(0, total), rank: 'FAIL',
      consolidatedProfitTotal: total, bonuses,
      norenEarned: Math.max(1, Math.ceil(Math.max(0, total) / 8000)),
      seed, bankruptMonth: m?.month,
      failReason: `現金が尽きた月：${(m?.month ?? 0) + 4 > 12 ? (m?.month ?? 0) - 8 : (m?.month ?? 0) + 4}月`,
    };
  }

  if (s.disposedTotal === 0) bonuses.push({ label: '廃棄ゼロ', amount: BONUS.noDisposal });
  if (s.gapsTotal > 0 && s.gapsFound === s.gapsTotal) bonuses.push({ label: 'ズレ全発見', amount: BONUS.allGapsFound });
  if (s.ballpark.japanChampion) bonuses.push({ label: 'メェーズ日本一', amount: BONUS.japanChampion });
  else if (s.ballpark.leagueChampion) bonuses.push({ label: 'メェーズ優勝', amount: BONUS.leagueChampion });

  const meatY = s.history.reduce((t, m) => t + m.lineGroupProfit.meatLine, 0);
  const woolY = s.history.reduce((t, m) => t + m.lineGroupProfit.apparelLine, 0);
  if (meatY > 0 && woolY > 0) bonuses.push({ label: '二刀流（両ライン黒字）', amount: BONUS.bothLinesProfit });

  if (s.history.every(m => m.cashEnd >= 10_000)) bonuses.push({ label: '資金余裕（現金1万G未満なし）', amount: BONUS.cashNeverBelow10k });
  if (s.history.every(m => m.consolidatedProfit > 0)) bonuses.push({ label: '全月れんけつ黒字', amount: BONUS.allMonthsProfit });

  const score = total + bonuses.reduce((t, b) => t + b.amount, 0);
  let rank: RunRank = 'FAIL';
  for (const [th, r] of RANK_THRESHOLDS) { if (score >= th) { rank = r as RunRank; break; } }
  if (score < 1) rank = 'FAIL';

  return {
    score, rank,
    consolidatedProfitTotal: total,
    bonuses,
    norenEarned: Math.max(1, Math.ceil(score / 4000)),
    seed,
  };
}
