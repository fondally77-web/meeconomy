/** ドット絵スプライト（P0デモから移植）。文字列マップ→fillRect描画 */

export const PAL: Record<string, string | null> = {
  '.': null,
  W: '#f4efe3', w: '#d9d1bf',   // 羊毛
  F: '#453a33', f: '#5c4f45',   // 顔・脚
  P: '#eba8a0',                 // 耳・地肌ピンク
  S: '#c9b8a6', s: '#b2a08c',   // 刈り後の地肌
  G: '#3f9e4f', g: '#2e7a3c',   // トラック緑
  K: '#20242c', k: '#3a4150',   // タイヤ・窓
  D: '#e8dcc2', d: '#cfc0a0',   // 毛袋
  Y: '#ffd24a', y: '#d4a017',   // コイン
  R: '#c0392b', r: '#8e2b20',   // 肉箱
  B: '#8a94b8',                 // スタジアム
  T: '#4a90d9', t: '#2c5f9e',   // 糸巻き
  A: '#d98ec1', a: '#a55c8f',   // 服箱（アパレル）
  O: '#e2953a', o: '#b06f22',   // 加工品箱（デリカ）
};

export type Sprite = string[];

/** パレット文字を置き換えた色違いスプライトを作る */
export function reskin(rows: Sprite, map: Record<string, string>): Sprite {
  return rows.map(r => r.split('').map(c => map[c] ?? c).join(''));
}

export function drawSprite(
  ctx: CanvasRenderingContext2D, rows: Sprite, x: number, y: number, scale = 1, flip = false,
): void {
  const h = rows.length, w = rows[0].length;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const col = PAL[rows[r][flip ? w - 1 - c : c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
    }
  }
}

// もこもこ羊（16x12）歩行2フレーム
export const SHEEP_A: Sprite = [
  '....WWWWWWWW....',
  '..WWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  'PFWWWWWWWWWWWWW.',
  'FFFWWWWWWWWWWWW.',
  'FFFWWWWWWWWWWWW.',
  '.F.WWWWWWWWWWW..',
  '...wWWWWWWWWw...',
  '....wwwwwwww....',
  '...F...F...F....',
  '...F...F....F...',
  '................'];
export const SHEEP_B: Sprite = [
  '....WWWWWWWW....',
  '..WWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  'PFWWWWWWWWWWWWW.',
  'FFFWWWWWWWWWWWW.',
  'FFFWWWWWWWWWWWW.',
  '.F.WWWWWWWWWWW..',
  '...wWWWWWWWWw...',
  '....wwwwwwww....',
  '....F...F..F....',
  '...F....F...F...',
  '................'];
// 刈られた羊（ほっそり）2フレーム
export const SHORN_A: Sprite = [
  '................',
  '................',
  '....ssssssss....',
  'PF.sSSSSSSSSs...',
  'FFFSSSSSSSSSs...',
  'FFFsSSSSSSSSs...',
  '.F..ssssssss....',
  '................',
  '....F...F..F....',
  '...F...F....F...',
  '................',
  '................'];
export const SHORN_B: Sprite = [
  '................',
  '................',
  '....ssssssss....',
  'PF.sSSSSSSSSs...',
  'FFFSSSSSSSSSs...',
  'FFFsSSSSSSSSs...',
  '.F..ssssssss....',
  '................',
  '...F....F...F...',
  '....F..F...F....',
  '................',
  '................'];
// 子羊（10x8）
export const LAMB: Sprite = [
  '..WWWWWW..',
  '.WWWWWWWW.',
  'PFWWWWWWW.',
  'FFWWWWWWW.',
  '.F.wwwww..',
  '..F..F.F..',
  '..F..F..F.',
  '..........'];
// 毛袋（10x10）
export const WOOLBAG: Sprite = [
  '....ff....',
  '...fDDf...',
  '..DDDDDD..',
  '.DDDDDDDD.',
  '.DDDdDDDD.',
  '.DDDDDDdD.',
  '.DdDDDDDD.',
  '.DDDDdDDD.',
  '..DDDDDD..',
  '..dddddd..'];
// 肉箱（8x8）
export const MEATBOX: Sprite = [
  'rrrrrrrr',
  'rRRRRRRr',
  'rRRWWRRr',
  'rRWWWWRr',
  'rRRWWRRr',
  'rRRRRRRr',
  'rrrrrrrr',
  '........'];
// 糸巻き（8x8）
export const YARNROLL: Sprite = [
  '..tttt..',
  '.tTTTTt.',
  'tTTtTTTt',
  'tTTTTtTt',
  'tTtTTTTt',
  'tTTTtTTt',
  '.tTTTTt.',
  '..tttt..'];
// 服箱（8x8）
export const APPARELBOX: Sprite = [
  'aaaaaaaa',
  'aAAAAAAa',
  'aAWaaWAa',
  'aAWWWWAa',
  'aAAWWAAa',
  'aAAAAAAa',
  'aaaaaaaa',
  '........'];
