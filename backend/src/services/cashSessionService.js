import { getDb } from '../db.js';
import {
  cashSessions,
  payments,
  sales,
  users,
  branches,
  cashboxes,
} from '../models/index.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors.js';
import {
  isGlobalAdmin,
  isBranchAdmin,
  isBranchManager,
  branchFilterFor,
  resolveBranchIdForOperation,
} from './scopeService.js';
import auditService from './auditService.js';
import accountingPeriodService from './accountingPeriodService.js';
import featureFlagsService from './featureFlagsService.js';
import glPostingService from './gl/glPostingService.js';
import { ensureDefaultCashbox } from './systemDefaultsService.js';

/** Parse PG numeric (string) → JS number. */
const n = (v) => (v === null || v === undefined ? 0 : Number(v));

const round4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

/**
 * Roles allowed to VIEW / CLOSE other users' shifts within their own branch.
 * "مدير الفرع" maps to both the branch-admin and branch-manager roles. Plain
 * managers / cashiers / viewers are NOT branch session managers — they may
 * only act on their OWN shift (enforced via the owner check).
 */
function isBranchSessionManager(user) {
  return isBranchAdmin(user) || isBranchManager(user);
}

/**
 * Cash session / shift closing business logic.
 *
 * A cashier opens a shift with the cash they're starting the drawer with.
 * Every cash POS sale during the shift is linked to the session via
 * `cash_session_id` (on sales + payments). When the shift is closed the
 * cashier counts the drawer; the service computes:
 *
 *   expected = opening + sum(cash_in) - sum(cash_out)
 *   variance = closing  - expected
 *
 * `cash_in`  = cash payments recorded against the session
 * `cash_out` = cash refunds (currently nothing in the system records cash
 *              refunds explicitly — sale cancellation does not refund cash —
 *              so cash_out is 0 for now and is wired up for future use).
 *
 * Closed sessions are immutable.
 */
