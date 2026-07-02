/** simulateMonth — 1ヶ月ぶんの経済シミュレーション本体。
 *  手順：①メェーズ更新 ②イベント ③ファーム（導入/エサ/毛刈り/出荷）
 *       ④上流→下流へ 輸送＆生産（トラック制約） ⑤外部販売 ⑥固定費 ⑦鮮度・廃棄
 *       ⑧月次結果（各社P/L・単純合計・連結・現金）
 *  会計方針：
 *   - 会社視点P/Lは振替価格ベース（unitCost）、連結は真実原価（groupCost）で算出
 *   - 内部売買は TRANSFER 仕訳（売手：売上/原価、買手：在庫。現金は動かない）
 *   - 輸送は荷主が運賃をロジへ（内部）、ロジが燃料を外部へ支払う
 */
import type {
  RunState, MonthlyOrders, MonthlyResult, CompanyId, GoodsId, RouteId,
  StockLot, JournalLine, EngineOptions, MarketLine, RecipeId,
} from './types.js';
import * as C from './constants.js';
import { makeEntry, monthlyPL } from './accounting/journal.js';
import { mergeLot, takeFromStock, stockQty, shiftFlock, shipSheep, totalSheep } from './pipeline/flock.js';
import { mulberry32 } from './rng.js';
import { updateBallpark, rollEvent } from './ballpark.js';
import { generatePuzzle } from './puzzle/ledgerGap.js';

const ROUTE_ENDS: Record<RouteId, [CompanyId, CompanyId]> = {
  'farm-meat': ['farm', 'meat'], 'farm-wool': ['farm', 'wool'],
  'meat-delica': ['meat', 'delica'], 'meat-sales': ['meat', 'sales'],
  'delica-sales': ['delica', 'sales'], 'wool-apparel': ['wool', 'apparel'],
  'apparel-sales': ['apparel', 'sales'],
};

interface Ctx {
  s: RunState; month: number; opts: EngineOptions;
  cashIn: number; cashOut: number;
  routeUsed: Record<RouteId, number>;
  routeCap: Record<RouteId, number>;
  soldBoxes: number; disposed: number;
  lineRevenue: Record<MarketLine, number>;
  lineGroupCogs: Record<MarketLine, number>;
  extRevenue: number; extGroupCogs: number; extExpense: number;
  transfers: { route: RouteId; goodsId: GoodsId; qty: number; unitPrice: number }[];
}

function post(ctx: Ctx, type: Parameters<typeof makeEntry>[1]['type'], docId: string, lines: JournalLine[]) {
  ctx.s.journal.push(makeEntry(ctx.month, { type, docId }, lines));
}
function cashOut(ctx: Ctx, amount: number) { ctx.s.cash -= amount; ctx.cashOut += amount; }
function cashIn(ctx: Ctx, amount: number) { ctx.s.cash += amount; ctx.cashIn += amount; }

