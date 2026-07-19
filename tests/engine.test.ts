/** P1受け入れテスト — docs/05 §5.1 準拠 */
import { describe, it, expect } from 'vitest';
import { initRun, simulateMonth } from '../src/game/simulateMonth.js';
import { makeEntry, balance, internalSales, monthlyPL } from '../src/game/accounting/journal.js';
import { shiftFlock, shipSheep, totalSheep, mergeLot, takeFromStock } from '../src/game/pipeline/flock.js';
import { generatePuzzle, judgePuzzle } from '../src/game/puzzle/ledgerGap.js';
import { scoreRun } from '../src/game/scoring.js';
import { mulberry32 } from '../src/game/rng.js';
import type { MonthlyOrders, RunState, StockLot } from '../src/game/types.js';

const baseOrders = (over: Partial<MonthlyOrders> = {}): MonthlyOrders => ({
  lambsToBuy: 0, sheepToShear: 0, sheepToShip: 0, slaughterQty: 0,
  meatDirectRatio: 0.5, spinQty: 0, yarnDirectRatio: 0,
  meatRecipes: {}, apparelRecipes: {},
  priceStance: 'standard',
  truckAssignment: {
    'farm-meat': 0, 'farm-wool': 0, 'meat-delica': 0, 'meat-sales': 0,
    'delica-sales': 0, 'wool-apparel': 0, 'apparel-sales': 0,
  },
  ...over,
});

const fullTrucks = (): MonthlyOrders['truckAssignment'] => ({
  'farm-meat': 1, 'farm-wool': 1, 'meat-delica': 1, 'meat-sales': 1,
  'delica-sales': 1, 'wool-apparel': 1, 'apparel-sales': 1,
});

describe('仕訳エンジン', () => {
  it('貸借不一致はthrow', () => {
    expect(() => makeEntry(0, { type: 'SELL', docId: 'x' }, [
      { account: 'cash', side: 'debit', amount: 100, companyId: 'sales' },
      { account: 'sales', side: 'credit', amount: 90, companyId: 'sales' },
    ])).toThrow(/unbalanced/);
  });

  it('全月：単純合計 − 消去 = 連結 が成立（12ヶ月ラン）', () => {
    let s = initRun(42);
    for (let i = 0; i < 12 && !s.bankrupt; i++) {
      const { next, result } = simulateMonth(s, baseOrders({
        lambsToBuy: 2, sheepToShear: 5, sheepToShip: 1, slaughterQty: 6,
        spinQty: 8, meatRecipes: { genghis: 3 }, apparelRecipes: { muffler: 3 },
        truckAssignment: fullTrucks(),
      }));
      expect(result.simpleSum - result.eliminations).toBe(result.consolidatedProfit);
      s = next;
    }
  });

  it('内部取引：売手の内部売上>0の月がある＆TRANSFER仕訳の売手売上=買手在庫計上額', () => {
    let s = initRun(7);
    const { next } = simulateMonth(s, baseOrders({
      sheepToShear: 5, truckAssignment: fullTrucks(),
    }));
    const je = next.journal.find(e => e.sourceDoc.type === 'TRANSFER');
    expect(je).toBeDefined();
    const sellerSales = je!.lines.find(l => l.account === 'sales')!.amount;
    const buyerInv = je!.lines.find(l => l.account === 'inventory' && l.side === 'debit')!.amount;
    expect(sellerSales).toBe(buyerInv);
    expect(internalSales(next.journal, 0)).toBeGreaterThan(0);
  });
});

describe('群れ管理（FlockState）', () => {
  it('刈った羊は2ヶ月後にreadyへ戻る', () => {
    let f = { ready: 5, cd1: 0, cd2: 0, lambs: 0, capacity: 10 };
    f = shiftFlock({ ...f, ready: f.ready - 3 }, 3); // 3頭刈った月末
    expect(f).toMatchObject({ ready: 2, cd1: 0, cd2: 3 });
    f = shiftFlock(f, 0);
    expect(f).toMatchObject({ ready: 2, cd1: 3, cd2: 0 });
    f = shiftFlock(f, 0);
    expect(f).toMatchObject({ ready: 5, cd1: 0, cd2: 0 }); // 復帰
  });

  it('出荷はcd2→cd1→readyの順に減り、総頭数が減る', () => {
    const f = { ready: 3, cd1: 2, cd2: 1, lambs: 0, capacity: 10 };
    const { flock, shipped } = shipSheep(f, 4);
    expect(shipped).toBe(4);
    expect(flock).toMatchObject({ cd2: 0, cd1: 0, ready: 2 });
    expect(totalSheep(flock)).toBe(2);
  });

  it('エサ代は総頭数×200で計上される', () => {
    const s = initRun(1); // ready5
    const { next } = simulateMonth(s, baseOrders());
    expect(balance(next.journal, 'feedCost', { month: 0 })).toBe(5 * 200);
  });

  it('毛刈りはready数と毛刈り班上限で丸められる', () => {
    const s = initRun(1);
    const { next } = simulateMonth(s, baseOrders({ sheepToShear: 99 }));
    // ready5 < 班上限6 → 5頭ぶんの羊毛がfarmに（輸送0なので滞留）
    const wool = next.companies.farm.stock.find(l => l.goodsId === 'wool');
    expect(wool?.qty).toBe(5);
  });
});

