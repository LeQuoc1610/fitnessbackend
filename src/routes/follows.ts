import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { FollowModel } from '../models/Follow.js';
import { NotificationModel } from '../models/Notification.js';
import { UserModel } from '../models/User.js';
import { onlineUsers } from '../socket.js';

export const followsRouter = Router();

followsRouter.get('/:uid', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    const [followerCount, followingCount, isFollowing] = await Promise.all([
      FollowModel.countDocuments({ followingId: targetId }),
      FollowModel.countDocuments({ followerId: targetId }),
      FollowModel.exists({ followerId: meId, followingId: targetId }),
    ]);

    res.json({
      followerCount,
      followingCount,
      isFollowing: !!isFollowing,
    });
  } catch (err) {
    next(err);
  }
});

followsRouter.post('/:uid', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    if (String(targetId) === String(meId)) {
      throw Object.assign(new Error('Cannot follow yourself'), { status: 400 });
    }

    const existing = await FollowModel.findOne({ followerId: meId, followingId: targetId });

    if (existing) {
      const [followerCount, followingCount] = await Promise.all([
        FollowModel.countDocuments({ followingId: targetId }),
        FollowModel.countDocuments({ followerId: targetId }),
      ]);
      res.json({ isFollowing: true, followerCount, followingCount });
      return;
    }

    await FollowModel.create({ followerId: meId, followingId: targetId });

    const notif = await NotificationModel.create({
      recipientId: targetId,
      actorId: meId,
      type: 'follow',
      entityType: 'user',
      entityId: meId,
      text: 'started following you',
    });

    const io = req.app.get('io');
    if (io) {
      const recipientId = String(targetId);
      const recipientSocketId = onlineUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('new-notification', {
          id: String(notif._id),
          type: 'follow',
          entityType: 'user',
          entityId: String(meId),
          actorId: String(meId),
          text: 'started following you',
          recipientId,
          createdAt: notif.createdAt,
        });
      }
    }

    const [followerCount, followingCount] = await Promise.all([
      FollowModel.countDocuments({ followingId: targetId }),
      FollowModel.countDocuments({ followerId: targetId }),
    ]);
    res.json({ isFollowing: true, followerCount, followingCount });
  } catch (err) {
    next(err);
  }
});

followsRouter.delete('/:uid', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const meId = new mongoose.Types.ObjectId(req.auth!.sub);

    if (String(targetId) === String(meId)) {
      throw Object.assign(new Error('Cannot unfollow yourself'), { status: 400 });
    }

    const existing = await FollowModel.findOne({ followerId: meId, followingId: targetId });
    if (!existing) {
      const [followerCount, followingCount] = await Promise.all([
        FollowModel.countDocuments({ followingId: targetId }),
        FollowModel.countDocuments({ followerId: targetId }),
      ]);
      res.json({ isFollowing: false, followerCount, followingCount });
      return;
    }

    await existing.deleteOne();
    await NotificationModel.deleteMany({
      recipientId: targetId,
      actorId: meId,
      type: 'follow',
      entityType: 'user',
      entityId: meId,
    });

    const [followerCount, followingCount] = await Promise.all([
      FollowModel.countDocuments({ followingId: targetId }),
      FollowModel.countDocuments({ followerId: targetId }),
    ]);
    res.json({ isFollowing: false, followerCount, followingCount });
  } catch (err) {
    next(err);
  }
});

followsRouter.get('/:uid/followers', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

    const q: Record<string, unknown> = { followingId: targetId };
    if (cursor && !Number.isNaN(cursor.getTime())) {
      q.createdAt = { $lt: cursor };
    }

    const docs = await FollowModel.find(q).sort({ createdAt: -1 }).limit(limit + 1);
    const nextCursor = docs.length > limit ? docs[limit]!.createdAt : null;
    const page = docs.slice(0, limit);

    const userIds = Array.from(new Set(page.map((d) => String(d.followerId))));
    const users = await UserModel.find({ _id: { $in: userIds } });
    const map = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      items: page
        .map((d) => map.get(String(d.followerId)))
        .filter(Boolean)
        .map((u) => ({
          uid: String(u!._id),
          displayName: u!.displayName,
          photoURL: u!.photoURL ?? '',
        })),
      nextCursor: nextCursor ? nextCursor.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

followsRouter.get('/:uid/following', requireAuth, async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

    const q: Record<string, unknown> = { followerId: targetId };
    if (cursor && !Number.isNaN(cursor.getTime())) {
      q.createdAt = { $lt: cursor };
    }

    const docs = await FollowModel.find(q).sort({ createdAt: -1 }).limit(limit + 1);
    const nextCursor = docs.length > limit ? docs[limit]!.createdAt : null;
    const page = docs.slice(0, limit);

    const userIds = Array.from(new Set(page.map((d) => String(d.followingId))));
    const users = await UserModel.find({ _id: { $in: userIds } });
    const map = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      items: page
        .map((d) => map.get(String(d.followingId)))
        .filter(Boolean)
        .map((u) => ({
          uid: String(u!._id),
          displayName: u!.displayName,
          photoURL: u!.photoURL ?? '',
        })),
      nextCursor: nextCursor ? nextCursor.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});
