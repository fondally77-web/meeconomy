/** 表示名（docs/02・03準拠） */
import type { EventId, GoodsId, RecipeId, RouteId } from '../../game/types.js';

export const MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];

export const EVENT_NAMES: Record<EventId, string> = {
  feedSpike: '🌾飼料高騰（エサ代×1.5）',
  lambCheap: '🐑子羊相場安（導入費×0.6）',
  bbqBoom: '🔥BBQブーム（肉系需要×1.4）',
  coldWave: '❄️寒波（アパレル需要×1.5）',
  warmWinter: '🌤暖冬（アパレル需要×0.6）',
  craftBoom: '🧶手芸ブーム（糸直販が人気）',
  tvFeature: '📺TVで特集（需要アップ）',
  roadWork: '🚧高速道路工事（積載×0.8）',
  fuelSpike: '⛽燃料高騰（輸送燃料費×1.6）',
  shearFes: '✂️毛刈りフェス（能力×2・刈毛費0）',
  lineTrouble: '🔧設備故障（加工能力×0.5）',
  ledgerGap: '🧾帳簿ズレ発生！',
  championSale: '🎉ありがとう優勝セール',
  none: '',
};

export const RECIPE_NAMES: Record<RecipeId, string> = {
  genghis: 'ジンギスカン',
  lambSausage: 'ソーセージ',
  lambCurry: 'ラムカレー',
  lambChop: 'ラムチョップ',
  muffler: 'マフラー',
  sweater: 'セーター',
  blanket: 'ブランケット',
  coat: 'コート',
};

export const GOODS_NAMES: Partial<Record<GoodsId, string>> = {
  sheep: '羊', wool: '羊毛', yarn: '糸', lambMeat: 'ラム肉',
};

export const ROUTE_NAMES: Record<RouteId, string> = {
  'farm-meat': '🐑→🥩ミート',
  'farm-wool': '🐑→🧶ウール',
  'meat-delica': '🥩→🍖デリカ',
  'meat-sales': '🥩→🏪直販',
  'delica-sales': '🍖→🏪',
  'wool-apparel': '🧶→👕アパレル',
  'apparel-sales': '👕→🏪',
};

export const COMPANY_NAMES: Record<string, string> = {
  farm: '🐑ファーム', meat: '🥩ミート', delica: '🍖デリカ', wool: '🧶ウール',
  apparel: '👕アパレル', sales: '🏪セールス', logi: '🚚ロジ', hq: '☁️管理',
};

export const RANK_COMMENTS: Record<string, string> = {
  SS: '伝説の羊飼い！完璧なれんけつ経営です',
  S: 'すばらしい！両ラインを乗りこなしましたね',
  A: 'お見事！季節の波をうまく使えています',
  B: '堅実な経営です。来期はラインの季節を意識してみましょう',
  C: 'ひとまず黒字。羊は裏切りません',
  FAIL: '現金が尽きました…羊たちは新天地へ。もう一度！',
};