export class CashSessionService {
  /**
   * Open a new cash session for the user/branch. Fails if one is already open.
   */
  async open({ openingCash = 0, currency = 'USD', notes = null, branchId = null, cashboxId = null }, user) {
    if (!user?.id) throw new AuthorizationError('Authentication required');

    const opening = round4(openingCash);
    if (opening < 0) {
      throw new ValidationError('Opening cash cannot be negative');
    }

    // Resolve + validate the branch through the SINGLE central resolver shared
    // by accounting periods, sales, expenses, inventory, etc. — so a shift's
    // branch_id ALWAYS matches the period it binds to, and a bad/inactive/
    // foreign branch surfaces a clear localized error (not a downstream FK
    // DatabaseError). Branches OFF → system default; branch-bound user → their
    // assigned branch; switcher → requested (validated) or default.
    const effectiveBranchId = await resolveBranchIdForOperation(user, branchId, { ensure: true });

    const db = await getDb();
    const existing = await this.findOpenSession(user.id, effectiveBranchId);
    if (existing) {
      throw new ValidationError('User already has an open cash session for this branch');
    }

    // Accounting-period requirement is GATED by the `accountingPeriods` feature
    // flag (matches featureFlagsService: OFF = behave as before).
    //   - ON  → a shift can only open inside an OPEN period for this scope;
    //           resolvePeriodForNewShift rejects (no/closed period) and the
    //           returned period id is bound to the shift + linked.
    //   - OFF → legacy POS: the shift opens with accounting_period_id = null and
    //           is not linked to any period.
    let periodId = null;
    if (await accountingPeriodService.isEnabled()) {
      const period = await accountingPeriodService.resolvePeriodForNewShift(user, effectiveBranchId);
      periodId = period.id;
    }

    // Treasury: bind the shift to a cashbox (explicit → validated; otherwise
    // the branch's default, created on demand). When the flag is OFF the
    // column stays null — exact legacy behavior.
    let effectiveCashboxId = null;
    if (await featureFlagsService.isFeatureEnabled('treasury')) {
      if (cashboxId) {
        const [box] = await db
          .select({ id: cashboxes.id, branchId: cashboxes.branchId, isActive: cashboxes.isActive })
          .from(cashboxes)
          .where(eq(cashboxes.id, Number(cashboxId)))
          .limit(1);
        if (!box || box.isActive === false) {
          throw new ValidationError('الصندوق المحدد غير موجود أو معطل');
        }
        if (box.branchId && Number(box.branchId) !== Number(effectiveBranchId)) {
          throw new ValidationError('الصندوق المحدد يتبع فرعاً آخر');
        }
        effectiveCashboxId = box.id;
      } else {
        effectiveCashboxId = await ensureDefaultCashbox(null, effectiveBranchId);
      }
    }

    const [row] = await db
      .insert(cashSessions)
      .values({
        userId: user.id,
        branchId: effectiveBranchId,
        accountingPeriodId: periodId,
        cashboxId: effectiveCashboxId,
        openingCash: String(opening),
        currency,
        status: 'open',
        notes,
      })
      .returning();

    if (periodId) await accountingPeriodService.linkShift(periodId, row.id);

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'cash_session:open',
      resource: 'cash_sessions',
      resourceId: row.id,
      details: { openingCash: opening, currency, branchId: effectiveBranchId },
    });

    return await this.getById(row.id, user);
  }

  /**
   * Close the session: counts cash, computes variance, sets status=closed.
   */
  async close(id, { closingCash, notes }, user) {
    const session = await this.getById(id, user);
    if (session.status !== 'open') {
      throw new ValidationError('Cash session is already closed');
    }

    // Owner / super-admin / branch-manager-in-scope. getById above already
    // enforced this (it throws before we get here for an out-of-scope user),
    // but we re-assert with close-specific wording as defense in depth.
    await this.assertCanAccessSession(session, user, { action: 'close' });

    const closing = round4(closingCash);
    if (!Number.isFinite(closing) || closing < 0) {
      throw new ValidationError('Closing cash must be a non-negative number');
    }

    const totals = await this.computeSessionTotals(id);
    const expected = round4(n(session.openingCash) + totals.cashIn - totals.cashOut);
    const variance = round4(closing - expected);

    const db = await getDb();
    const [updated] = await db
      .update(cashSessions)
      .set({
        closingCash: String(closing),
        expectedCash: String(expected),
        variance: String(variance),
        status: 'closed',
        closedAt: new Date(),
        notes: notes ?? session.notes,
      })
      .where(and(eq(cashSessions.id, id), eq(cashSessions.status, 'open')))
      .returning();

    if (!updated) {
      // Lost the race — somebody else closed it between getById and update.
      throw new ValidationError('Cash session is already closed');
    }

    // GL: a non-zero variance hits عجز/زيادة الصندوق. Failure-valved — a
    // posting defect never blocks closing the shift.
    if (variance !== 0) {
      await glPostingService.postDocument(db, {
        sourceType: 'shift_variance',
        sourceId: id,
        user,
      });
    }

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'cash_session:close',
      resource: 'cash_sessions',
      resourceId: id,
      details: {
        openingCash: n(session.openingCash),
        closingCash: closing,
        expectedCash: expected,
        variance,
        cashIn: totals.cashIn,
        cashOut: totals.cashOut,
      },
    });

    return await this.getById(id, user);
  }

  /**
   * Auto-close every OPEN session belonging to `user`. Called on logout so a
   * user can never leave a shift hanging open after they sign out.
   *
   * Because there is no physical drawer count at logout, the shift is closed
   * at its EXPECTED cash (closingCash = expected, variance = 0). Each closed
   * shift is stamped with `closedAt` and an audit entry. Variance is always 0
   * so no GL posting is triggered.
   *
   * Throws if any open session fails to close — the caller (logout) surfaces
   * the error and blocks sign-out until it's resolved.
   *
   * Returns `{ closed: number[] }` — the ids of the sessions that were closed.
   */
  async closeOpenSessionsForUser(user, { notes = 'إغلاق تلقائي عند تسجيل الخروج' } = {}) {
    if (!user?.id) return { closed: [] };
    const db = await getDb();

    const openSessions = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.userId, user.id), eq(cashSessions.status, 'open')))
      .orderBy(desc(cashSessions.openedAt));

    const closed = [];
    for (const s of openSessions) {
      const totals = await this.computeSessionTotals(s.id);
      const expected = round4(n(s.openingCash) + totals.cashIn - totals.cashOut);

      const [updated] = await db
        .update(cashSessions)
        .set({
          closingCash: String(expected),
          expectedCash: String(expected),
          variance: '0',
          status: 'closed',
          closedAt: new Date(),
          notes: s.notes ? `${s.notes} — ${notes}` : notes,
        })
        .where(and(eq(cashSessions.id, s.id), eq(cashSessions.status, 'open')))
        .returning();

      // Lost the race (closed concurrently) — not an error, just skip it.
      if (!updated) continue;

      closed.push(updated.id);
      await auditService.log({
        userId: user.id,
        username: user.username,
        action: 'cash_session:auto_close',
        resource: 'cash_sessions',
        resourceId: updated.id,
        details: {
          reason: 'logout',
          openingCash: n(s.openingCash),
          closingCash: expected,
          expectedCash: expected,
          variance: 0,
          cashIn: totals.cashIn,
          cashOut: totals.cashOut,
        },
      });
    }

    return { closed };
  }

  /**
   * Find the user's open session that should cover a sale in `branchId`, or
   * null. Used to enforce "open session required" before a cash POS sale.
   *
   * Matching rules (in order):
   *   1. Exact branch match — open session whose branch_id === branchId.
   *   2. Branch-less session — open session with branch_id IS NULL (global
   *      admins / single-branch deployments where the cashier didn't pin a
   *      branch when opening the shift).
   *   3. Any open session for the user — defensive fallback so a user with
   *      a single shift open in a different branch still gets matched
   *      instead of silently rejecting valid sales. The partial unique
   *      index prevents the user from having more than one open session per
   *      branch, so this is safe.
   */
  async findOpenSession(userId, branchId) {
    if (!userId) return null;
    const db = await getDb();
    const openSessions = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, 'open')))
      .orderBy(desc(cashSessions.openedAt));
    if (openSessions.length === 0) return null;
    if (branchId) {
      const exact = openSessions.find((s) => Number(s.branchId) === Number(branchId));
      if (exact) return exact;
    }
    const branchless = openSessions.find((s) => s.branchId === null);
    if (branchless) return branchless;
    return openSessions[0];
  }

  /**
   * Convenience: return current open session for the acting user, plus a
   * live summary of cash-in / cash-out / expected.
   */
  async getCurrent(user) {
    if (!user?.id) return null;
    // Pass the user's assigned branch as a hint, but findOpenSession falls
    // back to a branch-less session (or any open session) — important for
    // global admins / unassigned users whose sale.branchId is resolved
    // dynamically and may not match the session.branchId stored at open.
    const session = await this.findOpenSession(user.id, user.assignedBranchId || null);
    if (!session) return null;
    // Re-load through getById so the response includes the joined cashier
    // and branch labels (findOpenSession returns a raw row).
    return await this.getById(session.id, user);
  }

  /**
   * Authorize a user to VIEW or CLOSE a specific session row.
   *
   * Access model (matches the shift-permissions spec):
   *   - Super admin (global_admin / admin) → ANY session in ANY branch.
   *   - Owner (session.userId === user.id)  → their OWN shift, ALWAYS, even
   *     when their assigned branch differs from the shift's branch (e.g. the
   *     shift was opened against the system default branch while multiBranch is
   *     OFF, or the user was reassigned mid-shift). This is the fix for the
   *     spurious "Cash session belongs to a different branch" error a cashier
   *     used to get just loading their own current shift.
   *   - Branch manager (branch_admin / branch_manager) → any session that lives
   *     inside their branch. Branch scoping is only enforced when the
   *     `multiBranch` feature is ON; when it's OFF every session shares the
   *     single internal default branch so there is nothing to cross.
   *   - Everyone else (manager / cashier / viewer) accessing someone ELSE's
   *     session → denied with a clear message.
   *
   * `action` only tunes the wording ('view' vs 'close').
   */
  async assertCanAccessSession(session, user, { action = 'view' } = {}) {
    if (!user) return;
    if (isGlobalAdmin(user)) return; // super admin overrides branch scope
    if (Number(session.userId) === Number(user.id)) return; // own shift

    // Beyond this point the user is reaching for SOMEONE ELSE's shift.
    if (!isBranchSessionManager(user)) {
      throw new AuthorizationError(
        action === 'close'
          ? 'لا يمكنك إغلاق وردية مستخدم آخر'
          : 'لا يمكنك الوصول إلى وردية مستخدم آخر'
      );
    }

    // Branch managers: only within their own branch — and only when the
    // multi-branch feature is actually on (otherwise branches are a no-op).
    const flags = await featureFlagsService.getFeatureFlags();
    const multiBranchOn = flags.multiBranch !== false;
    if (multiBranchOn && session.branchId) {
      const allowed = branchFilterFor(user); // [assignedBranchId] | [] | null
      const inScope =
        allowed === null ||
        allowed.some((b) => Number(b) === Number(session.branchId));
      if (!inScope) {
        throw new AuthorizationError('الوردية تتبع فرعاً آخر');
      }
    }
  }

  async getById(id, user = null) {
    const db = await getDb();
    const [row] = await db
      .select({
        id: cashSessions.id,
        userId: cashSessions.userId,
        branchId: cashSessions.branchId,
        cashboxId: cashSessions.cashboxId,
        openingCash: cashSessions.openingCash,
        closingCash: cashSessions.closingCash,
        expectedCash: cashSessions.expectedCash,
        variance: cashSessions.variance,
        currency: cashSessions.currency,
        status: cashSessions.status,
        notes: cashSessions.notes,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        cashierName: users.fullName,
        cashierUsername: users.username,
        branchName: branches.name,
        cashboxName: cashboxes.name,
      })
      .from(cashSessions)
      .leftJoin(users, eq(cashSessions.userId, users.id))
      .leftJoin(branches, eq(cashSessions.branchId, branches.id))
      .leftJoin(cashboxes, eq(cashSessions.cashboxId, cashboxes.id))
      .where(eq(cashSessions.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('Cash session');

    // Owner / super-admin / branch-manager-in-scope only. Feature-flag aware.
    await this.assertCanAccessSession(row, user, { action: 'view' });

    const totals = await this.computeSessionTotals(row.id);
    const expected =
      row.status === 'closed'
        ? n(row.expectedCash)
        : round4(n(row.openingCash) + totals.cashIn - totals.cashOut);

    return {
      ...this.serialize(row),
      cashierName: row.cashierName,
      cashierUsername: row.cashierUsername,
      branchName: row.branchName,
      cashboxName: row.cashboxName ?? null,
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
      cashSalesCount: totals.cashSalesCount,
      expectedCash: expected,
    };
  }

  /**
   * List sessions with simple filters. Branch-scoped for non-global users.
   */
  async list({ page = 1, limit = 20, status, userId, branchId, startDate, endDate } = {}, user) {
    const db = await getDb();
    const conds = [];
    if (status) conds.push(eq(cashSessions.status, status));
    if (userId) conds.push(eq(cashSessions.userId, Number(userId)));

    const flags = await featureFlagsService.getFeatureFlags();
    const multiBranchOn = flags.multiBranch !== false;

    if (isGlobalAdmin(user)) {
      // Super admin: every branch; optional explicit branch filter.
      if (branchId) conds.push(eq(cashSessions.branchId, Number(branchId)));
    } else if (isBranchSessionManager(user)) {
      // Branch manager: all sessions inside their own branch. When multiBranch
      // is OFF every session shares the single default branch, so no filter.
      if (multiBranchOn) {
        const allowed = branchFilterFor(user);
        if (!allowed || allowed.length === 0) {
          return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
        }
        conds.push(eq(cashSessions.branchId, allowed[0]));
      }
    } else {
      // Regular user / cashier / viewer: ONLY their own sessions. Any passed
      // `userId` filter is overridden so they can't enumerate other users.
      conds.push(eq(cashSessions.userId, Number(user.id)));
    }

    if (startDate) conds.push(gte(cashSessions.openedAt, new Date(startDate)));
    if (endDate) conds.push(lte(cashSessions.openedAt, new Date(endDate)));

    const where = conds.length ? and(...conds) : undefined;

    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(cashSessions)
      .where(where || sql`true`);
    const total = Number(count || 0);
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id: cashSessions.id,
        userId: cashSessions.userId,
        branchId: cashSessions.branchId,
        openingCash: cashSessions.openingCash,
        closingCash: cashSessions.closingCash,
        expectedCash: cashSessions.expectedCash,
        variance: cashSessions.variance,
        currency: cashSessions.currency,
        status: cashSessions.status,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        cashierName: users.fullName,
        cashierUsername: users.username,
        branchName: branches.name,
      })
      .from(cashSessions)
      .leftJoin(users, eq(cashSessions.userId, users.id))
      .leftJoin(branches, eq(cashSessions.branchId, branches.id))
      .where(where || sql`true`)
      .orderBy(desc(cashSessions.openedAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => ({
        ...this.serialize(r),
        cashierName: r.cashierName,
        cashierUsername: r.cashierUsername,
        branchName: r.branchName,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Sum the cash flowing through this session.
   *
   * cashIn  = SUM(payments.amount) where session_id = id AND method = 'cash'
   * cashOut = 0 (placeholder for explicit cash refunds — sale cancellation
   *           does not refund cash in this system; reserve hook for future).
   * cashSalesCount = number of distinct sales tied to this session.
   */
  async computeSessionTotals(sessionId) {
    const db = await getDb();

    const [paymentSum] = await db
      .select({
        sum: sql`COALESCE(SUM(${payments.amount}::numeric), 0)`,
      })
      .from(payments)
      .where(
        and(eq(payments.cashSessionId, sessionId), eq(payments.paymentMethod, 'cash'))
      );

    const [salesCount] = await db
      .select({ count: sql`count(*)` })
      .from(sales)
      .where(eq(sales.cashSessionId, sessionId));

    return {
      cashIn: round4(Number(paymentSum?.sum || 0)),
      cashOut: 0,
      cashSalesCount: Number(salesCount?.count || 0),
    };
  }

  /** Map a raw row to the API shape (numeric strings → numbers). */
  serialize(row) {
    return {
      id: row.id,
      userId: row.userId,
      branchId: row.branchId,
      cashboxId: row.cashboxId ?? null,
      openingCash: n(row.openingCash),
      closingCash: row.closingCash === null || row.closingCash === undefined
        ? null
        : n(row.closingCash),
      expectedCash: row.expectedCash === null || row.expectedCash === undefined
        ? null
        : n(row.expectedCash),
      variance: row.variance === null || row.variance === undefined ? null : n(row.variance),
      currency: row.currency,
      status: row.status,
      notes: row.notes ?? null,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
    };
  }
}

export default new CashSessionService();
