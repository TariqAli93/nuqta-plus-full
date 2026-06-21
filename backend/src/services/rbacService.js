import { getDb, getPool, saveDatabase } from '../db.js';
import { roles, permissions, rolePermissions, users } from '../models/index.js';
import { eq, sql, inArray, asc } from 'drizzle-orm';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { PERMISSION_CATALOG, catalogEntry } from '../auth/permissionCatalog.js';
import PERMISSION_MATRIX, { ROLES, setDynamicChecker } from '../auth/permissionMatrix.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RbacService');

/**
 * Dynamic RBAC — roles + permissions live in the DB and are editable at runtime.
 *
 * - `users.role` stays a string CODE pointing at roles.code (no user migration).
 * - The global admin role (code global_admin/admin, all_permissions=true) is
 *   ALWAYS granted every permission, including ones added in the future.
 * - Authorization reads an in-memory cache (role code → Set<permissionKey>),
 *   reloaded on every write so changes reflect immediately for all users.
 */

// Arabic display names for the seeded system roles + their data scope.
const SYSTEM_ROLES = [
  { code: ROLES.GLOBAL_ADMIN, nameAr: 'المدير العام', scope: 'global', allPermissions: true },
  { code: ROLES.ADMIN, nameAr: 'مدير النظام', scope: 'global', allPermissions: true },
  { code: ROLES.BRANCH_ADMIN, nameAr: 'مدير فرع', scope: 'branch', allPermissions: false },
  { code: ROLES.BRANCH_MANAGER, nameAr: 'مشرف فرع', scope: 'branch', allPermissions: false },
  { code: ROLES.MANAGER, nameAr: 'مدير', scope: 'branch', allPermissions: false },
  { code: ROLES.CASHIER, nameAr: 'أمين صندوق', scope: 'branch', allPermissions: false },
  { code: ROLES.VIEWER, nameAr: 'مشاهد', scope: 'branch', allPermissions: false },
];

const isGlobalCode = (code) => code === ROLES.GLOBAL_ADMIN || code === ROLES.ADMIN;

class RbacService {
  constructor() {
    this._loaded = false;
    this._permsByRole = new Map(); // code → Set<permissionKey>
    this._roleMeta = new Map(); // code → { id, scope, allPermissions, isSystem }
    this._allKeys = []; // every permission key (for the global admin)
  }

