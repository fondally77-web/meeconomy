/** P5 メタ進行：のれんPとラボ強化（localStorageに永続化）
 *  ノード定義は docs/02 §6。エンジンに効かないノード（特急便・AI系等）は未実装。
 */

export interface LabNode {
  id: string;
  icon: string;
  name: string;
  effect: string;          // 1段あたりの効果
  costs: number[];         // 段ごとのコスト（のれんP）
  base?: number;           // 現在値→次の値の表示用
  step?: number;
  unit?: string;
}

export const LAB_NODES: LabNode[] = [
  { id: 'farm',    icon: '🐑', name: '飼育枠',       effect: '+5頭',            costs: [2, 4, 7], base: 10, step: 5, unit: '頭' },
  { id: 'shear',   icon: '✂️', name: '毛刈り班',     effect: '+3頭/月',         costs: [2, 4], base: 6, step: 3, unit: '頭/月' },
  { id: 'meat',    icon: '🥩', name: 'と畜ライン',   effect: '+3頭/月',         costs: [2, 4, 7], base: 6, step: 3, unit: '頭/月' },
  { id: 'delica',  icon: '🍖', name: 'デリカ加工',   effect: '+4箱/月',         costs: [3, 5, 8], base: 6, step: 4, unit: '箱/月' },
  { id: 'wool',    icon: '🧶', name: '紡績機',       effect: '+4袋/月',         costs: [2, 4], base: 8, step: 4, unit: '袋/月' },
  { id: 'apparel', icon: '👕', name: '縫製ライン',   effect: '+3着/月',         costs: [3, 5, 8], base: 5, step: 3, unit: '着/月' },
  { id: 'sales',   icon: '🏪', name: '販売網',       effect: '+15箱/月',        costs: [3, 6], base: 35, step: 15, unit: '箱/月' },
  { id: 'trucks',  icon: '🚚', name: 'トラック',     effect: '+1台',            costs: [2, 3, 5, 8, 12], base: 3, step: 1, unit: '台' },
  { id: 'fridge',  icon: '🧊', name: '冷蔵庫',       effect: '肉系の鮮度 2→3ヶ月', costs: [4] },
  { id: 'cash',    icon: '💰', name: '開始資金',     effect: '+5,000G',         costs: [2, 3, 4], base: 30000, step: 5000, unit: 'G' },
  { id: 'meez',    icon: '⚾', name: 'メェーズ補強', effect: 'チーム力+10（ブランド↑）', costs: [5, 8], base: 50, step: 10, unit: '' },
  { id: 'buddy',   icon: '🧚', name: 'ズレ探しの相棒', effect: '制限+15秒＆ヒント1回', costs: [3] },
];

export interface MetaState {
  noren: number;
  totalNoren: number;      // 通算獲得（実績用）
  runs: number;
  bestRank: string;
  upgrades: Record<string, number>;
  achievements: string[];        // 解除済み実績id
  noDisposalStreak: number;      // 廃棄ゼロ連続ラン数
  puzzleNoMiss: number;          // ノーミス正解の累計回数
  gapTypesSolved: string[];      // 正解したズレ型
  difficulty: Difficulty;        // 難易度（セーブごとに固定。変更は「はじめから」）
  goodsSeen: string[];           // 商品図鑑：手にした品目
  sapCards: number;              // SAP図鑑：獲得枚数（順番に開く）
  fontScale: FontScale;          // 文字サイズ（🔠で切替・端末設定として保存）
}

export type FontScale = 'm' | 'l' | 'xl';
export const FONT_SCALES: { id: FontScale; name: string }[] = [
  { id: 'm', name: 'ふつう' }, { id: 'l', name: '大きい' }, { id: 'xl', name: '最大' },
];
/** <html data-fs> に反映（CSSの --fs-* が切り替わる） */
export function applyFontScale(scale: FontScale): void {
  document.documentElement.dataset.fs = scale;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface DifficultyDef {
  id: Difficulty; icon: string; name: string; desc: string;
  cashBonus: number; truckBonus: number; norenMult: number;
}
export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy',   icon: '🐑', name: 'ひつじ級',   desc: '資金+10,000G・🚚+1台。のんびり経営', cashBonus: 10_000, truckBonus: 1, norenMult: 1 },
  { id: 'normal', icon: '🧑‍🌾', name: 'ひつじかい級', desc: '標準ルール（バランス調整の基準）',   cashBonus: 0, truckBonus: 0, norenMult: 1 },
  { id: 'hard',   icon: '🏯', name: '財閥級',     desc: '資金▲12,000G。かわりにのれん×2',     cashBonus: -12_000, truckBonus: 0, norenMult: 2 },
];
export function difficultyDef(id: Difficulty): DifficultyDef {
  return DIFFICULTIES.find(d => d.id === id) ?? DIFFICULTIES[1];
}

const KEY = 'meeconomy-meta-v1';

export function emptyMeta(): MetaState {
  return {
    noren: 0, totalNoren: 0, runs: 0, bestRank: '-', upgrades: {},
    achievements: [], noDisposalStreak: 0, puzzleNoMiss: 0, gapTypesSolved: [],
    difficulty: 'normal', goodsSeen: ['sheep', 'lamb'], sapCards: 0, fontScale: 'm',
  };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyMeta(), ...JSON.parse(raw) as Partial<MetaState> };
  } catch { /* 破損時は初期化 */ }
  return emptyMeta();
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
