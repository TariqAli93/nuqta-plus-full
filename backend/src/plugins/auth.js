import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import config from '../config.js';
import { getDb } from '../db.js';
import { users } from '../models/index.js';
import { eq } from 'drizzle-orm';
import rbacService from '../services/rbacService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import { getUserCapabilities } from '../services/permissionService.js';
import { loadUserBranchIds } from '../services/scopeService.js';
import { describePermission } from '../auth/permissionActions.js';

async function authPlugin(fastify) {
  // Register JWT
  await fastify.register(jwt, {
    secret: config.jwt.secret,
  });

  // Decorate request with auth methods
  fastify.decorate('authenticate', async function (request, _reply) {
    try {
      await request.jwtVerify();

      // Get user from database
      const db = await getDb();
      const [user] = await db.select().from(users).where(eq(users.id, request.user.id)).limit(1);

      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Attach the full set of branches this user may act on (many-to-many).
      // The synchronous scope helpers (branchFilterFor / enforceBranchScope)
      // read this list off the user object, so every authenticated request
      // carries it. Falls back to the primary assignedBranchId internally.
      user.allowedBranchIds = await loadUserBranchIds(user);

      request.user = user;
    } catch (error) {
      console.error(error);
      if (error.message.includes('No token provided')) {
        throw new AuthenticationError('Token is required');
      } else {
        throw new AuthenticationError('Invalid or expired token');
      }
    }
  });

  // Authorization middleware - checks if user has required permission(s).
  // Accepts a single permission string or an array of permissions. When an
  // array is provided, the user passes if they hold *any* of them — useful
  // for endpoints like branch update where branch_admin (inventory:manage)
  // and branch_manager (branches:set_default_warehouse) both need access
  // and the service then enforces the stricter per-role field rules.
  //
  // Optional `meta` ({ action, resource }) lets a route spell out a precise
  // Arabic operation name; otherwise it is derived from the permission key via
  // the central permissionActions map. On denial the thrown AuthorizationError
  // carries a rich `details` payload so the UI explains exactly what was
  // refused, why, and who can fix it (instead of a vague generic message).
  fastify.decorate('authorize', function (requiredPermission, meta = {}) {
    return async function (request, reply) {
      // Ensure user is authenticated first
      await fastify.authenticate(request, reply);

      // Get user role
      const userRole = request.user?.role;

      if (!userRole) {
        throw new AuthorizationError('User role not found');
      }

      const required = Array.isArray(requiredPermission)
        ? requiredPermission
        : [requiredPermission];
      // Dynamic, DB-backed check (cached). Changes to a role's permissions take
      // effect immediately for every user holding that role.
      await rbacService.ensureLoaded();
      const ok = required.some((perm) => rbacService.can(userRole, perm));
      if (!ok) {
        // Describe the *primary* required permission (first one) for the action
        // name / reason / suggestion; expose every accepted key too.
        const desc = describePermission(required[0], meta);
        let userPermissions = [];
        try {
          userPermissions = rbacService.getRolePermissionKeys(userRole);
        } catch {
          /* cache miss — leave empty rather than fail the error path */
        }

        const err = new AuthorizationError(`ليس لديك صلاحية ${desc.action}`);
        err.code = 'PERMISSION_DENIED';
        err.details = {
          action: desc.action,
          resource: desc.resource,
          requiredPermission: required.length === 1 ? desc.requiredPermission : required,
          ...(required.length > 1 ? { requiredAnyOf: required } : {}),
          userPermissions,
          reason: desc.reason,
          suggestion: desc.suggestion,
        };
        throw err;
      }
    };
  });

  /**
   * Reject the request when the named feature flag is OFF, even if the user
   * is otherwise authorized. Use this on routes that are wholly owned by an
   * optional module (POS, draft invoices, inventory transfers, branches).
   *
   * Returns 403 with { code: 'FEATURE_DISABLED', feature } so the SPA can
   * detect the case and refresh its session/bootstrap.
   */
  fastify.decorate('requireFeature', function (flag) {
    return async function () {
      const enabled = await featureFlagsService.isFeatureEnabled(flag);
      if (!enabled) {
        const err = new AuthorizationError(`Feature "${flag}" is disabled`);
        err.statusCode = 403;
        err.code = 'FEATURE_DISABLED';
        err.feature = flag;
        throw err;
      }
    };
  });

  /**
   * Reject the request when the named capability is `false` for the current
   * user. Capabilities are computed from feature flags + role + scope, so
   * this single check covers the "feature off" and "role lacks permission"
   * cases at once.
   *
   * Always run AFTER `fastify.authenticate` (or pair with `authorize` in the
   * onRequest array — `authenticate` is invoked there).
   */
  fastify.decorate('requireCapability', function (capabilityName) {
    return async function (request) {
      await fastify.authenticate(request);
      const caps = await getUserCapabilities(request.user);
      if (caps[capabilityName] !== true) {
        const err = new AuthorizationError('لا تملك صلاحية استخدام هذه الميزة');
        err.statusCode = 403;
        err.code = 'CAPABILITY_DENIED';
        err.capability = capabilityName;
        err.details = {
          capability: capabilityName,
          reason:
            'هذه العملية غير متاحة لحسابك — قد تكون الميزة غير مُفعّلة في النمط الحالي أو أن دورك لا يسمح باستخدامها.',
          suggestion:
            'تواصل مع المدير العام للتأكد من تفعيل الميزة في الإعدادات أو لمنح دورك صلاحية استخدامها.',
        };
        throw err;
      }
    };
  });
}

export default fp(authPlugin);