// 加工品箱（8x8）
export const DELICABOX: Sprite = [
  'oooooooo',
  'oOOOOOOo',
  'oOWOOWOo',
  'oOOWWOOo',
  'oOWOOWOo',
  'oOOOOOOo',
  'oooooooo',
  '........'];
// セーター（8x8）
export const SWEATER: Sprite = [
  '.aa..aa.',
  'aAAAAAAa',
  'aaAAAAaa',
  '.aAWWAa.',
  '.aAAAAa.',
  '.aAWWAa.',
  '.aAAAAa.',
  '.aaaaaa.'];
// ブランケット（8x8）
export const BLANKET: Sprite = [
  '........',
  'tTTTTTTt',
  'tWWWWWWt',
  'tTTTTTTt',
  'tWWWWWWt',
  'tTTTTTTt',
  'tttttttt',
  '........'];
// コート（8x8・高級）
export const COAT_SP: Sprite = [
  '.YY..YY.',
  'FFFYYFFF',
  'FFFFFFFF',
  'FfFYYFfF',
  'FfFFFFfF',
  'FfFYYFfF',
  'FFFFFFFF',
  'ffffffff'];
// ソーセージ（8x8）
export const SAUSAGE: Sprite = [
  '........',
  '.rrrr...',
  'rRRRRr..',
  '.rrRRRr.',
  '..rRRRRr',
  '...rrrr.',
  'W..W..W.',
  '........'];
// ラムカレー（8x8・レトルト箱）
export const CURRY: Sprite = [
  'oooooooo',
  'oWWWWWWo',
  'oWOyyOWo',
  'oWyRRyWo',
  'oWyRRyWo',
  'oWOyyOWo',
  'oWWWWWWo',
  'oooooooo'];
// ラムチョップ（8x8）
export const CHOP: Sprite = [
  '.....WW.',
  '....WW..',
  '...RR...',
  '..RRRR..',
  '.RRRRRR.',
  '.RRrrRR.',
  '.rRRRRr.',
  '..rrrr..'];
// トラック（26x14）右向き
export const TRUCK: Sprite = [
  '..........................',
  '.GGGGGGGGGGGGGGG..........',
  '.GGGGGGGGGGGGGGG.GGGG.....',
  '.GGGGGGGGGGGGGGG.GkkG.....',
  '.GGGGGGGGGGGGGGG.GkkGG....',
  '.gggggggggggggggggggggg...',
  '.gggggggggggggggggggggg...',
  '...KK.........KK..KK......',
  '..KKKK.......KKKK.KKKK....',
  '..KKKK.......KKKK.KKKK....',
  '...KK.........KK..KK......',
  '..........................',
  '..........................',
  '..........................'];
// 金色の羊（もふもふ部分が金色）
export const GOLD_SHEEP_A = reskin(SHEEP_A, { W: 'Y', w: 'y' });
export const GOLD_SHEEP_B = reskin(SHEEP_B, { W: 'Y', w: 'y' });
export const GOLD_LAMB = reskin(LAMB, { W: 'Y', w: 'y' });
export const GOLD_WOOLBAG = reskin(WOOLBAG, { D: 'Y', d: 'y' });
export const GOLD_YARNROLL = reskin(YARNROLL, { T: 'Y', t: 'y' });

// 任意の商品スプライトを金色バージョンに（結果はキャッシュ）
const GOLD_MAP: Record<string, string> = {
  A: 'Y', a: 'y', T: 'Y', t: 'y', D: 'Y', d: 'y',
  W: 'Y', w: 'y', R: 'Y', r: 'y', O: 'Y', o: 'y', P: 'y',
};
const goldCache = new Map<Sprite, Sprite>();
export function goldify(spr: Sprite): Sprite {
  let g = goldCache.get(spr);
  if (!g) { g = reskin(spr, GOLD_MAP); goldCache.set(spr, g); }
  return g;
}

// お客さん（6x10）
export const CUSTOMER: Sprite = [
  '..KK..',
  '.KPPK.',
  '.KPPK.',
  '..RR..',
  '.RRRR.',
  'RRRRRR',
  '.RRRR.',
  '..RR..',
  '.K..K.',
  '.K..K.'];
// コイン（8x8）
export const COIN: Sprite = [
  '..YYYY..',
  '.YYYYYY.',
  'YYyYYyYY',
  'YYyYYyYY',
  'YYyYYyYY',
  'YYyYYyYY',
  '.YYYYYY.',
  '..YYYY..'];

import type { GoodsId } from '../../game/types.js';
/** 商品→スプライト（商品ごとに見た目が違う） */
export function goodsSprite(goodsId: GoodsId): Sprite {
  switch (goodsId) {
    case 'wool': return WOOLBAG;
    case 'yarn': return YARNROLL;
    case 'sheep': return LAMB;
    case 'lambMeat': return MEATBOX;
    case 'genghis': return DELICABOX;
    case 'lambSausage': return SAUSAGE;
    case 'lambCurry': return CURRY;
    case 'lambChop': return CHOP;
    case 'muffler': return APPARELBOX;
    case 'sweater': return SWEATER;
    case 'blanket': return BLANKET;
    case 'coat': return COAT_SP;
    default: return APPARELBOX;
  }
}
