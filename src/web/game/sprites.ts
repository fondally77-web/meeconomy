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
/** 商品→箱スプライト */
export function goodsSprite(goodsId: GoodsId): Sprite {
  switch (goodsId) {
    case 'wool': return WOOLBAG;
    case 'yarn': return YARNROLL;
    case 'sheep': return LAMB;
    case 'lambMeat': return MEATBOX;
    case 'genghis': case 'lambSausage': case 'lambCurry': case 'lambChop': return DELICABOX;
    default: return APPARELBOX;
  }
}
