/** メェーズ（ペナント・ヘッダーラベル）とイベント抽選 */
import type { BallparkState, ActiveEvent, EventId } from './types.js';
import { BRAND_BY_STANDING, CHAMPION_RATE, EVENT_TABLE, LEDGER_GAP_WINDOWS } from './constants.js';
import type { Rng } from './rng.js';

export function initBallpark(teamPower: number): BallparkState {
  return {
    teamPower, savings: 0, standing: 4, brandFactor: 1.0,
    phase: 'pennant', headerLabel: '開幕！', leagueChampion: false, japanChampion: false,
    newsLog: [],
  };
}

const MONTH_JP = ['4','5','6','7','8','9','10','11','12','1','2','3'];

/** 月初に呼ぶ。month: 0-11 */
export function updateBallpark(bp: BallparkState, month: number, rng: Rng): BallparkState {
  const b = { ...bp, newsLog: [...bp.newsLog] };
  if (month <= 5) {
    // 4-9月：ペナント
    const winProb = b.teamPower / 100 + (rng.next() - 0.5) * 0.2;
    const delta = Math.round((winProb - 0.5) * 8); // -4〜+4
    b.savings += delta;
    b.standing = (b.savings >= 8 ? 1 : b.savings >= 4 ? 2 : b.savings >= 0 ? 3
      : b.savings >= -4 ? 4 : b.savings >= -8 ? 5 : 6) as BallparkState['standing'];
    b.phase = 'pennant';
    b.headerLabel = `${b.standing}位(${b.savings >= 0 ? '+' : ''}${b.savings})`;
    b.newsLog.push(`⚾メェーズ、${MONTH_JP[month]}月は${delta >= 0 ? '勝ち越し' : '負け越し'}で${b.standing}位（貯金${b.savings}）`);
  } else if (month === 6) {
    // 10月：優勝判定
    const rate = CHAMPION_RATE[b.teamPower] ?? 0.15;
    const inRace = b.standing <= 3;
    b.leagueChampion = inRace && rng.next() < rate / (b.standing === 1 ? 0.9 : 1.2);
    if (b.leagueChampion) {
      b.japanChampion = rng.next() < 0.5;
      b.phase = 'champion';
      b.headerLabel = b.japanChampion ? '🎉日本一！' : '🏆リーグ優勝！';
      b.newsLog.push(b.japanChampion
        ? '⚾メェーズ、リーグ優勝からの日本一！！羊たちの雄叫びが夜空に響く'
        : '⚾メェーズ、リーグ優勝！！来月、感謝の優勝セール開催');
    } else {
      b.phase = 'climax';
      b.headerLabel = `シーズン終了 ${b.standing}位`;
      b.newsLog.push(`⚾メェーズ、今季は${b.standing}位でシーズン終了。来季に期待`);
    }
  } else {
    b.phase = 'offseason';
    b.headerLabel = '⛺キャンプ中';
    if (month === 8) b.newsLog.push('⚾メェーズ、秋季キャンプイン。若手のメリノが好調');
  }
  b.brandFactor = BRAND_BY_STANDING[b.standing];
  return b;
}

/** 月初イベント抽選（0〜1件）。優勝翌月は championSale 固定。ledgerGap は窓で年1〜2回 */
export function rollEvent(
  month: number, rng: Rng, leagueChampionLastMonth: boolean, gapsSoFar: number,
): ActiveEvent {
  if (leagueChampionLastMonth && month === 7) return { eventId: 'championSale' };
  // ズレ探し窓（各窓で1回だけ、窓内確率50%）
  for (let w = 0; w < LEDGER_GAP_WINDOWS.length; w++) {
    const win = LEDGER_GAP_WINDOWS[w];
    if (win.includes(month) && gapsSoFar <= w && rng.next() < 0.5) {
      return { eventId: 'ledgerGap' };
    }
  }
  // 通常抽選（40%は無風）
  if (rng.next() < 0.4) return { eventId: 'none' };
  const candidates = Object.entries(EVENT_TABLE)
    .filter(([, def]) => !def.months || def.months.includes(month));
  const total = candidates.reduce((s, [, d]) => s + d.weight, 0);
  let r = rng.next() * total;
  for (const [id, def] of candidates) {
    r -= def.weight;
    if (r <= 0) return { eventId: id as EventId };
  }
  return { eventId: 'none' };
}
