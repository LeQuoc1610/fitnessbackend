import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { NotificationModel } from '../models/Notification.js';
import { UserModel } from '../models/User.js';

export const notificationsRouter = Router();

function buildGroupKeyExpr() {
  return {
    $cond: [
      { $in: ['$type', ['like', 'comment']] },
      { $concat: ['$type', '|', '$entityType', '|', { $toString: '$entityId' }] },
      { $concat: ['single|', { $toString: '$_id' }] },
    ],
  };
}

function toGroupedText(type: string, groupCount: number, actorName: string, rawText: string) {
  if (type === 'like') {
    if (groupCount <= 1) return 'đã thích bài viết của bạn';
    return `và ${Math.max(0, groupCount - 1)} người khác đã thích bài viết của bạn`;
  }

  if (type === 'comment') {
    const normalized = String(rawText ?? '').trim();
    const preview = normalized
      .replace(/^commented\s*:\s*/i, '')
      .replace(/^"|"$/g, '')
      .replace(/^“|”$/g, '')
      .trim();

    if (groupCount <= 1) {
      return preview ? `đã bình luận về bài viết của bạn: “${preview}”` : 'đã bình luận về bài viết của bạn';
    }
    return `và ${Math.max(0, groupCount - 1)} người khác đã bình luận về bài viết của bạn`;
  }

  return String(rawText ?? '');
}

/**
 * GET /api/notifications/me
 * Lấy danh sách notification của user hiện tại
 */
notificationsRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 30)));
    const page = Math.max(1, Number(req.query.page ?? 1));
    const skip = (page - 1) * limit;

    const groupKeyExpr = buildGroupKeyExpr();

    const [groupedItems, unreadAgg] = await Promise.all([
      NotificationModel.aggregate([
        { $match: { recipientId: meId } },
        { $sort: { createdAt: -1 } },
        { $addFields: { groupKey: groupKeyExpr } },
        {
          $group: {
            _id: '$groupKey',
            type: { $first: '$type' },
            entityType: { $first: '$entityType' },
            entityId: { $first: '$entityId' },
            latestNotificationId: { $first: '$_id' },
            latestActorId: { $first: '$actorId' },
            latestText: { $first: '$text' },
            latestCreatedAt: { $first: '$createdAt' },
            totalCount: { $sum: 1 },
            anyUnread: { $max: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } },
            maxReadAt: { $max: '$readAt' },
          },
        },
        { $sort: { latestCreatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
      NotificationModel.aggregate([
        { $match: { recipientId: meId } },
        { $addFields: { groupKey: groupKeyExpr } },
        {
          $group: {
            _id: '$groupKey',
            anyUnread: { $max: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } },
          },
        },
        { $group: { _id: null, count: { $sum: '$anyUnread' } } },
      ]),
    ]);

    const unreadCount = Number(unreadAgg?.[0]?.count ?? 0);

    const actorIds = Array.from(new Set(groupedItems.map((n: any) => String(n.latestActorId))));
    const actors = await UserModel.find({ _id: { $in: actorIds } });
    const actorMap = new Map(actors.map((a) => [String(a._id), a]));

    res.json({
      items: groupedItems.map((g: any) => {
        const actor = actorMap.get(String(g.latestActorId));
        const actorName = actor?.displayName ?? 'GymBro';
        return {
          groupKey: String(g._id),
          id: String(g.latestNotificationId),
          type: g.type,
          entityType: g.entityType,
          entityId: String(g.entityId),
          text: toGroupedText(String(g.type), Number(g.totalCount ?? 1), actorName, String(g.latestText ?? '')),
          createdAt: g.latestCreatedAt,
          readAt: Number(g.anyUnread ?? 0) ? null : g.maxReadAt ?? null,
          actor: {
            uid: String(g.latestActorId),
            displayName: actorName,
            photoURL: actor?.photoURL ?? '',
          },
          groupCount: Number(g.totalCount ?? 1),
        };
      }),
      unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/unread-count
 * Lấy số lượng notification chưa đọc
 */
notificationsRouter.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    const groupKeyExpr = buildGroupKeyExpr();

    const unreadAgg = await NotificationModel.aggregate([
      { $match: { recipientId: meId } },
      { $addFields: { groupKey: groupKeyExpr } },
      {
        $group: {
          _id: '$groupKey',
          anyUnread: { $max: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } },
        },
      },
      { $group: { _id: null, count: { $sum: '$anyUnread' } } },
    ]);

    const unreadCount = Number(unreadAgg?.[0]?.count ?? 0);

    res.json({
      success: true,
      unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/:id/read
 * Đánh dấu một notification là đã đọc
 */
notificationsRouter.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id))
      throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    const existing = await NotificationModel.findOne({ _id: id, recipientId: meId });
    if (!existing) throw Object.assign(new Error('Not found'), { status: 404 });

    const now = new Date();
    if (existing.type === 'like' || existing.type === 'comment') {
      await NotificationModel.updateMany(
        {
          recipientId: meId,
          type: existing.type,
          entityType: existing.entityType,
          entityId: existing.entityId,
          readAt: null,
        },
        { $set: { readAt: now } }
      );
      res.json({ ok: true, readAt: now });
      return;
    }

    const updated = await NotificationModel.findOneAndUpdate(
      { _id: id, recipientId: meId },
      { $set: { readAt: now } },
      { new: true }
    );

    if (!updated) throw Object.assign(new Error('Not found'), { status: 404 });

    res.json({ ok: true, readAt: updated.readAt });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/read-all
 * Đánh dấu tất cả notification của user là đã đọc
 */
notificationsRouter.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    const now = new Date();
    const result = await NotificationModel.updateMany(
      {
        recipientId: meId,
        readAt: null,
      },
      { $set: { readAt: now } }
    );

    res.json({ ok: true, modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    const existing = await NotificationModel.findOne({ _id: id, recipientId: meId });
    if (!existing) throw Object.assign(new Error('Not found'), { status: 404 });

    if (existing.type === 'like' || existing.type === 'comment') {
      await NotificationModel.deleteMany({
        recipientId: meId,
        type: existing.type,
        entityType: existing.entityType,
        entityId: existing.entityId,
      });
      res.json({ ok: true });
      return;
    }

    const deleted = await NotificationModel.findOneAndDelete({ _id: id, recipientId: meId });
    if (!deleted) throw Object.assign(new Error('Not found'), { status: 404 });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});