  // ── Seeding (idempotent, self-provisioning) ───────────────────────────────
  async ensureSeed() {
    const pool = await getPool();
    // Self-provision the tables so the feature works regardless of migration
    // journal state (it has been reset by external tooling before).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" serial PRIMARY KEY, "key" text NOT NULL UNIQUE, "name_ar" text NOT NULL,
        "description_ar" text, "group_ar" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamp DEFAULT now());
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" serial PRIMARY KEY, "code" text NOT NULL UNIQUE, "name_ar" text NOT NULL,
        "description_ar" text, "scope" text NOT NULL DEFAULT 'branch',
        "is_system" boolean NOT NULL DEFAULT false, "all_permissions" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now(), "updated_at" timestamp DEFAULT now(),
        "created_by" integer REFERENCES "users"("id"));
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "id" serial PRIMARY KEY,
        "role_id" integer NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permission_id" integer NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "created_at" timestamp DEFAULT now());
      CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_perm_unique"
        ON "role_permissions" ("role_id","permission_id");
    `);

    // 1) Permissions catalog — upsert by key (keep Arabic name/group/active in sync).
    let order = 0;
    for (const [key, meta] of Object.entries(PERMISSION_CATALOG)) {
      order += 1;
      await pool.query(
        `INSERT INTO permissions (key, name_ar, group_ar, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE SET name_ar=EXCLUDED.name_ar,
           group_ar=EXCLUDED.group_ar, is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order`,
        [key, meta.ar, meta.group, meta.active !== false, order]
      );
    }

    // 2) System roles — insert if missing (preserving any later rename), keep
    //    structural fields (scope / is_system / all_permissions) correct.
    const db = await getDb();
    const permIdByKey = new Map(
      (await db.select({ id: permissions.id, key: permissions.key }).from(permissions)).map((p) => [
        p.key,
        p.id,
      ])
    );

    for (const r of SYSTEM_ROLES) {
      const [existing] = await db.select().from(roles).where(eq(roles.code, r.code)).limit(1);
      if (!existing) {
        const [created] = await db
          .insert(roles)
          .values({
            code: r.code,
            nameAr: r.nameAr,
            scope: r.scope,
            isSystem: true,
            allPermissions: r.allPermissions,
          })
          .returning();
        // Seed default grants ONCE (new role only) from the static matrix, so a
        // later removal by an admin is never re-added on reboot.
        if (!r.allPermissions) {
          const keys = Object.keys(PERMISSION_MATRIX).filter((k) =>
            (PERMISSION_MATRIX[k] || []).includes(r.code)
          );
          const rows = keys
            .map((k) => permIdByKey.get(k))
            .filter(Boolean)
            .map((pid) => ({ roleId: created.id, permissionId: pid }));
          if (rows.length) await db.insert(rolePermissions).values(rows).onConflictDoNothing();
        }
      } else {
        // Keep structural flags correct without clobbering a renamed name_ar.
        await db
          .update(roles)
          .set({ scope: r.scope, isSystem: true, allPermissions: r.allPermissions })
          .where(eq(roles.id, existing.id));
      }
    }

    // 3) Backfill grants for permission keys added AFTER the initial role seed.
    //    System roles created before a new key existed won't have it (grants are
    //    seeded only at role creation). For each new key we grant it to the
    //    SYSTEM roles the matrix assigns it to — but ONLY the first time the key
    //    appears anywhere (zero existing grants). On a fresh install the key was
    //    already granted via creation seeding (count>0 → skipped); on an upgrade
    //    it has no grants yet → backfilled once. This never undoes a later admin
    //    removal (some role keeps it, so the count stays > 0).
    const BACKFILL_KEYS = [
      'delivery_shipments:cancel',
      'delivery_shipments:sync',
      'delivery_shipments:print_label',
      'delivery_shipments:change_provider',
      'delivery_logs:view',
      'delivery_reports:view',
      // Granular online-order workflow permissions (added with the online-sales
      // overhaul). Backfilled once to the matrix-assigned roles on upgrade.
      'online_orders:confirm',
      'online_orders:prepare',
      'online_orders:deliver',
      'online_orders:cancel',
      'online_orders:return',
      // Invoice + shipping actions on an online order (added with the
      // order→invoice→shipping wiring). Backfilled once on upgrade.
      'online_orders:open_invoice',
      'online_orders:send_to_shipping',
      'online_orders:resend_to_shipping',
      'online_orders:view_shipment',
      // Recurring / fixed expenses (المصاريف الثابتة) — backfilled once on
      // upgrade to the matrix-assigned roles (managers + branch managers).
      'recurring_expenses:create',
      'recurring_expenses:read',
      'recurring_expenses:update',
      'recurring_expenses:delete',
      'view:recurring_expenses',
    ];
    for (const key of BACKFILL_KEYS) {
      const pid = permIdByKey.get(key);
      if (!pid) continue;
      const [seen] = await db
        .select({ count: sql`count(*)` })
        .from(rolePermissions)
        .where(eq(rolePermissions.permissionId, pid));
      if (Number(seen?.count || 0) > 0) continue; // already seeded/assigned — leave as-is
      const targetCodes = (PERMISSION_MATRIX[key] || []).filter((c) => !isGlobalCode(c));
      if (!targetCodes.length) continue;
      const targetRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.code, targetCodes));
      const grantRows = targetRoles.map((r) => ({ roleId: r.id, permissionId: pid }));
      if (grantRows.length) await db.insert(rolePermissions).values(grantRows).onConflictDoNothing();
    }

    saveDatabase();
    await this.reload();
    log.info('RBAC seed ensured');
  }

  // ── Cache ──────────────────────────────────────────────────────────────────
  async reload() {
    const db = await getDb();
    const roleRows = await db.select().from(roles);
    const permRows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
    const grants = await db
      .select({ roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId })
      .from(rolePermissions);

    const keyByPermId = new Map(permRows.map((p) => [p.id, p.key]));
    this._allKeys = permRows.map((p) => p.key);
    this._permsByRole = new Map();
    this._roleMeta = new Map();
    for (const r of roleRows) {
      this._roleMeta.set(r.code, {
        id: r.id,
        scope: r.scope,
        allPermissions: r.allPermissions,
        isSystem: r.isSystem,
        isActive: r.isActive,
        nameAr: r.nameAr,
      });
      this._permsByRole.set(r.code, new Set());
    }
    for (const g of grants) {
      const code = roleRows.find((r) => r.id === g.roleId)?.code;
      const key = keyByPermId.get(g.permissionId);
      if (code && key) this._permsByRole.get(code)?.add(key);
    }
    this._loaded = true;
    // Make every static hasPermission() call site dynamic from now on.
    setDynamicChecker((roleCode, permKey) => this.can(roleCode, permKey));
  }

  async ensureLoaded() {
    if (!this._loaded) await this.reload();
  }

  /** Sync authorization check against the cache (call ensureLoaded first). */
  can(roleCode, permissionKey) {
    if (!roleCode || !permissionKey) return false;
    const meta = this._roleMeta.get(roleCode);
    if (meta?.allPermissions || isGlobalCode(roleCode)) return true;
    return this._permsByRole.get(roleCode)?.has(permissionKey) ?? false;
  }

  /** All granted permission keys for a role (every key for the global admin). */
  getRolePermissionKeys(roleCode) {
    const meta = this._roleMeta.get(roleCode);
    if (meta?.allPermissions || isGlobalCode(roleCode)) return [...this._allKeys];
    return [...(this._permsByRole.get(roleCode) || [])];
  }

  /** Does this role hold ALL permissions (global admin)? */
  isAllPermissions(roleCode) {
    const meta = this._roleMeta.get(roleCode);
    return !!meta?.allPermissions || isGlobalCode(roleCode);
  }

  /**
   * Resolve a single role by its machine `code` from the loaded cache.
   * Returns `{ code, id, scope, allPermissions, isSystem, isActive, nameAr }`
   * or `null` when no such role exists. Used to validate a user's role against
   * the DB-backed roles table instead of a hard-coded enum.
   */
  async getRoleByCode(code) {
    if (!code) return null;
    await this.ensureLoaded();
    const meta = this._roleMeta.get(code);
    return meta ? { code, ...meta } : null;
  }

  // ── Read APIs (for the management UI) ──────────────────────────────────────
  async listPermissions() {
    const db = await getDb();
    const rows = await db
      .select()
      .from(permissions)
      .where(eq(permissions.isActive, true))
      .orderBy(asc(permissions.sortOrder));
    // Group by Arabic group for the UI.
    const groups = {};
    for (const p of rows) {
      (groups[p.groupAr] ??= []).push({
        key: p.key,
        nameAr: p.nameAr,
        descriptionAr: p.descriptionAr,
      });
    }
    return Object.entries(groups).map(([group, items]) => ({ group, permissions: items }));
  }

  async listRoles() {
    const db = await getDb();
    const roleRows = await db.select().from(roles).orderBy(asc(roles.id));
    const counts = await db
      .select({ roleId: rolePermissions.roleId, count: sql`count(*)` })
      .from(rolePermissions)
      .groupBy(rolePermissions.roleId);
    const countByRole = new Map(counts.map((c) => [c.roleId, Number(c.count)]));
    // User counts per role code.
    const userCounts = await db
      .select({ role: users.role, count: sql`count(*)` })
      .from(users)
      .groupBy(users.role);
    const usersByCode = new Map(userCounts.map((u) => [u.role, Number(u.count)]));

    return roleRows.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      descriptionAr: r.descriptionAr,
      scope: r.scope,
      isSystem: r.isSystem,
      allPermissions: r.allPermissions,
      isActive: r.isActive,
      permissionCount: r.allPermissions ? this._allKeys.length : countByRole.get(r.id) || 0,
      userCount: usersByCode.get(r.code) || 0,
    }));
  }

  async getRole(id) {
    const db = await getDb();
    const [r] = await db.select().from(roles).where(eq(roles.id, Number(id))).limit(1);
    if (!r) throw new NotFoundError('Role');
    const keys = r.allPermissions
      ? [...this._allKeys]
      : (
          await db
            .select({ key: permissions.key })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(eq(rolePermissions.roleId, r.id))
        ).map((x) => x.key);
    return { ...r, permissionKeys: keys };
  }

  // ── Write APIs ───────────────────────────────────────────────────────────
  async createRole({ nameAr, descriptionAr, scope, permissionKeys = [] }, userId) {
    if (!nameAr || !nameAr.trim()) throw new ValidationError('اسم الدور مطلوب');
    const db = await getDb();
    // Generate a unique machine code from the Arabic name (or a fallback).
    const base =
      (nameAr.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'role').slice(0, 30);
    let code = base;
    let i = 1;
    while ((await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1)).length) {
      code = `${base}_${i++}`;
    }
    const [created] = await db
      .insert(roles)
      .values({
        code,
        nameAr: nameAr.trim(),
        descriptionAr: descriptionAr || null,
        scope: scope === 'global' ? 'branch' : scope || 'branch', // custom roles never 'global' (global admin only)
        isSystem: false,
        allPermissions: false,
        createdBy: userId || null,
      })
      .returning();
    await this._applyPermissionKeys(created.id, permissionKeys);
    saveDatabase();
    await this.reload();
    return this.getRole(created.id);
  }

  async updateRole(id, { nameAr, descriptionAr, scope }) {
    const db = await getDb();
    const [r] = await db.select().from(roles).where(eq(roles.id, Number(id))).limit(1);
    if (!r) throw new NotFoundError('Role');
    const set = { updatedAt: new Date() };
    if (nameAr != null && nameAr.trim()) set.nameAr = nameAr.trim();
    if (descriptionAr !== undefined) set.descriptionAr = descriptionAr || null;
    // Scope is fixed for system roles (preserves branch behaviour); editable for custom.
    if (scope && !r.isSystem) set.scope = scope === 'global' ? 'branch' : scope;
    await db.update(roles).set(set).where(eq(roles.id, r.id));
    saveDatabase();
    await this.reload();
    return this.getRole(r.id);
  }

  async setRolePermissions(id, permissionKeys = []) {
    const db = await getDb();
    const [r] = await db.select().from(roles).where(eq(roles.id, Number(id))).limit(1);
    if (!r) throw new NotFoundError('Role');
    if (r.allPermissions) {
      throw new ConflictError('لا يمكن تعديل صلاحيات المدير العام — يملك جميع الصلاحيات دائماً.');
    }
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, r.id));
    await this._applyPermissionKeys(r.id, permissionKeys);
    saveDatabase();
    await this.reload();
    return this.getRole(r.id);
  }

  async deleteRole(id) {
    const db = await getDb();
    const [r] = await db.select().from(roles).where(eq(roles.id, Number(id))).limit(1);
    if (!r) throw new NotFoundError('Role');
    if (r.isSystem) throw new ConflictError('لا يمكن حذف دور نظامي أساسي.');
    const [usage] = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.role, r.code));
    if (Number(usage?.count) > 0) {
      throw new ConflictError(`لا يمكن حذف الدور لأنه مرتبط بـ ${usage.count} مستخدم.`);
    }
    await db.delete(roles).where(eq(roles.id, r.id));
    saveDatabase();
    await this.reload();
    return { message: 'تم حذف الدور بنجاح' };
  }

  /** Resolve permission keys → ids and insert grants (ignores unknown keys). */
  async _applyPermissionKeys(roleId, keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const db = await getDb();
    const valid = keys.filter((k) => PERMISSION_CATALOG[k] || catalogEntry(k));
    const rows = await db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, valid));
    const grants = rows.map((p) => ({ roleId, permissionId: p.id }));
    if (grants.length) await db.insert(rolePermissions).values(grants).onConflictDoNothing();
  }
}

export default new RbacService();
