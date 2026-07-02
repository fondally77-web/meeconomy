/** 群れ管理と在庫ロット操作 */
import type { FlockState, StockLot, GoodsId } from '../types.js';

/** 総頭数（エサ代の課金対象） */
export function totalSheep(f: FlockState): number {
  return f.ready + f.cd1 + f.cd2 + f.lambs;
}

/** 月末シフト：cd1→ready、cd2→cd1、当月刈った分→cd2、子羊→ready */
export function shiftFlock(f: FlockState, shearedThisMonth: number): FlockState {
  return {
    ready: f.ready + f.cd1 + f.lambs,
    cd1: f.cd2,
    cd2: shearedThisMonth,
    lambs: 0,
    capacity: f.capacity,
  };
}

/** 出荷：readyを温存するため cd2→cd1→ready の順で減らす */
export function shipSheep(f: FlockState, n: number): { flock: FlockState; shipped: number } {
  let rest = n;
  const take = (v: number) => { const t = Math.min(v, rest); rest -= t; return v - t; };
  const cd2 = take(f.cd2);
  const cd1 = take(f.cd1);
  const ready = take(f.ready);
  return { flock: { ...f, ready, cd1, cd2 }, shipped: n - rest };
}

// ── 在庫ロット ──

/** 同一品目は移動平均で1ロットに統合（ageは重み付き平均→切り捨て） */
export function mergeLot(stock: StockLot[], lot: StockLot): void {
  if (lot.qty <= 0) return;
  const ex = stock.find(s => s.goodsId === lot.goodsId);
  if (!ex) { stock.push({ ...lot }); return; }
  const q = ex.qty + lot.qty;
  ex.unitCost = Math.round((ex.unitCost * ex.qty + lot.unitCost * lot.qty) / q);
  ex.groupCost = Math.round((ex.groupCost * ex.qty + lot.groupCost * lot.qty) / q);
  ex.ageMonths = Math.floor((ex.ageMonths * ex.qty + lot.ageMonths * lot.qty) / q);
  ex.qty = q;
}

/** 払出：qtyぶん取り出す（不足時はある分だけ）。移動平均なので原価はロットの単価 */
export function takeFromStock(
  stock: StockLot[], goodsId: GoodsId, qty: number,
): { qty: number; unitCost: number; groupCost: number } {
  const ex = stock.find(s => s.goodsId === goodsId);
  if (!ex || qty <= 0) return { qty: 0, unitCost: 0, groupCost: 0 };
  const q = Math.min(ex.qty, qty);
  ex.qty -= q;
  const out = { qty: q, unitCost: ex.unitCost, groupCost: ex.groupCost };
  if (ex.qty === 0) stock.splice(stock.indexOf(ex), 1);
  return out;
}

export function stockQty(stock: StockLot[], goodsId: GoodsId): number {
  return stock.find(s => s.goodsId === goodsId)?.qty ?? 0;
}
