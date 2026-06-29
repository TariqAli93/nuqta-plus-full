import { getPool } from '../db.js';
import { branchFilterFor } from './scopeService.js';
import { isFeatureEnabled } from './featureFlagsService.js';
import { hasPermission } from '../auth/permissionMatrix.js';

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
 * Resolve the branch(es) a report must be scoped to (multi-branch aware):
 *   - global admin → the requested branchId as a 1-element array, or null (= all);
 *   - branch-bound user → ALL the branches assigned to them; a requested branch
 *     that is one of theirs narrows to just that one (so they can filter between
 *     their branches); a foreign requested branch is ignored;
 *   - user with no branch → -1 (sentinel → empty result).
 *
 * Returns `null` (no filter), `-1` (empty), or a NON-empty array of branch ids.
 * Callers compare with `branch_id = ANY($n)` so a single or many branches work.
 */
function effectiveBranch(actingUser, requestedBranchId) {
  const allowed = branchFilterFor(actingUser);
  const req = requestedBranchId ? Number(requestedBranchId) : null;
  if (allowed === null) return req ? [req] : null;
  if (allowed.length === 0) return -1;
  if (req && allowed.includes(req)) return [req];
  return allowed.map(Number);
}

/**
 * May the acting user see OTHER users' operations in reports?
 *   - a global admin (all_permissions) → yes;
 *   - a holder of a financial-reports permission (profit / financial / the
 *     explicit "all users" grant) → yes;
 *   - everyone else → no (restricted to their own rows).
 * Reports are scoped by the user who performed the operation (`created_by`),
 * enforced in the BACKEND.
 */
function canViewAllUsers(actingUser) {
  if (!actingUser) return false;
  if (actingUser.allPermissions === true) return true;
  return (
    hasPermission('reports:read_profit', actingUser.role) ||
    hasPermission('reports:read_financial', actingUser.role) ||
    hasPermission('reports:view_all_users', actingUser.role)
  );
}

/**
 * Resolve which user's operations a report must be scoped to (backend-enforced;
 * the UI is never the only gate):
 *   - "view all" user → the requested userId, or null (= every user);
 *   - normal user → ALWAYS their own id (any requested userId is ignored);
 *   - no resolvable id → -1 (sentinel → empty result).
 * Returns null (no user filter), a numeric user id, or -1.
 */
function effectiveUserId(actingUser, requestedUserId) {
  if (canViewAllUsers(actingUser)) {
    return requestedUserId ? Number(requestedUserId) : null;
  }
  const own = Number(actingUser?.id);
  return Number.isFinite(own) && own > 0 ? own : -1;
}

/** Per-line COGS expression (snapshot cost → fallback to product base cost). */
const LINE_COGS = `
  CASE WHEN si.unit_cost_price IS NOT NULL
       THEN si.unit_cost_price::numeric * si.quantity
       ELSE COALESCE(p.cost_price::numeric, 0) * COALESCE(NULLIF(si.base_quantity,0), si.quantity)
  END`;

/**
 * Per-line net sales — the line's value AFTER its proportional share of the
 * invoice-level discount («خصم الفاتورة») is removed, so product profit reflects
 * the discount instead of ignoring it. s.subtotal is the invoice subtotal after
 * item-level discounts (= Σ si.subtotal), so the share is
 * s.discount × si.subtotal / s.subtotal. The invoice discount is clamped at sale
 * time to never push a line below cost, so this proportional split stays ≥ 0 and
 * Σ(line net sales) reconciles to the report summary's net sales.
 */
const LINE_NET_SALES = `
  (si.subtotal::numeric
     - COALESCE(s.discount::numeric, 0) * si.subtotal::numeric
       / NULLIF(s.subtotal::numeric, 0))`;

