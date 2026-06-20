import { getDb, saveDatabase } from '../db.js';
import { salesChannels } from '../models/index.js';
import {
  NotFoundError,
  ConflictError,
  AppError,
  translateDbConstraintError,
} from '../utils/errors.js';
import { eq, or, like, desc, sql, and } from 'drizzle-orm';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SalesChannelService');

// `code` is a stable machine identifier — store it UPPER_SNAKE so lookups and
// the seeded set stay consistent regardless of how the operator typed it.
const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

export class SalesChannelService {
  async create(channelData) {
    const db = await getDb();

    const code = normalizeCode(channelData.code);

    const [existing] = await db
      .select({ id: salesChannels.id })
      .from(salesChannels)
      .where(eq(salesChannels.code, code))
      .limit(1);
    if (existing) {
      throw new ConflictError('قناة بيع بنفس الرمز موجودة بالفعل');
    }

    const [created] = await db
      .insert(salesChannels)
      .values({
        code,
        name: channelData.name,
        isActive: channelData.isActive ?? true,
        color: channelData.color ?? null,
        icon: channelData.icon ?? null,
      })
      .returning();

    saveDatabase();
    return created;
  }

  async getAll(filters = {}) {
    const db = await getDb();
    const { page = 1, limit = 50, search, isActive } = filters;

    const conditions = [];
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(like(salesChannels.name, term), like(salesChannels.code, term)));
    }
    if (isActive === true || isActive === 'true' || isActive === '1') {
      conditions.push(eq(salesChannels.isActive, true));
    } else if (isActive === false || isActive === 'false' || isActive === '0') {
      conditions.push(eq(salesChannels.isActive, false));
    }
    const where =
      conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : and(...conditions);

    let query = db.select().from(salesChannels);
    if (where) query = query.where(where);

    let countQuery = db.select({ count: sql`count(*)` }).from(salesChannels);
    if (where) countQuery = countQuery.where(where);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const results = await query
      .orderBy(desc(salesChannels.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: results,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id) {
    const db = await getDb();
    const [channel] = await db
      .select()
      .from(salesChannels)
      .where(eq(salesChannels.id, Number(id)))
      .limit(1);

    if (!channel) {
      throw new NotFoundError('Sales channel');
    }
    return channel;
  }

  async update(id, channelData) {
    const db = await getDb();

    const setPayload = { ...channelData, updatedAt: new Date() };

    // If the code is being changed, normalise it and guard uniqueness.
    if (Object.prototype.hasOwnProperty.call(channelData, 'code')) {
      const code = normalizeCode(channelData.code);
      setPayload.code = code;
      const [clash] = await db
        .select({ id: salesChannels.id })
        .from(salesChannels)
        .where(and(eq(salesChannels.code, code), sql`${salesChannels.id} <> ${Number(id)}`))
        .limit(1);
      if (clash) {
        throw new ConflictError('قناة بيع بنفس الرمز موجودة بالفعل');
      }
    }

    const [updated] = await db
      .update(salesChannels)
      .set(setPayload)
      .where(eq(salesChannels.id, Number(id)))
      .returning();

    if (!updated) {
      throw new NotFoundError('Sales channel');
    }

    saveDatabase();
    return updated;
  }

  async delete(id) {
    const db = await getDb();

    try {
      const [deleted] = await db
        .delete(salesChannels)
        .where(eq(salesChannels.id, Number(id)))
        .returning();
      if (!deleted) {
        throw new NotFoundError('Sales channel');
      }
      saveDatabase();
      return { message: 'Sales channel deleted successfully' };
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('Delete of sales channel failed', err);
      throw (
        translateDbConstraintError(err, {
          fkMessage: 'لا يمكن حذف هذه القناة لأنها مستخدمة في بيانات أخرى مسجلة داخل النظام.',
        }) || new AppError('تعذّر حذف القناة بسبب خطأ غير متوقع. يرجى المحاولة مرة أخرى.', 500)
      );
    }
  }
}
