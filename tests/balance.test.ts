/** P2受け入れ：バランス検証（docs/05 §5.3・docs/02 §11）
 *  シード1〜300の決定的なバッチで判定する（正式な各1000ランは sim/batch.ts）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HALF_UPGRADES } from '../sim/bots.js';
import { collectStats, type BotStats } from '../sim/stats.js';

const N = 300;
let idle: BotStats, balanced: BotStats, meatOnly: BotStats, woolOnly: BotStats, balancedHalf: BotStats;

beforeAll(() => {
  idle = collectStats(N, 'idle');
  balanced = collectStats(N, 'balanced');
  meatOnly = collectStats(N, 'meatOnly');
  woolOnly = collectStats(N, 'woolOnly');
  balancedHalf = collectStats(N, 'balanced', HALF_UPGRADES);
}, 120_000);

describe('バランス（P2受け入れ・02_§11）', () => {
  it('idleの黒字率が60〜75%', () => {
    expect(idle.blackRate).toBeGreaterThanOrEqual(0.60);
    expect(idle.blackRate).toBeLessThanOrEqual(0.75);
  });

  it('balancedが最良（平均連結利益で全ボットを上回る）', () => {
    expect(balanced.avgProfit).toBeGreaterThan(idle.avgProfit);
    expect(balanced.avgProfit).toBeGreaterThan(meatOnly.avgProfit);
    expect(balanced.avgProfit).toBeGreaterThan(woolOnly.avgProfit);
  });

  it('balancedは初期Bランク中心、強化半分でAランク中心', () => {
    expect(balanced.modeRank).toBe('B');
    expect(balancedHalf.modeRank).toBe('A');
  });

  it('meatOnlyは夏（7-9月）に強く、年間ではbalancedに劣後', () => {
    expect(meatOnly.avgSummerProfit).toBeGreaterThan(meatOnly.avgOffSummerProfit);
    expect(meatOnly.avgProfit).toBeLessThan(balanced.avgProfit);
  });

  it('woolOnlyは低リスク低リターン（黒字率95%以上・利益のブレはmeatOnly未満・平均はbalanced未満）', () => {
    expect(woolOnly.blackRate).toBeGreaterThanOrEqual(0.95);
    expect(woolOnly.blackRate).toBeGreaterThanOrEqual(idle.blackRate);
    expect(woolOnly.profitStd).toBeLessThan(meatOnly.profitStd);
    expect(woolOnly.avgProfit).toBeLessThan(balanced.avgProfit);
  });

  it('全ボットが破産だけはしない（初期バランスの下限保証）', () => {
    for (const s of [idle, balanced, meatOnly, woolOnly]) {
      expect(s.bankruptRate).toBeLessThanOrEqual(0.02);
    }
  });
});