class PosReportsService {
  // ── 1) شكد بعت؟ — Sales report ─────────────────────────────────────────────
  async sales(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = ['COALESCE(s.is_opening_balance,false) = false'];
    const args = [];
    const add = (cond, val) => { args.push(val); where.push(cond.replace('$$', `$${args.length}`)); };
    if (branch !== null) add('s.branch_id = ANY($$)', branch);
    if (userScope !== null) add('s.created_by = $$', userScope);
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
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const sWhere = ['COALESCE(s.is_opening_balance,false) = false'];
    const a = [];
    const addS = (cond, val) => { a.push(val); sWhere.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) addS('s.branch_id = ANY($$)', branch);
    if (userScope !== null) addS('s.created_by = $$', userScope);
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
    if (branch !== null) addR('sr.branch_id = ANY($$)', branch);
    if (userScope !== null) addR('sr.created_by = $$', userScope);
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
    if (branch !== null) addE('e.branch_id = ANY($$)', branch);
    if (userScope !== null) addE('e.created_by = $$', userScope);
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
              SUM(${LINE_NET_SALES}) - SUM(${LINE_COGS}) profit
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
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = ['COALESCE(s.is_opening_balance,false) = false'];
    const a = [];
    const add = (cond, val) => { a.push(val); where.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) add('s.branch_id = ANY($$)', branch);
    if (userScope !== null) add('s.created_by = $$', userScope);
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
              SUM(${LINE_NET_SALES}) - SUM(${LINE_COGS}) total_profit
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

  // ── 4) شنو عليه دين؟ — Debts across customers, agents & suppliers ──────────
  //
  // A debt is signed by who owes whom, NOT lumped together:
  //   • customers / agents → outstanding sales (AR)  → normally "لنا" (receivable)
  //   • suppliers          → outstanding purchases (AP) → normally "علينا" (payable)
  // Agents are simply customers classified `customer_type = 'agent'`; a credit
  // balance (negative remaining) flips a row's direction so an over-paid customer
  // shows as "علينا" and an over-paid supplier as "لنا". The summary nets the two
  // sides: netDebt = totalReceivable − totalPayable (positive = صافي لنا).
  async debts(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#emptyDebts(filters);
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#emptyDebts(filters);
    const { page, limit, offset } = paging(filters);

    const partyType = ['customer', 'agent', 'supplier', 'all'].includes(filters.partyType)
      ? filters.partyType : 'all';
    const direction = ['receivable', 'payable', 'all'].includes(filters.direction)
      ? filters.direction : 'all';
    // Map the legacy `filter` (due/all/partial/customer) onto the new `status`.
    const legacy = { due: 'all', partial: 'partial', customer: 'all' };
    const statusRaw = filters.status || legacy[filters.filter] || filters.filter || 'all';
    const status = ['open', 'partial', 'paid', 'overdue', 'all'].includes(statusRaw)
      ? statusRaw : 'all';

    // RBAC: only surface the supplier (AP) leg to users who may read suppliers /
    // purchases; sales-only users still get the customer/agent side.
    const canReadSuppliers =
      hasPermission('suppliers:read', user?.role) || hasPermission('purchases:read', user?.role);
    const wantCustomers = partyType === 'all' || partyType === 'customer' || partyType === 'agent';
    const wantSuppliers = (partyType === 'all' || partyType === 'supplier') && canReadSuppliers;

    // Shared, positional params across both UNION legs.
    const a = [];
    const P = (v) => { a.push(v); return `$${a.length}`; };
    const branchP = branch !== null ? P(branch) : null;
    // Restricted users only see debts arising from their OWN sales (created_by).
    const userScopeP = userScope !== null ? P(userScope) : null;
    const fromP = filters.from ? P(filters.from) : null;
    const toP = filters.to ? P(filters.to) : null;
    const searchP = filters.search ? P(`%${filters.search}%`) : null;
    if (filters.customerId) {
      // Back-compat: drilling into one customer from older callers.
      P(Number(filters.customerId));
    }
    const customerIdP = filters.customerId ? `$${a.length}` : null;

    const legs = [];

    if (wantCustomers) {
      const w = ['s.customer_id IS NOT NULL', 'COALESCE(s.is_opening_balance,false) = false'];
      if (partyType === 'customer') w.push(`COALESCE(c.customer_type,'retail') <> 'agent'`);
      if (partyType === 'agent') w.push(`COALESCE(c.customer_type,'retail') = 'agent'`);
      if (branchP) w.push(`s.branch_id = ANY(${branchP})`);
      if (userScopeP) w.push(`s.created_by = ${userScopeP}`);
      if (fromP) w.push(`s.created_at::date >= ${fromP}`);
      if (toP) w.push(`s.created_at::date <= ${toP}`);
      if (customerIdP) w.push(`s.customer_id = ${customerIdP}`);
      if (searchP)
        w.push(`(c.name ILIKE ${searchP} OR c.phone ILIKE ${searchP}
                 OR s.invoice_number ILIKE ${searchP} OR COALESCE(c.notes,'') ILIKE ${searchP})`);
      legs.push(`
        SELECT
          CASE WHEN COALESCE(c.customer_type,'retail') = 'agent' THEN 'agent' ELSE 'customer' END AS party_type,
          c.id AS party_id, c.name AS party_name, c.phone AS phone,
          SUM(s.total) AS total_amount,
          SUM(s.paid_amount) AS paid_amount,
          SUM(s.remaining_amount) AS remaining_amount,
          MAX(s.created_at) AS last_transaction_date,
          MIN(CASE WHEN s.remaining_amount > 0 THEN s.created_at END) AS oldest_unpaid,
          (SELECT MAX(pay.payment_date) FROM payments pay WHERE pay.customer_id = c.id) AS last_payment_date
        FROM sales s JOIN customers c ON c.id = s.customer_id
        WHERE ${w.join(' AND ')}
        GROUP BY c.id, c.name, c.phone, c.customer_type`);
    }

    if (wantSuppliers) {
      const w = [`pi.status <> 'cancelled'`, 'COALESCE(pi.is_opening_balance,false) = false'];
      if (branchP) w.push(`pi.branch_id = ANY(${branchP})`);
      if (userScopeP) w.push(`pi.created_by = ${userScopeP}`);
      if (fromP) w.push(`pi.invoice_date >= ${fromP}`);
      if (toP) w.push(`pi.invoice_date <= ${toP}`);
      if (searchP)
        w.push(`(sup.name ILIKE ${searchP} OR sup.phone ILIKE ${searchP}
                 OR pi.invoice_number ILIKE ${searchP} OR COALESCE(pi.notes,'') ILIKE ${searchP})`);
      legs.push(`
        SELECT
          'supplier' AS party_type,
          sup.id AS party_id, sup.name AS party_name, sup.phone AS phone,
          SUM(pi.total) AS total_amount,
          SUM(pi.paid_amount) AS paid_amount,
          SUM(pi.remaining_amount) AS remaining_amount,
          MAX(pi.invoice_date)::timestamp AS last_transaction_date,
          MIN(CASE WHEN pi.remaining_amount > 0 THEN pi.invoice_date END)::timestamp AS oldest_unpaid,
          (SELECT MAX(v.voucher_date)::timestamp FROM vouchers v
            WHERE v.supplier_id = sup.id AND v.voucher_type = 'payment' AND v.status = 'active') AS last_payment_date
        FROM purchase_invoices pi JOIN suppliers sup ON sup.id = pi.supplier_id
        WHERE ${w.join(' AND ')}
        GROUP BY sup.id, sup.name, sup.phone`);
    }

    if (!legs.length) return this.#emptyDebts(filters);

    // Classify each party: direction (receivable/payable), positive outstanding
    // magnitude, and a mutually-exclusive status (paid → overdue → partial → open).
    const classified = `
      SELECT p.*,
        ABS(p.remaining_amount) AS outstanding,
        CASE WHEN p.party_type = 'supplier'
             THEN CASE WHEN p.remaining_amount >= 0 THEN 'payable' ELSE 'receivable' END
             ELSE CASE WHEN p.remaining_amount >= 0 THEN 'receivable' ELSE 'payable' END
        END AS direction,
        CASE
          WHEN ABS(p.remaining_amount) < 0.005 THEN 'paid'
          WHEN p.oldest_unpaid IS NOT NULL AND p.oldest_unpaid < (CURRENT_DATE - INTERVAL '30 days') THEN 'overdue'
          WHEN p.paid_amount > 0 THEN 'partial'
          ELSE 'open'
        END AS status
      FROM ( ${legs.join('\n        UNION ALL\n')} ) p`;

    // Outer filters on the classified set. `direction`/`status` are strict enums
    // validated above, so inlining them is safe.
    const outer = [];
    if (direction !== 'all') outer.push(`direction = '${direction}'`);
    outer.push(status === 'all' ? `status <> 'paid'` : `status = '${status}'`);
    const filtered = `SELECT * FROM ( ${classified} ) c WHERE ${outer.join(' AND ')}`;

    const [sum] = (await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction='receivable' THEN outstanding ELSE 0 END),0) AS total_receivable,
         COALESCE(SUM(CASE WHEN direction='payable'    THEN outstanding ELSE 0 END),0) AS total_payable,
         COUNT(*) FILTER (WHERE direction='receivable')::int AS receivable_count,
         COUNT(*) FILTER (WHERE direction='payable')::int    AS payable_count,
         COUNT(*)::int AS total
       FROM ( ${filtered} ) f`, a
    )).rows;

    const rows = (await pool.query(
      `SELECT party_type, party_id, party_name, phone,
              total_amount, paid_amount, remaining_amount, outstanding,
              direction, status, last_transaction_date, last_payment_date
       FROM ( ${filtered} ) f
       ORDER BY outstanding DESC, party_name ASC
       LIMIT ${limit} OFFSET ${offset}`, a
    )).rows;

    const totalReceivable = num(sum.total_receivable);
    const totalPayable = num(sum.total_payable);
    return {
      summary: {
        totalReceivable,
        totalPayable,
        netDebt: totalReceivable - totalPayable,
        receivableCount: num(sum.receivable_count),
        payableCount: num(sum.payable_count),
        // Legacy keys so any older consumer of this report keeps working.
        totalDebt: totalReceivable,
        customers: num(sum.receivable_count),
      },
      rows: rows.map((r) => ({
        partyType: r.party_type,
        partyId: r.party_id,
        partyName: r.party_name,
        phone: r.phone,
        totalAmount: num(r.total_amount),
        paidAmount: num(r.paid_amount),
        remainingAmount: num(r.outstanding),
        direction: r.direction,
        lastTransactionDate: r.last_transaction_date,
        lastPaymentDate: r.last_payment_date,
        status: r.status,
        sourceType: r.party_type === 'supplier' ? 'purchase' : 'sale',
        sourceId: r.party_id,
      })),
      meta: { page, limit, total: num(sum.total) },
    };
  }

  // ── 5) شكد بالصندوق؟ — Cash box position ───────────────────────────────────
  async cashBox(filters, user) {
    const pool = await getPool();
    const branch = effectiveBranch(user, filters.branchId);
    if (branch === -1) return this.#empty(filters);
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);

    // Receipts = cash payments. Expenses = cash expenses. Returns = cash refunds.
    // Scoped by the user who performed each operation (was: by cash session).
    const pWhere = [`p.payment_method = 'cash'`];
    const pa = [];
    const addP = (cond, val) => { pa.push(val); pWhere.push(cond.replace('$$', `$${pa.length}`)); };
    if (userScope !== null) addP('p.created_by = $$', userScope);
    if (branch !== null) addP('s.branch_id = ANY($$)', branch);
    if (filters.from) addP('p.payment_date::date >= $$', filters.from);
    if (filters.to) addP('p.payment_date::date <= $$', filters.to);
    const [{ receipts }] = (await pool.query(
      `SELECT COALESCE(SUM(p.amount),0) receipts FROM payments p
       LEFT JOIN sales s ON s.id = p.sale_id WHERE ${pWhere.join(' AND ')}`, pa
    )).rows;

    const eWhere = [`(e.payment_method = 'cash' OR e.payment_method IS NULL)`];
    const ea = [];
    const addE = (cond, val) => { ea.push(val); eWhere.push(cond.replace('$$', `$${ea.length}`)); };
    if (userScope !== null) addE('e.created_by = $$', userScope);
    if (branch !== null) addE('e.branch_id = ANY($$)', branch);
    if (filters.from) addE('e.expense_date >= $$', filters.from);
    if (filters.to) addE('e.expense_date <= $$', filters.to);
    const [{ expensesOut }] = (await pool.query(
      `SELECT COALESCE(SUM(e.amount),0) "expensesOut" FROM expenses e WHERE ${eWhere.join(' AND ')}`, ea
    )).rows;

    const rWhere = [`(sr.refund_method = 'cash' OR sr.refund_method IS NULL)`];
    const ra = [];
    const addR = (cond, val) => { ra.push(val); rWhere.push(cond.replace('$$', `$${ra.length}`)); };
    if (userScope !== null) addR('sr.created_by = $$', userScope);
    if (branch !== null) addR('sr.branch_id = ANY($$)', branch);
    if (filters.from) addR('sr.created_at::date >= $$', filters.from);
    if (filters.to) addR('sr.created_at::date <= $$', filters.to);
    const [{ refunds }] = (await pool.query(
      `SELECT COALESCE(SUM(sr.refund_amount),0) refunds FROM sale_returns sr WHERE ${rWhere.join(' AND ')}`, ra
    )).rows;

    // No opening float; start from zero.
    const opening = 0;
    const net = num(receipts) - num(expensesOut) - num(refunds);

    // Recent cash movements (context table) — reuse the unified ledger.
    // The merged "حركة وتقرير الصندوق" page reads its movement table AND its
    // in/out totals from this single call, so we surface the ledger totals
    // (totalIn/totalOut) alongside the position breakdown.
    const movement = await this.cashMovement({ ...filters, limit: filters.limit || 50, page: filters.page || 1 }, user);
    const totalIn = num(movement.summary.totalIn);
    const totalOut = num(movement.summary.totalOut);

    // When a movementType filter is active the ledger totals already reflect it,
    // so net/currentBalance must follow the filtered view. With no type filter
    // (the only case today) totalIn === receipts and totalOut === expenses+returns,
    // so these values are byte-identical to the previous behaviour.
    const filteredByType = filters.type && filters.type !== 'all';
    const netValue = filteredByType ? totalIn - totalOut : net;

    return {
      summary: {
        currentBalance: opening + netValue,
        opening,
        receipts: num(receipts),
        expenses: num(expensesOut),
        returns: num(refunds),
        totalIn,
        totalOut,
        net: netValue,
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
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    const where = [];
    const a = [];
    const add = (cond, val) => { a.push(val); where.push(cond.replace('$$', `$${a.length}`)); };
    if (branch !== null) add('e.branch_id = ANY($$)', branch);
    if (userScope !== null) add('e.created_by = $$', userScope);
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
    const userScope = effectiveUserId(user, filters.userId);
    if (userScope === -1) return this.#empty(filters);
    const { page, limit, offset } = paging(filters);

    // Build the three legs as a UNION ALL, then a window running balance.
    // Params are shared positionally across legs; collect them once.
    const a = [];
    const P = (v) => { a.push(v); return `$${a.length}`; };
    const fromP = filters.from ? P(filters.from) : null;
    const toP = filters.to ? P(filters.to) : null;
    const branchP = branch !== null ? P(branch) : null;
    // Each ledger leg is scoped to the user who performed it (was: cash session).
    const userScopeP = userScope !== null ? P(userScope) : null;

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
        ${userScopeP ? `AND p.created_by = ${userScopeP}` : ''}
        ${branchP ? `AND s.branch_id = ANY(${branchP})` : ''}
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
        ${userScopeP ? `AND e.created_by = ${userScopeP}` : ''}
        ${branchP ? `AND e.branch_id = ANY(${branchP})` : ''}
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
        ${userScopeP ? `AND sr.created_by = ${userScopeP}` : ''}
        ${branchP ? `AND sr.branch_id = ANY(${branchP})` : ''}
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

  #emptyDebts(filters) {
    const { page, limit } = paging(filters);
    return {
      summary: {
        totalReceivable: 0, totalPayable: 0, netDebt: 0,
        receivableCount: 0, payableCount: 0, totalDebt: 0, customers: 0,
      },
      rows: [],
      meta: { page, limit, total: 0 },
    };
  }
}

export default new PosReportsService();