/** 内部売買＋輸送。route容量の残りで丸め、実際に動いた数量を返す */
function transfer(ctx: Ctx, route: RouteId, goodsId: GoodsId, wantQty: number, unitPrice: number): number {
  const [from, to] = ROUTE_ENDS[route];
  const cap = Math.max(0, ctx.routeCap[route] - ctx.routeUsed[route]);
  const avail = stockQty(ctx.s.companies[from].stock, goodsId);
  const qty = Math.max(0, Math.min(wantQty, cap, avail));
  if (qty === 0) return 0;
  ctx.routeUsed[route] += qty;

  const taken = takeFromStock(ctx.s.companies[from].stock, goodsId, qty);
  const amount = unitPrice * qty;
  const costBasis = taken.unitCost * qty;
  // 内部売買仕訳（現金は動かない：売手 売上/原価、買手 在庫）
  post(ctx, 'TRANSFER', `${route}:${goodsId}`, [
    { account: 'cogs', side: 'debit', amount: costBasis, companyId: from, counterpartyId: to, goodsId },
    { account: 'inventory', side: 'credit', amount: costBasis, companyId: from, goodsId },
    { account: 'sales', side: 'credit', amount, companyId: from, counterpartyId: to, goodsId },
    { account: 'inventory', side: 'debit', amount, companyId: to, counterpartyId: from, goodsId },
  ]);
  mergeLot(ctx.s.companies[to].stock, {
    goodsId, qty, ageMonths: 0, unitCost: unitPrice, groupCost: taken.groupCost,
  });
  ctx.transfers.push({ route, goodsId, qty, unitPrice });

  // 運賃（荷主→ロジ：内部）＋燃料（ロジ→外部）
  const freight = C.FREIGHT_PER_BOX * qty;
  const fuel = Math.round(C.FUEL_PER_BOX * qty * (ctx.s.activeEvent.eventId === 'fuelSpike' ? 1.6 : 1));
  post(ctx, 'FREIGHT', route, [
    { account: 'freight', side: 'debit', amount: freight, companyId: from, counterpartyId: 'logi' },
    { account: 'sales', side: 'credit', amount: freight, companyId: 'logi', counterpartyId: from },
  ]);
  post(ctx, 'FUEL', route, [
    { account: 'freight', side: 'debit', amount: fuel, companyId: 'logi' },
    { account: 'cash', side: 'credit', amount: fuel, companyId: 'logi' },
  ]);
  cashOut(ctx, fuel);
  ctx.extExpense += fuel;
  return qty;
}

/** 加工（外部加工費を払い、入力ロットを出力ロットへ） */
function produce(
  ctx: Ctx, company: CompanyId, inputGoods: GoodsId, inputQty: number,
  outGoods: GoodsId, outQty: number, fee: number, docId: string,
): boolean {
  const st = ctx.s.companies[company].stock;
  if (stockQty(st, inputGoods) < inputQty) return false;
  const taken = takeFromStock(st, inputGoods, inputQty);
  const unitCost = Math.round((taken.unitCost * inputQty + fee) / outQty);
  const groupCost = Math.round((taken.groupCost * inputQty + fee) / outQty);
  post(ctx, 'PROD', docId, [
    { account: 'inventory', side: 'debit', amount: taken.unitCost * inputQty + fee, companyId: company, goodsId: outGoods },
    { account: 'inventory', side: 'credit', amount: taken.unitCost * inputQty, companyId: company, goodsId: inputGoods },
    { account: 'cash', side: 'credit', amount: fee, companyId: company },
  ]);
  cashOut(ctx, fee);
  // 加工費は在庫原価に乗るため extExpense には入れない（売れた時にgroupCogsで効く）
  mergeLot(st, { goodsId: outGoods, qty: outQty, ageMonths: 0, unitCost, groupCost });
  return true;
}

