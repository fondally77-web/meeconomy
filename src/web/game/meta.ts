/** P5 メタ進行：のれんPとラボ強化（localStorageに永続化）
 *  ノード定義は docs/02 §6。エンジンに効かないノード（特急便・AI系等）は未実装。
 */

export interface LabNode {
  id: string;
  icon: string;
  name: string;
  effect: string;          // 1段あたりの効果
  costs: number[];         // 段ごとのコスト（のれんP）
}

export const LAB_NODES: LabNode[] = [
  { id: 'farm',    icon: '🐑', name: '飼育枠',       effect: '+5頭',            costs: [2, 4, 7] },
  { id: 'shear',   icon: '✂️', name: '毛刈り班',     effect: '+3頭/月',         costs: [2, 4] },
  { id: 'meat',    icon: '🥩', name: 'と畜ライン',   effect: '+3頭/月',         costs: [2, 4, 7] },
  { id: 'delica',  icon: '🍖', name: 'デリカ加工',   effect: '+4箱/月',         costs: [3, 5, 8] },
  { id: 'wool',    icon: '🧶', name: '紡績機',       effect: '+4袋/月',         costs: [2, 4] },
  { id: 'apparel', icon: '👕', name: '縫製ライン',   effect: '+3着/月',         costs: [3, 5, 8] },
  { id: 'sales',   icon: '🏪', name: '販売網',       effect: '+15箱/月',        costs: [3, 6] },
  { id: 'trucks',  icon: '🚚', name: 'トラック',     effect: '+1台',            costs: [2, 3, 5, 8, 12] },
  { id: 'fridge',  icon: '🧊', name: '冷蔵庫',       effect: '肉系の鮮度+1ヶ月', costs: [4] },
  { id: 'cash',    icon: '💰', name: '開始資金',     effect: '+5,000G',         costs: [2, 3, 4] },
  { id: 'meez',    icon: '⚾', name: 'メェーズ補強', effect: 'チーム力+10',      costs: [5, 8] },
  { id: 'buddy',   icon: '🧚', name: 'ズレ探しの相棒', effect: '制限+15秒＆ヒント1回', costs: [3] },
];

export interface MetaState {
  noren: number;
  totalNoren: number;      // 通算獲得（実績用）
  runs: number;
  bestRank: string;
  upgrades: Record<string, number>;
}

const KEY = 'meeconomy-meta-v1';

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { noren: 0, totalNoren: 0, runs: 0, bestRank: '-', upgrades: {}, ...JSON.parse(raw) as Partial<MetaState> };
  } catch { /* 破損時は初期化 */ }
  return { noren: 0, totalNoren: 0, runs: 0, bestRank: '-', upgrades: {} };
}

export function saveMeta(m: MetaState): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* プライベートモード等は諦める */ }
}

export function levelOf(m: MetaState, id: string): number {
  return m.upgrades[id] ?? 0;
}

export function nextCost(m: MetaState, node: LabNode): number | null {
  const lv = levelOf(m, node.id);
  return lv < node.costs.length ? node.costs[lv] : null;
}

const RANK_ORDER = ['-', 'FAIL', 'C', 'B', 'A', 'S', 'SS'];
export function betterRank(a: string, b: string): string {
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b;
}
