import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';
import { branchFilterFor } from './scopeService.js';
import { getBaseCurrency } from './currencyService.js';

/**
 * Financial statements (التقارير المالية) — read from the posted general
 * ledger only. Everything is presented in the base currency (debit_base /
 * credit_base), which the posting engine froze at each document's exchange
 * rate. Closed-period figures are stable because posted entries are immutable
 * (corrections are reversal entries, never edits).
 *
 * Account-type sign convention (natural balance):
 *   asset, expense   → debit-positive   (balance = Σdebit − Σcredit)
 *   liability, equity, revenue → credit-positive (balance = Σcredit − Σdebit)
 */

const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Resolve the branch scope for a financial query (mirrors reportService). */
function resolveBranch(filters, actingUser) {
  const allowed = branchFilterFor(actingUser);
  if (allowed === null) return filters.branchId ? Number(filters.branchId) : null;
  if (allowed.length === 0) return -1; // no access → empty
  return Number(allowed[0]);
}

/** Build the shared WHERE fragment for posted lines within scope + range. */
function entryConditions({ branchId, from, to, upTo }) {
  const conds = [sql`e.status = 'posted'`];
  if (branchId === -1) conds.push(sql`1 = 0`);
  else if (branchId != null) conds.push(sql`e.branch_id = ${branchId}`);
  if (from) conds.push(sql`e.entry_date >= ${from}`);
  if (to) conds.push(sql`e.entry_date <= ${to}`);
  if (upTo) conds.push(sql`e.entry_date <= ${upTo}`);
  return sql.join(conds, sql` AND `);
}

export class FinancialReportService {
  /**
   * ميزان المراجعة — Trial balance. One row per postable account with its net
   * debit/credit (base). Totals must balance. Date range optional (omit for
   * inception-to-date).
   */
  async getTrialBalance(filters = {}, actingUser = null) {
    const db = await getDb();
    const branchId = resolveBranch(filters, actingUser);
    const from = ymd(filters.dateFrom);
    const to = ymd(filters.dateTo);
    const where = entryConditions({ branchId, from, to });
    const baseCurrency = await getBaseCurrency().catch(() => null);

    const res = await db.execute(sql`
      SELECT a.id, a.code, a.name, a.account_type,
             COALESCE(SUM(l.debit_base::numeric), 0)  AS debit,
             COALESCE(SUM(l.credit_base::numeric), 0) AS credit
      FROM accounts a
      JOIN journal_entry_lines l ON l.account_id = a.id
      JOIN journal_entries e     ON e.id = l.journal_entry_id
      WHERE ${where}
      GROUP BY a.id, a.code, a.name, a.account_type
      HAVING COALESCE(SUM(l.debit_base::numeric), 0) <> 0
          OR COALESCE(SUM(l.credit_base::numeric), 0) <> 0
      ORDER BY a.code
    `);
    const rows = res.rows ?? res;

    let totalDebit = 0;
    let totalCredit = 0;
    const accounts = rows.map((r) => {
      const debit = n(r.debit);
      const credit = n(r.credit);
      const net = debit - credit;
      // Present the net on its natural side.
      const debitBalance = net > 0 ? net : 0;
      const creditBalance = net < 0 ? -net : 0;
      totalDebit += debitBalance;
      totalCredit += creditBalance;
      return {
        accountId: r.id,
        code: r.code,
        name: r.name,
        accountType: r.account_type,
        debit: debitBalance,
        credit: creditBalance,
      };
    });

    return {
      baseCurrency: baseCurrency?.currencyCode || 'IQD',
      filters: { dateFrom: from, dateTo: to, branchId },
      accounts,
      totals: {
        debit: Math.round(totalDebit * 10000) / 10000,
        credit: Math.round(totalCredit * 10000) / 10000,
        balanced: Math.abs(totalDebit - totalCredit) < 0.5,
      },
    };
  }