describe('在庫・原価', () => {
  it('移動平均：300G×10と360G×10の混合払出は330G', () => {
    const stock: StockLot[] = [];
    mergeLot(stock, { goodsId: 'wool', qty: 10, ageMonths: 0, unitCost: 300, groupCost: 300 });
    mergeLot(stock, { goodsId: 'wool', qty: 10, ageMonths: 0, unitCost: 360, groupCost: 360 });
    const out = takeFromStock(stock, 'wool', 5);
    expect(out.unitCost).toBe(330);
  });

  it('原価積み上げ検算：羊毛→糸→マフラーのグループ真実原価', () => {
    // 羊毛50/袋 → 糸:(50+300)/2=175/巻 → マフラー:175*2+200=550/着
    let s = initRun(3);
    let r = simulateMonth(s, baseOrders({ sheepToShear: 5, spinQty: 5, truckAssignment: fullTrucks() }));
    // 2ヶ月目は輸送を止め、アパレルの完成在庫で原価を確認（運ぶと同月中に売れてしまうため）
    r = simulateMonth(r.next, baseOrders({ apparelRecipes: { muffler: 3 } }));
    const muf = r.next.companies.apparel.stock.find(l => l.goodsId === 'muffler');
    expect(muf).toBeDefined();
    expect(muf!.groupCost).toBe(550);
  });

  it('鮮度：ラム肉は2ヶ月で廃棄、羊毛・糸は廃棄されない', () => {
    let s = initRun(5);
    // 1ヶ月目：出荷→と畜（輸送はfarm-meatのみ、販売させない）
    let r = simulateMonth(s, baseOrders({
      sheepToShip: 2, slaughterQty: 2, sheepToShear: 3, meatDirectRatio: 0,
      truckAssignment: { ...baseOrders().truckAssignment, 'farm-meat': 1 },
    }));
    expect(r.next.companies.meat.stock.find(l => l.goodsId === 'lambMeat')?.qty).toBe(4);
    // 2ヶ月目：何もしない → age2で廃棄
    r = simulateMonth(r.next, baseOrders());
    expect(r.result.disposedBoxes).toBe(4);
    expect(balance(r.next.journal, 'disposalLoss', { month: 1 })).toBeGreaterThan(0);
    // 羊毛はfarmに残り続ける
    expect(r.next.companies.farm.stock.find(l => l.goodsId === 'wool')?.qty).toBe(3);
  });
});

describe('物流・販売', () => {
  it('輸送はトラック割当×積載で頭打ちになる', () => {
    const s = initRun(9);
    const { next } = simulateMonth(s, baseOrders({
      sheepToShear: 5,
      truckAssignment: { ...baseOrders().truckAssignment, 'farm-wool': 1 }, // 6箱/台だが羊毛5→全部運べる
    }));
    expect(next.companies.wool.stock.find(l => l.goodsId === 'wool')?.qty).toBe(5);
    // 割当0の区間は動かない
    expect(next.companies.meat.stock.length).toBe(0);
  });

  it('季節係数：7-9月は肉需要が伸び、アパレル需要が萎む', () => {
    const { SEASON_FACTOR } = await_import();
    expect(SEASON_FACTOR(3).meatLine).toBeGreaterThan(SEASON_FACTOR(3).apparelLine);
    expect(SEASON_FACTOR(8).apparelLine).toBeGreaterThan(SEASON_FACTOR(8).meatLine);
  });

  it('現金の連続性：cashEnd = 前月cashEnd + cashIn − cashOut', () => {
    let s = initRun(11);
    let prevCash = s.cash;
    for (let i = 0; i < 6; i++) {
      const { next, result } = simulateMonth(s, baseOrders({
        lambsToBuy: 1, sheepToShear: 4, sheepToShip: 1, slaughterQty: 3,
        spinQty: 4, meatRecipes: { genghis: 2 }, apparelRecipes: { muffler: 2 },
        truckAssignment: fullTrucks(),
      }));
      expect(result.cashEnd).toBe(prevCash + result.cashIn - result.cashOut);
      prevCash = result.cashEnd;
      s = next;
    }
  });

  it('現金が尽きると倒産フラグ', () => {
    let s = initRun(13);
    s.cash = 100; // ほぼゼロから固定費6,000で沈む
    const { next } = simulateMonth(s, baseOrders());
    expect(next.bankrupt).toBe(true);
  });
});

