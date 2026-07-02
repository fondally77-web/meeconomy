/** 帳簿ズレボーナス — 当月の内部取引からパズルを生成。
 *  保証：正解行以外、売り手帳簿と買い手帳簿は完全一致。 */
import type { GapType, LedgerGapPuzzle, LedgerRow, RouteId, GoodsId, CompanyId } from '../types.js';
import { PUZZLE_TIME_LIMIT } from '../constants.js';
import type { Rng } from '../rng.js';

const ROUTE_ENDS: Record<string, [CompanyId, CompanyId]> = {
  'farm-meat': ['farm','meat'], 'farm-wool': ['farm','wool'],
  'meat-delica': ['meat','delica'], 'meat-sales': ['meat','sales'],
  'delica-sales': ['delica','sales'], 'wool-apparel': ['wool','apparel'],
  'apparel-sales': ['apparel','sales'],
};

interface TransferRec { route: RouteId; goodsId: GoodsId; qty: number; unitPrice: number }

const GAP_TYPES: GapType[] = ['qty', 'price', 'duplicate', 'missing'];

export function generatePuzzle(transfers: TransferRec[], rng: Rng, seq: number): LedgerGapPuzzle {
  // 取引の多いルートを選ぶ
  const byRoute = new Map<RouteId, TransferRec[]>();
  for (const t of transfers) {
    if (!byRoute.has(t.route)) byRoute.set(t.route, []);
    byRoute.get(t.route)!.push(t);
  }
  const route = [...byRoute.keys()][Math.floor(rng.next() * byRoute.size)];
  const recs = byRoute.get(route)!;
  const [seller, buyer] = ROUTE_ENDS[route];

  // 5〜8行になるよう取引を分割して行を作る
  const rows: LedgerRow[] = [];
  let rid = 0;
  for (const r of recs) {
    let rest = r.qty;
    while (rest > 0 && rows.length < 8) {
      const q = Math.max(1, Math.min(rest, Math.ceil(r.qty / 2), 1 + Math.floor(rng.next() * 6)));
      rows.push({ rowId: `R${++rid}`, goodsId: r.goodsId, qty: q, unitPrice: r.unitPrice, amount: q * r.unitPrice });
      rest -= q;
    }
  }
  while (rows.length < 5 && recs.length > 0) {
    const r = recs[Math.floor(rng.next() * recs.length)];
    const q = 1 + Math.floor(rng.next() * 4);
    rows.push({ rowId: `R${++rid}`, goodsId: r.goodsId, qty: q, unitPrice: r.unitPrice, amount: q * r.unitPrice });
  }

  const sellerRows = rows.map(r => ({ ...r }));
  const buyerRows = rows.map(r => ({ ...r }));
  const gapType = GAP_TYPES[Math.floor(rng.next() * GAP_TYPES.length)];
  const target = buyerRows[Math.floor(rng.next() * buyerRows.length)];
  let answerRowId = target.rowId;

  switch (gapType) {
    case 'qty': {
      const delta = 1 + Math.floor(rng.next() * 3);
      target.qty += rng.next() < 0.5 ? delta : -Math.min(delta, target.qty - 1);
      target.amount = target.qty * target.unitPrice;
      break;
    }
    case 'price': {
      // ケタ違い or 端数違い
      target.unitPrice = rng.next() < 0.4 ? target.unitPrice * 10 : target.unitPrice + 100;
      target.amount = target.qty * target.unitPrice;
      break;
    }
    case 'duplicate': {
      const dup = { ...target, rowId: `R${++rid}` };
      buyerRows.push(dup);
      answerRowId = dup.rowId;
      break;
    }
    case 'missing': {
      // 買い手側から1行消す。正解は売り手側の対応行
      buyerRows.splice(buyerRows.indexOf(target), 1);
      answerRowId = target.rowId;
      break;
    }
  }

  return {
    id: `GAP${seq + 1}`,
    sellerCompanyId: seller,
    buyerCompanyId: buyer,
    sellerRows,
    buyerRows,
    gapType,
    answerRowId,
    timeLimitSec: PUZZLE_TIME_LIMIT,
  };
}

/** 回答判定 */
export function judgePuzzle(p: LedgerGapPuzzle, rowId: string): boolean {
  return rowId === p.answerRowId;
}