  /**
   * دفتر الأستاذ — General ledger for ONE account: opening balance (everything
   * before dateFrom), the in-range lines with a running balance, and the
   * closing balance. `signed` reflects the account's natural side.
   */
  async getAccountLedger(filters = {}, actingUser = null) {
    const accountId = Number(filters.accountId);
    if (!accountId) throw new Error('accountId is required');
    return this._ledgerCore({ ...filters, accountId, partyType: null, partyId: null }, actingUser);
  }

  /**
   * كشف حساب — Account statement. Same shape as the ledger but can be filtered
   * to a single party (customer/supplier) across the AR/AP control account, so
   * "كشف حساب العميل" shows only that customer's movements.
   */
  async getAccountStatement(filters = {}, actingUser = null) {
    return this._ledgerCore(
      {
        ...filters,
        accountId: filters.accountId ? Number(filters.accountId) : null,
        partyType: filters.partyType || null,
        partyId: filters.partyId ? Number(filters.partyId) : null,
      },
      actingUser
    );
  }

  async _ledgerCore({ accountId, partyType, partyId, dateFrom, dateTo, branchId: reqBranch }, actingUser) {
    const db = await getDb();
    const branchId = resolveBranch({ branchId: reqBranch }, actingUser);
    const from = ymd(dateFrom);
    const to = ymd(dateTo);

    const partyFilter = partyType && partyId
      ? sql` AND l.party_type = ${partyType} AND l.party_id = ${partyId}`
      : sql``;
    const accountFilter = accountId ? sql` AND l.account_id = ${accountId}` : sql``;
    const scope = (extra) => sql.join(
      [entryConditions({ branchId, ...extra }), sql`TRUE${accountFilter}${partyFilter}`],
      sql` AND `
    );

    // Opening balance: net of every posted line strictly before `from`.
    let opening = 0;
    if (from) {
      const res = await db.execute(sql`
        SELECT COALESCE(SUM(l.debit_base::numeric - l.credit_base::numeric), 0) AS bal
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id
        WHERE ${scope({ to: ymd(new Date(new Date(from).getTime() - 86400000)) })}
      `);
      opening = n((res.rows ?? res)[0]?.bal);
    }

    const linesRes = await db.execute(sql`
      SELECT e.id AS entry_id, e.entry_number, e.entry_date, e.source_type, e.description AS entry_desc,
             l.debit_base AS debit, l.credit_base AS credit, l.description AS line_desc,
             a.code AS account_code, a.name AS account_name
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id
      JOIN accounts a        ON a.id = l.account_id
      WHERE ${scope({ from, to })}
      ORDER BY e.entry_date, e.id, l.line_no
    `);
    const lineRows = linesRes.rows ?? linesRes;

    let running = opening;
    const lines = lineRows.map((r) => {
      const debit = n(r.debit);
      const credit = n(r.credit);
      running += debit - credit;
      return {
        entryId: r.entry_id,
        entryNumber: r.entry_number,
        entryDate: r.entry_date,
        sourceType: r.source_type,
        accountCode: r.account_code,
        accountName: r.account_name,
        description: r.line_desc || r.entry_desc,
        debit,
        credit,
        balance: Math.round(running * 10000) / 10000,
      };
    });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    return {
      filters: { accountId, partyType, partyId, dateFrom: from, dateTo: to, branchId },
      opening: Math.round(opening * 10000) / 10000,
      lines,
      totals: {
        debit: Math.round(totalDebit * 10000) / 10000,
        credit: Math.round(totalCredit * 10000) / 10000,
        closing: Math.round(running * 10000) / 10000,
      },
    };
  }

