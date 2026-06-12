import { getPool } from '../db.js';
import { branchFilterFor } from './scopeService.js';
import { isFeatureEnabled } from './featureFlagsService.js';

/**
 * "Quick question" POS/accounting reports (الأسئلة السريعة) — the data behind the
 * standalone report windows opened from the dashboard cards. Each method returns
 * a uniform `{ summary, rows, meta }` shape so the report-window shell can render
 * big-number cards + a detail table the same way for every report.
 *
 * All money is summed as-is (the seed/business runs in IQD). Every query is
 * branch-scoped through `branchFilterFor` so a branch-bound user only ever sees
 * their own branch, and a global admin may optionally filter by branch.
 *
 * Financial accuracy: sales totals come straight from `sales`, COGS from the
 * per-line cost snapshot (`sale_items.unit_cost_price`, falling back to the
 * product base cost for legacy rows), returns from `sale_returns`, expenses from
 * `expenses`, and cash from `payments`/`expenses`/`sale_returns` — so the
 * numbers reconcile with invoices, returns, expenses and payments.
 */

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/** Clamp pagination to sane bounds. */
function paging(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Resolve the branch a report must be scoped to:
 *   - global admin → the requested branchId, or null (= all branches);
 *   - branch-bound user → ALWAYS their own branch (request ignored);
 *   - user with no branch → -1 (sentinel → empty result).
 */
function effectiveBranch(actingUser, requestedBranchId) {
  const allowed = branchFilterFor(actingUser);
  if (allowed === null) return requestedBranchId ? Number(requestedBranchId) : null;
  if (allowed.length === 0) return -1;
  return Number(allowed[0]);
}

/** Per-line COGS expression (snapshot cost → fallback to product base cost). */
const LINE_COGS = `
  CASE WHEN si.unit_cost_price IS NOT NULL
       THEN si.unit_cost_price::numeric * si.quantity
       ELSE COALESCE(p.cost_price::numeric, 0) * COALESCE(NULLIF(si.base_quantity,0), si.quantity)
  END`;

class PosReportsService {
  // ── 1) شكد بعت؟ — Sales report ─────────────────────────────────────────────
  async sales(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = ['COALESCE(s.is_opening_balance,false) = false'];
    const args = [];
    const add = (cond, val) => { args.push(val); where.push(cond.replace('$$', `$${args.length}`)); };
    if (branch !== null) add('s.branch_id = $$', branch);
    if (filters.from) add('s.created_at::date >= $$', filters.from);
    if (filters.to) add('s.created_at::date <= $$', filters.to);
    if (filters.search) {
      args.push(`%${filters.search}%`); const p1 = args.length;
      args.push(`%${filters.search}%`); const p2 = args.length;
      where.push(`(s.invoice_number ILIKE $${p1} OR c.name ILIKE $${p2})`);
    }
    const W = where.join(' AND ');
    const FROM = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id`;

    const [summary] = (await pool.query(
      `SELECT COUNT(*)::int invoices,
              COALESCE(SUM(s.total),0) total_sales,
              COALESCE(SUM(s.discount),0) invoice_discounts,
              COALESCE(SUM(s.paid_amount),0) paid,
              COALESCE(SUM(s.remaining_amount),0) remaining
       ${FROM} WHERE ${W}`,
      args
    )).rows;
    // Per-line discounts (reduce subtotal at line level) summed over the same scope.
    const [{ line_discounts }] = (await pool.query(
      `SELECT COALESCE(SUM(si.discount),0) line_discounts
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id WHERE ${W}`,
      args
    )).rows;

    const total = num(summary.invoices);
    const rows = (await pool.query(
      `SELECT s.invoice_number, s.created_at, COALESCE(c.name,'زبون نقدي') customer_name,
              s.total, s.paid_amount, s.remaining_amount, s.payment_type, s.status
       ${FROM} WHERE ${W}
       ORDER BY s.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      args
    )).rows;

    const totalSales = num(summary.total_sales);
    const discounts = num(summary.invoice_discounts) + num(line_discounts);
    return {
      summary: {
        totalSales,
        invoices: total,
        discounts,
        netSales: totalSales,
        paid: num(summary.paid),
        remaining: num(summary.remaining),
      },
      rows,
      meta: { page, limit, total },
    };
  }

  // ── 2) شكد ربحت؟ — Profit report ───────────────────────────────────────────
  async profit(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const sWhere = ['COALESCE(s.is_opening_balance,false) = false'];
    const a = [];
    const addS = (cond, val) => { a.push(val); sWhere.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) addS('s.branch_id = $$', branch);
    if (filters.from) addS('s.created_at::date >= $$', filters.from);
    if (filters.to) addS('s.created_at::date <= $$', filters.to);
    const SW = sWhere.join(' AND ');

    // Revenue + COGS sold
    const [rev] = (await pool.query(
      `SELECT COALESCE(SUM(s.total),0) gross_sales
       FROM sales s WHERE ${SW}`, a
    )).rows;
    const [cogsSold] = (await pool.query(
      `SELECT COALESCE(SUM(${LINE_COGS}),0) cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE ${SW}`, a
    )).rows;

    // Returns (value + COGS) — scoped the same way via sale_returns.created_at
    const rWhere = [];
    const ra = [];
    const addR = (cond, val) => { ra.push(val); rWhere.push(cond.replace('$$', `$${ra.length}`)); };
    if (branch !== null) addR('sr.branch_id = $$', branch);
    if (filters.from) addR('sr.created_at::date >= $$', filters.from);
    if (filters.to) addR('sr.created_at::date <= $$', filters.to);
    const RW = rWhere.length ? 'WHERE ' + rWhere.join(' AND ') : '';
    const [ret] = (await pool.query(
      `SELECT COALESCE(SUM(sr.returned_value),0) returned_value FROM sale_returns sr ${RW}`, ra
    )).rows;
    const retCogsWhere = rWhere.slice();
    const [retCogs] = (await pool.query(
      `SELECT COALESCE(SUM(
                CASE WHEN si.unit_cost_price IS NOT NULL
                     THEN si.unit_cost_price::numeric * sri.quantity
                     ELSE COALESCE(p.cost_price::numeric,0) * COALESCE(NULLIF(sri.base_quantity,0), sri.quantity)
                END),0) cogs
       FROM sale_return_items sri
       JOIN sale_returns sr ON sr.id = sri.return_id
       LEFT JOIN sale_items si ON si.id = sri.sale_item_id
       LEFT JOIN products p ON p.id = sri.product_id
       ${retCogsWhere.length ? 'WHERE ' + retCogsWhere.join(' AND ') : ''}`, ra
    )).rows;

    // Expenses
    const eWhere = [];
    const ea = [];
    const addE = (cond, val) => { ea.push(val); eWhere.push(cond.replace('$$', `$${ea.length}`)); };
    if (branch !== null) addE('e.branch_id = $$', branch);
    if (filters.from) addE('e.expense_date >= $$', filters.from);
    if (filters.to) addE('e.expense_date <= $$', filters.to);
    const EW = eWhere.length ? 'WHERE ' + eWhere.join(' AND ') : '';
    const [exp] = (await pool.query(
      `SELECT COALESCE(SUM(e.amount),0) expenses FROM expenses e ${EW}`, ea
    )).rows;

    const grossSales = num(rev.gross_sales);
    const returnedValue = num(ret.returned_value);
    const netSales = grossSales - returnedValue;
    const cogsNet = num(cogsSold.cogs) - num(retCogs.cogs);
    const expensesTotal = num(exp.expenses);
    const grossProfit = netSales - cogsNet;
    const netProfit = grossProfit - expensesTotal;

    // Detail by product (paginated)
    const [{ cnt }] = (await pool.query(
      `SELECT COUNT(*)::int cnt FROM (
        SELECT si.product_id FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE ${SW} GROUP BY si.product_id
      ) t`, a
    )).rows;
    const detail = (await pool.query(
      `SELECT COALESCE(si.product_name, p.name) product_name, p.sku,
              SUM(si.base_quantity) qty,
              SUM(si.subtotal) sales,
              SUM(${LINE_COGS}) cogs,
              SUM(si.subtotal) - SUM(${LINE_COGS}) profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE ${SW}
       GROUP BY si.product_id, COALESCE(si.product_name, p.name), p.sku
       ORDER BY profit DESC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    return {
      summary: {
        grossSales, returnedValue, netSales,
        cogs: cogsNet, expenses: expensesTotal, grossProfit, netProfit,
      },
      rows: detail,
      meta: { page, limit, total: num(cnt) },
    };
  }

  // ── 3) شنو أكثر بضاعة تنباع؟ — Top products ────────────────────────────────
  async topProducts(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = ['COALESCE(s.is_opening_balance,false) = false'];
    const a = [];
    const add = (cond, val) => { a.push(val); where.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) add('s.branch_id = $$', branch);
    if (filters.from) add('s.created_at::date >= $$', filters.from);
    if (filters.to) add('s.created_at::date <= $$', filters.to);
    if (filters.search) {
      a.push(`%${filters.search}%`); const p1 = a.length;
      a.push(`%${filters.search}%`); const p2 = a.length;
      a.push(`%${filters.search}%`); const p3 = a.length;
      where.push(`(COALESCE(si.product_name,p.name) ILIKE $${p1} OR p.sku ILIKE $${p2} OR p.barcode ILIKE $${p3})`);
    }
    const W = where.join(' AND ');

    const [{ cnt }] = (await pool.query(
      `SELECT COUNT(*)::int cnt FROM (
        SELECT si.product_id FROM sale_items si JOIN sales s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE ${W} GROUP BY si.product_id
      ) t`, a
    )).rows;

    const rows = (await pool.query(
      `SELECT COALESCE(si.product_name, p.name) product_name, p.sku, p.barcode,
              SUM(si.base_quantity) qty_sold,
              COUNT(DISTINCT si.sale_id) invoices,
              SUM(si.subtotal) total_sales,
              SUM(si.subtotal) - SUM(${LINE_COGS}) total_profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE ${W}
       GROUP BY si.product_id, COALESCE(si.product_name, p.name), p.sku, p.barcode
       ORDER BY qty_sold DESC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    const [tot] = (await pool.query(
      `SELECT COALESCE(SUM(si.base_quantity),0) qty, COALESCE(SUM(si.subtotal),0) sales
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id WHERE ${W}`, a
    )).rows;

    return {
      summary: { products: num(cnt), totalQty: num(tot.qty), totalSales: num(tot.sales) },
      rows,
      meta: { page, limit, total: num(cnt) },
    };
  }

  // ── 4) شنو عليه دين؟ — Customer debts ──────────────────────────────────────
  async debts(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    // Per-customer aggregation over their (non-opening) sales.
    const where = ['s.customer_id IS NOT NULL', 'COALESCE(s.is_opening_balance,false) = false'];
    const a = [];
    const add = (cond, val) => { a.push(val); where.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) add('s.branch_id = $$', branch);
    if (filters.from) add('s.created_at::date >= $$', filters.from);
    if (filters.to) add('s.created_at::date <= $$', filters.to);
    if (filters.customerId) add('s.customer_id = $$', Number(filters.customerId));
    if (filters.search) {
      a.push(`%${filters.search}%`); const p1 = a.length;
      a.push(`%${filters.search}%`); const p2 = a.length;
      where.push(`(c.name ILIKE $${p1} OR c.phone ILIKE $${p2})`);
    }
    // status filter on the aggregate
    const filter = filters.filter || 'due';
    let having = 'SUM(s.remaining_amount) > 0';
    if (filter === 'all') having = 'SUM(s.total) > 0';              // anyone who ever bought on account
    else if (filter === 'partial') having = 'SUM(s.paid_amount) > 0 AND SUM(s.remaining_amount) > 0';
    else if (filter === 'customer') having = 'SUM(s.total) > 0';
    const W = where.join(' AND ');

    const base = `
      FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE ${W}
      GROUP BY c.id, c.name, c.phone
      HAVING ${having}`;

    const [{ cnt, debt }] = (await pool.query(
      `SELECT COUNT(*)::int cnt, COALESCE(SUM(remaining),0) debt FROM (
        SELECT SUM(s.remaining_amount) remaining ${base}
      ) t`, a
    )).rows;

    const rows = (await pool.query(
      `SELECT c.id customer_id, c.name customer_name, c.phone,
              SUM(s.total) total_amount,
              SUM(s.paid_amount) paid,
              SUM(s.remaining_amount) remaining,
              (SELECT MAX(pay.payment_date) FROM payments pay WHERE pay.customer_id = c.id) last_payment,
              MAX(s.created_at) last_invoice
       ${base}
       ORDER BY remaining DESC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    return {
      summary: { totalDebt: num(debt), customers: num(cnt) },
      rows,
      meta: { page, limit, total: num(cnt) },
    };
  }

  // ── 5) شكد بالصندوق؟ — Cash box position ───────────────────────────────────
  async cashBox(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);

    // Receipts = cash payments. Expenses = cash expenses. Returns = cash refunds.
    const sess = filters.cashSessionId ? Number(filters.cashSessionId) : null;

    const pWhere = [`p.payment_method = 'cash'`];
    const pa = [];
    const addP = (cond, val) => { pa.push(val); pWhere.push(cond.replace('$$', `$${pa.length}`)); };
    if (sess) addP('p.cash_session_id = $$', sess);
    if (branch !== null) addP('s.branch_id = $$', branch);
    if (filters.from) addP('p.payment_date::date >= $$', filters.from);
    if (filters.to) addP('p.payment_date::date <= $$', filters.to);
    const [{ receipts }] = (await pool.query(
      `SELECT COALESCE(SUM(p.amount),0) receipts FROM payments p
       LEFT JOIN sales s ON s.id = p.sale_id WHERE ${pWhere.join(' AND ')}`, pa
    )).rows;

    const eWhere = [`(e.payment_method = 'cash' OR e.payment_method IS NULL)`];
    const ea = [];
    const addE = (cond, val) => { ea.push(val); eWhere.push(cond.replace('$$', `$${ea.length}`)); };
    if (sess) addE('e.cash_session_id = $$', sess);
    if (branch !== null) addE('e.branch_id = $$', branch);
    if (filters.from) addE('e.expense_date >= $$', filters.from);
    if (filters.to) addE('e.expense_date <= $$', filters.to);
    const [{ expensesOut }] = (await pool.query(
      `SELECT COALESCE(SUM(e.amount),0) "expensesOut" FROM expenses e WHERE ${eWhere.join(' AND ')}`, ea
    )).rows;

    const rWhere = [`(sr.refund_method = 'cash' OR sr.refund_method IS NULL)`];
    const ra = [];
    const addR = (cond, val) => { ra.push(val); rWhere.push(cond.replace('$$', `$${ra.length}`)); };
    if (sess) addR('sr.cash_session_id = $$', sess);
    if (branch !== null) addR('sr.branch_id = $$', branch);
    if (filters.from) addR('sr.created_at::date >= $$', filters.from);
    if (filters.to) addR('sr.created_at::date <= $$', filters.to);
    const [{ refunds }] = (await pool.query(
      `SELECT COALESCE(SUM(sr.refund_amount),0) refunds FROM sale_returns sr WHERE ${rWhere.join(' AND ')}`, ra
    )).rows;

    // Opening from the cash session if scoped to one.
    let opening = 0;
    if (sess) {
      const r = (await pool.query('SELECT opening_cash FROM cash_sessions WHERE id = $1', [sess])).rows[0];
      opening = num(r?.opening_cash);
    }
    const net = num(receipts) - num(expensesOut) - num(refunds);

    // Recent cash movements (context table) — reuse the unified ledger.
    const movement = await this.cashMovement({ ...filters, limit: filters.limit || 50, page: filters.page || 1 }, user);

    return {
      summary: {
        currentBalance: opening + net,
        opening,
        receipts: num(receipts),
        expenses: num(expensesOut),
        returns: num(refunds),
        net,
      },
      rows: movement.rows,
      meta: movement.meta,
    };
  }

  // ── 6) شكد صرفت؟ — Expenses report ─────────────────────────────────────────
  async expenses(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = [];
    const a = [];
    const add = (cond, val) => { a.push(val); where.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) add('e.branch_id = $$', branch);
    if (filters.from) add('e.expense_date >= $$', filters.from);
    if (filters.to) add('e.expense_date <= $$', filters.to);
    if (filters.search) {
      a.push(`%${filters.search}%`); const p1 = a.length;
      a.push(`%${filters.search}%`); const p2 = a.length;
      where.push(`(e.category ILIKE $${p1} OR e.note ILIKE $${p2})`);
    }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [{ total_amount, cnt }] = (await pool.query(
      `SELECT COALESCE(SUM(e.amount),0) total_amount, COUNT(*)::int cnt FROM expenses e ${W}`, a
    )).rows;
    const byCategory = (await pool.query(
      `SELECT e.category, COALESCE(SUM(e.amount),0) amount, COUNT(*)::int count
       FROM expenses e ${W} GROUP BY e.category ORDER BY amount DESC`, a
    )).rows;
    const multiBranch = await isFeatureEnabled('multiBranch');
    const byBranch = multiBranch
      ? (await pool.query(
          `SELECT b.name branch_name, COALESCE(SUM(e.amount),0) amount
           FROM expenses e LEFT JOIN branches b ON b.id = e.branch_id ${W}
           GROUP BY b.name ORDER BY amount DESC`, a
        )).rows
      : [];

    const rows = (await pool.query(
      `SELECT e.expense_date, e.category, e.note, e.amount,
              u.full_name AS user_name, b.name AS branch_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN branches b ON b.id = e.branch_id
       ${W}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    return {
      summary: { totalExpenses: num(total_amount), count: num(cnt), byCategory, byBranch },
      rows,
      meta: { page, limit, total: num(cnt) },
    };
  }

  // ── 7) شنو حركة الصندوق؟ — Unified cash ledger ─────────────────────────────
  async cashMovement(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);
    const sess = filters.cashSessionId ? Number(filters.cashSessionId) : null;

    // Build the three legs as a UNION ALL, then a window running balance.
    // Params are shared positionally across legs; collect them once.
    const a = [];
    const P = (v) => { a.push(v); return `$${a.length}`; };
    const fromP = filters.from ? P(filters.from) : null;
    const toP = filters.to ? P(filters.to) : null;
    const branchP = branch !== null ? P(branch) : null;
    const sessP = sess ? P(sess) : null;

    const dateCond = (col) => [
      fromP ? `${col} >= ${fromP}` : null,
      toP ? `${col} <= ${toP}` : null,
    ].filter(Boolean).join(' AND ');

    // receipt vs debt_settlement: credit-sale payments are debt settlements.
    const payLeg = `
      SELECT p.payment_date AS ts, p.id,
             CASE WHEN s.payment_type = 'credit' THEN 'debt_settlement' ELSE 'receipt' END AS type,
             CASE WHEN s.payment_type = 'credit' THEN 'تسديد دين' ELSE 'قبض' END AS type_label,
             COALESCE('فاتورة ' || s.invoice_number, 'سند قبض') AS description,
             p.amount::numeric AS amount_in, 0::numeric AS amount_out,
             u.full_name AS user_name, b.name AS branch_name
      FROM payments p
      LEFT JOIN sales s ON s.id = p.sale_id
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.payment_method = 'cash'
        ${sessP ? `AND p.cash_session_id = ${sessP}` : ''}
        ${branchP ? `AND s.branch_id = ${branchP}` : ''}
        ${dateCond('p.payment_date::date') ? 'AND ' + dateCond('p.payment_date::date') : ''}`;

    const expLeg = `
      SELECT (e.expense_date::timestamp + interval '12 hour') AS ts, e.id,
             'expense' AS type, 'صرف' AS type_label,
             COALESCE('مصروف ' || e.category, 'صرف') || COALESCE(' - ' || e.note, '') AS description,
             0::numeric AS amount_in, e.amount::numeric AS amount_out,
             u.full_name AS user_name, b.name AS branch_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.created_by
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE (e.payment_method = 'cash' OR e.payment_method IS NULL)
        ${sessP ? `AND e.cash_session_id = ${sessP}` : ''}
        ${branchP ? `AND e.branch_id = ${branchP}` : ''}
        ${dateCond('e.expense_date') ? 'AND ' + dateCond('e.expense_date') : ''}`;

    const retLeg = `
      SELECT sr.created_at AS ts, sr.id,
             'return' AS type, 'مرتجع' AS type_label,
             'مرتجع مبيعات' AS description,
             0::numeric AS amount_in, sr.refund_amount::numeric AS amount_out,
             u.full_name AS user_name, b.name AS branch_name
      FROM sale_returns sr
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN branches b ON b.id = sr.branch_id
      WHERE (sr.refund_method = 'cash' OR sr.refund_method IS NULL) AND sr.refund_amount > 0
        ${sessP ? `AND sr.cash_session_id = ${sessP}` : ''}
        ${branchP ? `AND sr.branch_id = ${branchP}` : ''}
        ${dateCond('sr.created_at::date') ? 'AND ' + dateCond('sr.created_at::date') : ''}`;

    // type filter
    const type = filters.type && filters.type !== 'all' ? filters.type : null;
    let legs = [payLeg, expLeg, retLeg];
    if (type === 'receipt' || type === 'debt_settlement') legs = [payLeg];
    else if (type === 'expense') legs = [expLeg];
    else if (type === 'return') legs = [retLeg];
    const union = legs.join(' UNION ALL ');

    // running balance over the full ordered set, then paginate (most recent first)
    const ordered = `
      SELECT *, SUM(amount_in - amount_out) OVER (ORDER BY ts, id) AS balance_after
      FROM ( ${union} ) m`;
    let rows = (await pool.query(
      `SELECT * FROM ( ${ordered} ) b
       ${type === 'receipt' ? `WHERE type = 'receipt'` : type === 'debt_settlement' ? `WHERE type = 'debt_settlement'` : ''}
       ORDER BY ts DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    const [{ cnt, tin, tout }] = (await pool.query(
      `SELECT COUNT(*)::int cnt, COALESCE(SUM(amount_in),0) tin, COALESCE(SUM(amount_out),0) tout
       FROM ( ${union} ) m
       ${type === 'receipt' ? `WHERE type = 'receipt'` : type === 'debt_settlement' ? `WHERE type = 'debt_settlement'` : ''}`,
      a
    )).rows;

    return {
      summary: { totalIn: num(tin), totalOut: num(tout), net: num(tin) - num(tout) },
      rows,
      meta: { page, limit, total: num(cnt) },
    };
  }

  #empty(filters) {
    const { page, limit } = paging(filters);
    return { summary: {}, rows: [], meta: { page, limit, total: 0 } };
  }
}

export default new PosReportsService();
