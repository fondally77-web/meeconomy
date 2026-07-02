/** 仕訳エンジン — 仕訳が唯一の真実。
 *  - postEntry: 貸借一致をバリデーション（不一致は throw）
 *  - balance: 勘定残高の導出
 *  - monthlyPL: 月次の各社P/L（振替価格ベース＝会社視点）
 *  - 連結利益は simulateMonth 側で「外部売上 − グループ真実原価 − 外部経費」で算出し、
 *    eliminations = 単純合計 − 連結 として表示する（未実現利益の消去を含む）
 */
import type {
  AccountId, CompanyId, CompanyPL, JournalEntry, JournalLine,
} from '../types.js';

let entrySeq = 0;
export function resetEntrySeq() { entrySeq = 0; }

export function makeEntry(
  month: number,
  sourceDoc: JournalEntry['sourceDoc'],
  lines: JournalLine[],
): JournalEntry {
  const entry: JournalEntry = { id: `JE${String(++entrySeq).padStart(5, '0')}`, month, sourceDoc, lines };
  validateEntry(entry);
  return entry;
}

export function validateEntry(e: JournalEntry): void {
  let debit = 0, credit = 0;
  for (const l of e.lines) {
    if (!Number.isFinite(l.amount) || l.amount < 0) {
      throw new Error(`invalid amount in ${e.id}: ${l.amount}`);
    }
    if (l.side === 'debit') debit += l.amount; else credit += l.amount;
  }
  if (Math.round(debit) !== Math.round(credit)) {
    throw new Error(`unbalanced entry ${e.id} (${e.sourceDoc.type}): D${debit} C${credit}`);
  }
}

export function balance(
  entries: JournalEntry[],
  account: AccountId,
  opts?: { companyId?: CompanyId; month?: number },
): number {
  let v = 0;
  for (const e of entries) {
    if (opts?.month !== undefined && e.month !== opts.month) continue;
    for (const l of e.lines) {
      if (l.account !== account) continue;
      if (opts?.companyId && l.companyId !== opts.companyId) continue;
      v += l.side === 'debit' ? l.amount : -l.amount;
    }
  }
  return v;
}

const REVENUE_ACCOUNTS: AccountId[] = ['sales', 'bonusIncome'];
const EXPENSE_ACCOUNTS: AccountId[] = [
  'cogs', 'processingCost', 'feedCost', 'freight', 'fixedCost', 'disposalLoss',
];

/** 月次の各社P/L（会社視点：内部売上を含む） */
export function monthlyPL(entries: JournalEntry[], month: number, companies: CompanyId[]): CompanyPL[] {
  const pls: CompanyPL[] = [];
  for (const c of companies) {
    let revenue = 0, cost = 0;
    for (const e of entries) {
      if (e.month !== month) continue;
      for (const l of e.lines) {
        if (l.companyId !== c) continue;
        if (REVENUE_ACCOUNTS.includes(l.account)) revenue += l.side === 'credit' ? l.amount : -l.amount;
        if (EXPENSE_ACCOUNTS.includes(l.account)) cost += l.side === 'debit' ? l.amount : -l.amount;
      }
    }
    pls.push({ companyId: c, revenue, cost, profit: revenue - cost });
  }
  return pls;
}

/** 内部売上合計（counterpartyId 付きの sales credit）— 表示・検証用 */
export function internalSales(entries: JournalEntry[], month: number): number {
  let v = 0;
  for (const e of entries) {
    if (e.month !== month) continue;
    for (const l of e.lines) {
      if (l.account === 'sales' && l.side === 'credit' && l.counterpartyId) v += l.amount;
    }
  }
  return v;
}