  /**
   * قائمة الدخل — Income statement. Revenue (credit-positive) − expenses
   * (debit-positive) = net profit, for the date range.
   */
  async getIncomeStatement(filters = {}, actingUser = null) {
    const db = await getDb();
    const branchId = resolveBranch(filters, actingUser);
    const from = ymd(filters.dateFrom);
    const to = ymd(filters.dateTo);
    const where = entryConditions({ branchId, from, to });

    const res = await db.execute(sql`
      SELECT a.id, a.code, a.name, a.account_type,
             COALESCE(SUM(l.credit_base::numeric - l.debit_base::numeric), 0) AS credit_net,
             COALESCE(SUM(l.debit_base::numeric - l.credit_base::numeric), 0) AS debit_net
      FROM accounts a
      JOIN journal_entry_lines l ON l.account_id = a.id
      JOIN journal_entries e     ON e.id = l.journal_entry_id
      WHERE ${where} AND a.account_type IN ('revenue', 'expense')
      GROUP BY a.id, a.code, a.name, a.account_type
      ORDER BY a.code
    `);
    const rows = res.rows ?? res;

    const revenue = [];
    const expenses = [];
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const r of rows) {
      if (r.account_type === 'revenue') {
        const amount = n(r.credit_net);
        if (amount === 0) continue;
        revenue.push({ code: r.code, name: r.name, amount });
        totalRevenue += amount;
      } else {
        const amount = n(r.debit_net);
        if (amount === 0) continue;
        expenses.push({ code: r.code, name: r.name, amount });
        totalExpenses += amount;
      }
    }

    return {
      filters: { dateFrom: from, dateTo: to, branchId },
      revenue,
      expenses,
      totals: {
        revenue: Math.round(totalRevenue * 10000) / 10000,
        expenses: Math.round(totalExpenses * 10000) / 10000,
        netProfit: Math.round((totalRevenue - totalExpenses) * 10000) / 10000,
      },
    };
  }

  /**
   * الميزانية العمومية — Balance sheet AS OF a date. Assets = Liabilities +
   * Equity + current-period net income (virtual retained earnings, since we
   * don't post year-end closing entries). Date defaults to today.
   */
  async getBalanceSheet(filters = {}, actingUser = null) {
    const db = await getDb();
    const branchId = resolveBranch(filters, actingUser);
    const asOf = ymd(filters.asOf) || ymd(new Date());
    const where = entryConditions({ branchId, upTo: asOf });

    const res = await db.execute(sql`
      SELECT a.id, a.code, a.name, a.account_type,
             COALESCE(SUM(l.debit_base::numeric - l.credit_base::numeric), 0) AS net_debit
      FROM accounts a
      JOIN journal_entry_lines l ON l.account_id = a.id
      JOIN journal_entries e     ON e.id = l.journal_entry_id
      WHERE ${where}
      GROUP BY a.id, a.code, a.name, a.account_type
      ORDER BY a.code
    `);
    const rows = res.rows ?? res;

    const assets = [];
    const liabilities = [];
    const equity = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let netIncome = 0; // revenue − expenses (credit-positive)

    for (const r of rows) {
      const netDebit = n(r.net_debit); // +debit / −credit
      const entry = { code: r.code, name: r.name };
      switch (r.account_type) {
        case 'asset':
          if (netDebit === 0) break;
          assets.push({ ...entry, amount: netDebit });
          totalAssets += netDebit;
          break;
        case 'liability':
          if (-netDebit === 0) break;
          liabilities.push({ ...entry, amount: -netDebit });
          totalLiabilities += -netDebit;
          break;
        case 'equity':
          if (-netDebit === 0) break;
          equity.push({ ...entry, amount: -netDebit });
          totalEquity += -netDebit;
          break;
        case 'revenue':
          netIncome += -netDebit;
          break;
        case 'expense':
          netIncome -= netDebit;
          break;
        default:
          break;
      }
    }

    // Current-period profit lands in equity as retained earnings (virtual).
    const round = (x) => Math.round(x * 10000) / 10000;
    const retained = round(netIncome);
    if (retained !== 0) {
      equity.push({ code: '—', name: 'صافي ربح الفترة (أرباح محتجزة)', amount: retained, virtual: true });
      totalEquity += retained;
    }

    return {
      filters: { asOf, branchId },
      assets,
      liabilities,
      equity,
      totals: {
        assets: round(totalAssets),
        liabilities: round(totalLiabilities),
        equity: round(totalEquity),
        liabilitiesAndEquity: round(totalLiabilities + totalEquity),
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.5,
      },
    };
  }
}

export default new FinancialReportService();