describe('ズレ探し', () => {
  it('4型すべてで正解行以外は完全一致', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 40; i++) {
      const p = generatePuzzle(
        [{ route: 'farm-wool', goodsId: 'wool', qty: 12, unitPrice: 400 },
         { route: 'farm-wool', goodsId: 'wool', qty: 6, unitPrice: 400 }],
        rng, i,
      );
      const sellerMap = new Map(p.sellerRows.map(r => [r.rowId, r]));
      for (const br of p.buyerRows) {
        if (br.rowId === p.answerRowId) continue;
        const sr = sellerMap.get(br.rowId);
        // duplicate型の複製行はanswerRowIdなのでここには来ない
        expect(sr, `${p.gapType} ${br.rowId}`).toBeDefined();
        expect(br.qty).toBe(sr!.qty);
        expect(br.unitPrice).toBe(sr!.unitPrice);
      }
      if (p.gapType === 'missing') {
        expect(p.buyerRows.find(r => r.rowId === p.answerRowId)).toBeUndefined();
        expect(p.sellerRows.find(r => r.rowId === p.answerRowId)).toBeDefined();
      }
      expect(judgePuzzle(p, p.answerRowId)).toBe(true);
      expect(judgePuzzle(p, 'NOPE')).toBe(false);
    }
  });
});

describe('スコアリング', () => {
  it('廃棄ゼロ・全月黒字などのボーナスが発火する', () => {
    let s = initRun(21);
    // 履歴を捏造してボーナス条件を満たす
    s.history = Array.from({ length: 12 }, (_, m) => ({
      month: m, companyPLs: [], simpleSum: 10000, eliminations: 2000,
      consolidatedProfit: 8000,
      lineRevenue: { meatLine: 5000, apparelLine: 5000 },
      lineGroupProfit: { meatLine: 4000, apparelLine: 4000 },
      cashIn: 0, cashOut: 0, cashEnd: 50_000, disposedBoxes: 0,
      sheepCount: 5, soldBoxes: 10, eventId: 'none' as const, ballparkNews: '',
    }));
    s.disposedTotal = 0; s.gapsTotal = 2; s.gapsFound = 2;
    const r = scoreRun(s, 21);
    const labels = r.bonuses.map(b => b.label);
    expect(labels).toContain('廃棄ゼロ');
    expect(labels).toContain('ズレ全発見');
    expect(labels).toContain('二刀流（両ライン黒字）');
    expect(labels).toContain('全月れんけつ黒字');
    expect(r.consolidatedProfitTotal).toBe(96_000);
    expect(r.rank).toBe('S'); // 96,000+ボーナス > 90,000
    expect(r.norenEarned).toBe(Math.max(1, Math.ceil(r.score / 4000)));
  });

  it('倒産時はFAILと敗因', () => {
    let s = initRun(22);
    s.bankrupt = true;
    s.history = [{ month: 4, companyPLs: [], simpleSum: 0, eliminations: 0, consolidatedProfit: -3000,
      lineRevenue: { meatLine: 0, apparelLine: 0 }, lineGroupProfit: { meatLine: 0, apparelLine: 0 },
      cashIn: 0, cashOut: 0, cashEnd: -100, disposedBoxes: 0, sheepCount: 0, soldBoxes: 0,
      eventId: 'none' as const, ballparkNews: '' }];
    const r = scoreRun(s, 22);
    expect(r.rank).toBe('FAIL');
    expect(r.failReason).toContain('月');
  });
});

// 動的import回避用（SEASON_FACTORはconstantsから同期importでOK）
import { SEASON_FACTOR } from '../src/game/constants.js';
function await_import() { return { SEASON_FACTOR }; }