/** 外部販売：ライン需要を在庫比例で配分 */
function sellExternal(ctx: Ctx, orders: MonthlyOrders) {
  const ev = ctx.s.activeEvent.eventId;
  const season = C.SEASON_FACTOR(ctx.month);
  const stance = C.STANCE[orders.priceStance];
  const salesStock = ctx.s.companies.sales.stock;

  for (const line of ['meatLine', 'apparelLine'] as MarketLine[]) {
    let evDemand = 1, evPrice = 1;
    if (ev === 'championSale') { evDemand = 1.8; evPrice = 0.88; }
    if (ev === 'bbqBoom' && line === 'meatLine') evDemand *= 1.4;
    if (ev === 'coldWave' && line === 'apparelLine') evDemand *= 1.5;
    if (ev === 'warmWinter' && line === 'apparelLine') evDemand *= 0.6;

    let demand = Math.round(
      C.BASE_DEMAND[line] * season[line] * ctx.s.ballpark.brandFactor * evDemand * stance.demand,
    );
    demand = Math.min(demand, ctx.s.companies.sales.capacity); // 販売網上限

    const lots = salesStock.filter(l => C.GOODS_LINE[l.goodsId] === line && l.qty > 0);
    const totalQty = lots.reduce((s, l) => s + l.qty, 0);
    if (totalQty === 0 || demand <= 0) continue;

    for (const lot of [...lots]) {
      let q = Math.min(lot.qty, Math.round(demand * (lot.qty / totalQty)));
      if (q <= 0) continue;
      let price = C.RECIPES[lot.goodsId as RecipeId]?.marketPrice
        ?? C.DIRECT_MARKET_PRICE[lot.goodsId] ?? 0;
      price = Math.round(price * stance.price * evPrice);
      if (ev === 'craftBoom' && lot.goodsId === 'yarn') price = Math.round(price * 1.2);
      if (ev === 'championSale' && lot.goodsId === 'muffler') q = Math.min(lot.qty, q + 15);

      const taken = takeFromStock(salesStock, lot.goodsId, q);
      const revenue = price * taken.qty;
      const cogs = taken.unitCost * taken.qty;
      const groupCogs = taken.groupCost * taken.qty;
      post(ctx, 'SELL', `${lot.goodsId}`, [
        { account: 'cash', side: 'debit', amount: revenue, companyId: 'sales' },
        { account: 'sales', side: 'credit', amount: revenue, companyId: 'sales', goodsId: lot.goodsId },
        { account: 'cogs', side: 'debit', amount: cogs, companyId: 'sales', goodsId: lot.goodsId },
        { account: 'inventory', side: 'credit', amount: cogs, companyId: 'sales', goodsId: lot.goodsId },
      ]);
      cashIn(ctx, revenue);
      ctx.soldBoxes += taken.qty;
      ctx.extRevenue += revenue;
      ctx.extGroupCogs += groupCogs;
      ctx.lineRevenue[line] += revenue;
      ctx.lineGroupCogs[line] += groupCogs;
    }
  }
}

export function simulateMonth(
  prev: RunState, orders: MonthlyOrders, opts: EngineOptions = {},
): { next: RunState; result: MonthlyResult } {
  const s: RunState = structuredClone(prev);
  const month = s.month;
  const rng = mulberry32(0); rng.setState(s.rngState);

  // ① メェーズ
  const wasChampion = s.ballpark.leagueChampion && s.ballpark.phase === 'champion';
  s.ballpark = updateBallpark(s.ballpark, month, rng);

  // ② イベント
  s.activeEvent = rollEvent(month, rng, wasChampion, s.gapsTotal);
  s.puzzle = undefined;

  const ctx: Ctx = {
    s, month, opts, cashIn: 0, cashOut: 0,
    routeUsed: Object.fromEntries(C.ROUTES.map(r => [r, 0])) as Record<RouteId, number>,
    routeCap: Object.fromEntries(C.ROUTES.map(r => {
      const trucks = orders.truckAssignment[r] ?? 0;
      let cap = trucks * s.logi.capacityPerTruck;
      if (s.activeEvent.eventId === 'roadWork') cap = Math.floor(cap * 0.8);
      return [r, cap];
    })) as Record<RouteId, number>,
    soldBoxes: 0, disposed: 0,
    lineRevenue: { meatLine: 0, apparelLine: 0 },
    lineGroupCogs: { meatLine: 0, apparelLine: 0 },
    extRevenue: 0, extGroupCogs: 0, extExpense: 0,
    transfers: [],
  };
  // トラック総数チェック（超過割当は比例縮小）
  const assigned = C.ROUTES.reduce((t, r) => t + (orders.truckAssignment[r] ?? 0), 0);
  if (assigned > s.logi.trucks) {
    for (const r of C.ROUTES) {
      ctx.routeCap[r] = Math.floor(ctx.routeCap[r] * s.logi.trucks / assigned);
    }
  }

  // ③ ファーム
  const lambPrice = Math.round(C.LAMB_PRICE * (s.activeEvent.eventId === 'lambCheap' ? 0.6 : 1));
  const room = Math.max(0, s.flock.capacity - totalSheep(s.flock));
  const buy = Math.min(orders.lambsToBuy, room, Math.floor(s.cash / Math.max(1, lambPrice)));
  if (buy > 0) {
    s.flock.lambs += buy;
    post(ctx, 'BUY_LAMB', 'lamb', [
      { account: 'livestock', side: 'debit', amount: C.SHEEP_BOOK_VALUE * buy, companyId: 'farm' },
      { account: 'cash', side: 'credit', amount: lambPrice * buy, companyId: 'farm' },
      ...(lambPrice < C.SHEEP_BOOK_VALUE
        ? [{ account: 'bonusIncome', side: 'credit', amount: (C.SHEEP_BOOK_VALUE - lambPrice) * buy, companyId: 'farm' } as JournalLine]
        : []),
    ].filter(l => l.amount > 0));
    // 相場安の差額は雑収入で調整（帳簿価額800を維持するため）
    if (lambPrice > C.SHEEP_BOOK_VALUE) throw new Error('lamb price above book value not supported');
    cashOut(ctx, lambPrice * buy);
    ctx.extExpense -= (C.SHEEP_BOOK_VALUE - lambPrice) * buy; // bonusIncomeぶん連結に反映
  }

  // エサ代（総頭数）
  const feedUnit = Math.round(C.FEED_PER_SHEEP * (s.activeEvent.eventId === 'feedSpike' ? 1.5 : 1));
  const feed = feedUnit * totalSheep(s.flock);
  if (feed > 0) {
    post(ctx, 'FEED', 'feed', [
      { account: 'feedCost', side: 'debit', amount: feed, companyId: 'farm' },
      { account: 'cash', side: 'credit', amount: feed, companyId: 'farm' },
    ]);
    cashOut(ctx, feed); ctx.extExpense += feed;
  }

  // 毛刈り
  const shearCap = (opts.shearCapacity ?? C.SHEAR_CAPACITY) * (s.activeEvent.eventId === 'shearFes' ? 2 : 1);
  const shearFee = s.activeEvent.eventId === 'shearFes' ? 0 : C.SHEAR_FEE;
  const sheared = Math.max(0, Math.min(orders.sheepToShear, s.flock.ready, shearCap));
  if (sheared > 0) {
    const fee = shearFee * sheared;
    post(ctx, 'SHEAR', 'shear', [
      { account: 'inventory', side: 'debit', amount: Math.max(fee, sheared), companyId: 'farm', goodsId: 'wool' },
      ...(fee > 0
        ? [{ account: 'cash', side: 'credit', amount: fee, companyId: 'farm' } as JournalLine]
        : [{ account: 'bonusIncome', side: 'credit', amount: sheared, companyId: 'farm' } as JournalLine]),
    ]);
    if (fee > 0) { cashOut(ctx, fee); }
    const unit = Math.max(1, shearFee); // 原価は刈毛費のみ（フェス時は名目1G）
    mergeLot(s.companies.farm.stock, { goodsId: 'wool', qty: sheared, ageMonths: 0, unitCost: unit, groupCost: unit });
    s.flock.ready -= sheared;
  }

  // 出荷（肉行き）：livestock→farm在庫のsheepロット化
  const { flock: afterShip, shipped } = shipSheep(s.flock, Math.max(0, orders.sheepToShip));
  s.flock = afterShip;
  if (shipped > 0) {
    post(ctx, 'PROD', 'sheep-to-stock', [
      { account: 'inventory', side: 'debit', amount: C.SHEEP_BOOK_VALUE * shipped, companyId: 'farm', goodsId: 'sheep' },
      { account: 'livestock', side: 'credit', amount: C.SHEEP_BOOK_VALUE * shipped, companyId: 'farm' },
    ]);
    mergeLot(s.companies.farm.stock, {
      goodsId: 'sheep', qty: shipped, ageMonths: 0,
      unitCost: C.SHEEP_BOOK_VALUE, groupCost: C.SHEEP_BOOK_VALUE,
    });
  }

  // ④ 輸送＆生産（上流→下流の一筆書き：当月生産分は当月中に流せる）
  transfer(ctx, 'farm-meat', 'sheep', shipped + stockQty(s.companies.farm.stock, 'sheep'), C.TRANSFER_PRICE.sheep!);
  transfer(ctx, 'farm-wool', 'wool', stockQty(s.companies.farm.stock, 'wool'), C.TRANSFER_PRICE.wool!);

  // ミート：と畜
  let lineTroubleTarget: CompanyId | null = null;
  if (s.activeEvent.eventId === 'lineTrouble') lineTroubleTarget = rng.next() < 0.5 ? 'delica' : 'apparel';
  const meatCap = s.companies.meat.capacity;
  const toSlaughter = Math.min(orders.slaughterQty, meatCap, stockQty(s.companies.meat.stock, 'sheep'));
  for (let i = 0; i < toSlaughter; i++) {
    produce(ctx, 'meat', 'sheep', 1, 'lambMeat', C.MEAT_PER_SHEEP, C.SLAUGHTER_FEE_PER_SHEEP, 'slaughter');
  }
  // ラム肉の直販/加工回し
  const meatAvail = stockQty(s.companies.meat.stock, 'lambMeat');
  const direct = Math.round(meatAvail * Math.min(1, Math.max(0, orders.meatDirectRatio)));
  transfer(ctx, 'meat-sales', 'lambMeat', direct, C.TRANSFER_PRICE.lambMeat!);
  transfer(ctx, 'meat-delica', 'lambMeat', stockQty(s.companies.meat.stock, 'lambMeat'), C.TRANSFER_PRICE.lambMeat!);

  // デリカ：レシピ加工
  let delicaCap = s.companies.delica.capacity;
  if (lineTroubleTarget === 'delica') delicaCap = Math.floor(delicaCap / 2);
  let delicaMade = 0;
  for (const rid of C.MEAT_RECIPES) {
    const want = orders.meatRecipes[rid] ?? 0;
    const def = C.RECIPES[rid];
    for (let i = 0; i < want && delicaMade < delicaCap; i++) {
      if (!produce(ctx, 'delica', def.inputGoods, def.inputQty, rid, 1, def.fee, rid)) break;
      delicaMade++;
    }
  }
  for (const rid of C.MEAT_RECIPES) {
    transfer(ctx, 'delica-sales', rid, stockQty(s.companies.delica.stock, rid),
      Math.round(C.RECIPES[rid].marketPrice * C.SALES_TRANSFER_RATIO));
  }

  // ウール：紡績
  const woolCap = s.companies.wool.capacity;
  const toSpin = Math.min(orders.spinQty, woolCap, stockQty(s.companies.wool.stock, 'wool'));
  for (let i = 0; i < toSpin; i++) {
    produce(ctx, 'wool', 'wool', 1, 'yarn', C.YARN_PER_WOOL, C.SPIN_FEE_PER_YARN * C.YARN_PER_WOOL, 'spin');
  }
  // 糸の直販（apparel-sales容量を共用）と縫製回し
  const yarnAvail = stockQty(s.companies.wool.stock, 'yarn');
  const yarnDirect = Math.round(yarnAvail * Math.min(1, Math.max(0, orders.yarnDirectRatio)));
  // 直販分：wool→sales（apparel-sales帯域を消費）
  if (yarnDirect > 0) {
    const cap = Math.max(0, ctx.routeCap['apparel-sales'] - ctx.routeUsed['apparel-sales']);
    const q = Math.min(yarnDirect, cap);
    if (q > 0) {
      // 便宜上 wool→sales の直接内部売買として記帳（帯域はapparel-salesを消費）
      const taken = takeFromStock(s.companies.wool.stock, 'yarn', q);
      const price = C.TRANSFER_PRICE.yarn!;
      ctx.routeUsed['apparel-sales'] += q;
      post(ctx, 'TRANSFER', 'wool-sales:yarn', [
        { account: 'cogs', side: 'debit', amount: taken.unitCost * q, companyId: 'wool', counterpartyId: 'sales', goodsId: 'yarn' },
        { account: 'inventory', side: 'credit', amount: taken.unitCost * q, companyId: 'wool', goodsId: 'yarn' },
        { account: 'sales', side: 'credit', amount: price * q, companyId: 'wool', counterpartyId: 'sales', goodsId: 'yarn' },
        { account: 'inventory', side: 'debit', amount: price * q, companyId: 'sales', counterpartyId: 'wool', goodsId: 'yarn' },
      ]);
      mergeLot(s.companies.sales.stock, { goodsId: 'yarn', qty: q, ageMonths: 0, unitCost: price, groupCost: taken.groupCost });
      ctx.transfers.push({ route: 'apparel-sales', goodsId: 'yarn', qty: q, unitPrice: price });
      const freight = C.FREIGHT_PER_BOX * q;
      const fuel = Math.round(C.FUEL_PER_BOX * q * (s.activeEvent.eventId === 'fuelSpike' ? 1.6 : 1));
      post(ctx, 'FREIGHT', 'wool-sales', [
        { account: 'freight', side: 'debit', amount: freight, companyId: 'wool', counterpartyId: 'logi' },
        { account: 'sales', side: 'credit', amount: freight, companyId: 'logi', counterpartyId: 'wool' },
      ]);
      post(ctx, 'FUEL', 'wool-sales', [
        { account: 'freight', side: 'debit', amount: fuel, companyId: 'logi' },
        { account: 'cash', side: 'credit', amount: fuel, companyId: 'logi' },
      ]);
      cashOut(ctx, fuel); ctx.extExpense += fuel;
    }
  }
  transfer(ctx, 'wool-apparel', 'yarn', stockQty(s.companies.wool.stock, 'yarn'), C.TRANSFER_PRICE.yarn!);

  // アパレル：縫製
  let apparelCap = s.companies.apparel.capacity;
  if (lineTroubleTarget === 'apparel') apparelCap = Math.floor(apparelCap / 2);
  let apparelMade = 0;
  for (const rid of C.APPAREL_RECIPES) {
    const want = orders.apparelRecipes[rid] ?? 0;
    const def = C.RECIPES[rid];
    for (let i = 0; i < want && apparelMade < apparelCap; i++) {
      if (!produce(ctx, 'apparel', def.inputGoods, def.inputQty, rid, 1, def.fee, rid)) break;
      apparelMade++;
    }
  }
  for (const rid of C.APPAREL_RECIPES) {
    transfer(ctx, 'apparel-sales', rid, stockQty(s.companies.apparel.stock, rid),
      Math.round(C.RECIPES[rid].marketPrice * C.SALES_TRANSFER_RATIO));
  }

  // ⑤ 外部販売（tvFeature：ランダム商品需要↑は簡略化で需要係数に織込済…P1では対象商品を全ライン+20%）
  if (s.activeEvent.eventId === 'tvFeature') {
    // 簡略化：当月の基礎需要+20%相当をブランド係数に乗せる
    s.ballpark = { ...s.ballpark, brandFactor: s.ballpark.brandFactor * 1.2 };
  }
  sellExternal(ctx, orders);

  // ⑥ 固定費
  post(ctx, 'FIXED', 'fixed', [
    { account: 'fixedCost', side: 'debit', amount: C.FIXED_COST_MONTHLY, companyId: 'hq' },
    { account: 'cash', side: 'credit', amount: C.FIXED_COST_MONTHLY, companyId: 'hq' },
  ]);
  cashOut(ctx, C.FIXED_COST_MONTHLY); ctx.extExpense += C.FIXED_COST_MONTHLY;

  // ⑦ 鮮度・廃棄（肉系のみ。全社の在庫を加齢）
  const life = (opts.freshLifeMeat ?? C.FRESH_LIFE_MEAT) + (opts.fridge ? 1 : 0);
  for (const cid of Object.keys(s.companies) as CompanyId[]) {
    const st = s.companies[cid].stock;
    for (const lot of [...st]) {
      lot.ageMonths++;
      if (C.PERISHABLE.includes(lot.goodsId) && lot.ageMonths >= life) {
        post(ctx, 'DISPOSE', `${cid}:${lot.goodsId}`, [
          { account: 'disposalLoss', side: 'debit', amount: lot.unitCost * lot.qty, companyId: cid, goodsId: lot.goodsId },
          { account: 'inventory', side: 'credit', amount: lot.unitCost * lot.qty, companyId: cid, goodsId: lot.goodsId },
        ]);
        ctx.disposed += lot.qty;
        ctx.extExpense += lot.groupCost * lot.qty; // 連結には真実原価で効く
        st.splice(st.indexOf(lot), 1);
      }
    }
  }
  s.disposedTotal += ctx.disposed;

  // 群れシフト（毛刈りクールダウン）
  s.flock = shiftFlock(s.flock, sheared);

  // ズレ探しパズル生成
  if (s.activeEvent.eventId === 'ledgerGap' && ctx.transfers.length > 0) {
    s.puzzle = generatePuzzle(ctx.transfers, rng, s.gapsTotal);
    s.gapsTotal++;
  }

  // ⑧ 月次結果
  const companies: CompanyId[] = ['farm', 'meat', 'delica', 'wool', 'apparel', 'sales', 'logi', 'hq'];
  const companyPLs = monthlyPL(s.journal, month, companies);
  const simpleSum = companyPLs.reduce((t, p) => t + p.profit, 0);
  const consolidated = ctx.extRevenue - ctx.extGroupCogs - ctx.extExpense;
  const result: MonthlyResult = {
    month,
    companyPLs,
    simpleSum,
    eliminations: simpleSum - consolidated,
    consolidatedProfit: consolidated,
    lineRevenue: ctx.lineRevenue,
    lineGroupProfit: {
      meatLine: ctx.lineRevenue.meatLine - ctx.lineGroupCogs.meatLine,
      apparelLine: ctx.lineRevenue.apparelLine - ctx.lineGroupCogs.apparelLine,
    },
    cashIn: ctx.cashIn,
    cashOut: ctx.cashOut,
    cashEnd: s.cash,
    disposedBoxes: ctx.disposed,
    sheepCount: totalSheep(s.flock),
    soldBoxes: ctx.soldBoxes,
    eventId: s.activeEvent.eventId,
    ballparkNews: s.ballpark.newsLog[s.ballpark.newsLog.length - 1] ?? '',
  };
  s.history.push(result);
  if (s.cash < 0) s.bankrupt = true;
  s.month++;
  s.rngState = rng.getState();
  return { next: s, result };
}

// ── 初期状態 ──
export function initRun(seed: number): RunState {
  const companies = {} as RunState['companies'];
  for (const cid of ['farm','meat','delica','wool','apparel','sales','logi','hq'] as CompanyId[]) {
    companies[cid] = { id: cid, capacity: C.COMPANY_CAPACITY[cid], stock: [] as StockLot[] };
  }
  const rng = mulberry32(seed);
  return {
    month: 0,
    cash: C.INITIAL_CASH,
    journal: [],
    flock: { ready: 5, cd1: 0, cd2: 0, lambs: 0, capacity: C.FLOCK_CAPACITY },
    companies,
    logi: { trucks: C.TRUCKS_INITIAL, capacityPerTruck: C.TRUCK_LOAD },
    ballpark: { teamPower: 50, savings: 0, standing: 4, brandFactor: 1, phase: 'pennant', headerLabel: '開幕！', leagueChampion: false, japanChampion: false, newsLog: [] },
    activeEvent: { eventId: 'none' },
    history: [],
    disposedTotal: 0,
    gapsFound: 0,
    gapsTotal: 0,
    bankrupt: false,
    rngState: rng.getState(),
  };
}
