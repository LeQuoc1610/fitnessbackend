import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { ThreadModel } from '../models/Thread.js';
import { UserModel } from '../models/User.js';
import { CommentModel } from '../models/Comment.js';
import { SavedThreadModel } from '../models/SavedThread.js';
import { RepostModel } from '../models/Repost.js';
import { NotificationModel } from '../models/Notification.js';
import { FollowModel } from '../models/Follow.js';
import { onlineUsers } from '../socket.js';

export const threadsRouter = Router();

type MediaItem = {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  duration?: number;
};

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const re = /#([A-Za-z0-9_]+)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const t = m[1];
    if (t && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

function parseFeedCursor(input: unknown): { group: 'f' | 'o'; date: Date | null } {
  const raw = typeof input === 'string' ? input : '';
  if (!raw) return { group: 'f', date: null };

  const idx = raw.indexOf(':');
  if (idx > 0) {
    const g = raw.slice(0, idx);
    const rest = raw.slice(idx + 1);
    if ((g === 'f' || g === 'o') && rest) {
      const d = new Date(rest);
      return { group: g, date: Number.isNaN(d.getTime()) ? null : d };
    }
  }

  const d = new Date(raw);
  return { group: 'f', date: Number.isNaN(d.getTime()) ? null : d };
}

async function toThreadItem({
  thread,
  meId,
}: {
  thread: any;
  meId: string;
}): Promise<any> {
  const author = await UserModel.findById(thread.authorId);
  const saved = await SavedThreadModel.findOne({ userId: meId, threadId: thread._id });
  const repost = await RepostModel.findOne({ userId: meId, threadId: thread._id });
  const likedByMe = thread.likedBy.map(String).includes(meId);

  return {
    id: String(thread._id),
    author: {
      uid: String(thread.authorId),
      displayName: author?.displayName ?? 'GymBro',
      photoURL: author?.photoURL ?? '',
    },
    createdAt: thread.createdAt,
    text: thread.text,
    tags: thread.tags,
    media: thread.media,
    fitness: thread.fitness,
    stats: { likes: thread.likeCount, replies: thread.replyCount, reposts: thread.repostCount },
    likedByMe,
    savedByMe: !!saved,
    repostedByMe: !!repost,
  };
}

threadsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const meId = req.auth!.sub;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const { group: cursorGroup, date: cursorDate } = parseFeedCursor(req.query.cursor);
    const authorId = req.query.authorId ? String(req.query.authorId) : null;

    const q: Record<string, unknown> = {};
    if (authorId) {
      if (!mongoose.isValidObjectId(authorId)) throw Object.assign(new Error('Not found'), { status: 404 });
      q.authorId = new mongoose.Types.ObjectId(authorId);
    }

    let page: any[] = [];
    let nextCursor: string | null = null;

    if (authorId) {
      if (cursorDate) q.createdAt = { $lt: cursorDate };

      const items = await ThreadModel.find(q).sort({ createdAt: -1 }).limit(limit + 1);
      nextCursor = items.length > limit ? items[limit]!.createdAt.toISOString() : null;
      page = items.slice(0, limit);
    } else {
      const meObjId = new mongoose.Types.ObjectId(meId);
      const followDocs = await FollowModel.find({ followerId: meObjId }).select({ followingId: 1 });
      const followingIds = [meObjId, ...followDocs.map((d: any) => d.followingId)];
      const group1 = { ...q, authorId: { $in: followingIds } };
      const group2 = { ...q, authorId: { $nin: followingIds } };

      if (cursorGroup === 'f') {
        if (cursorDate) (group1 as any).createdAt = { $lt: cursorDate };
        const items1 = await ThreadModel.find(group1).sort({ createdAt: -1 }).limit(limit + 1);

        if (items1.length > limit) {
          nextCursor = `f:${items1[limit]!.createdAt.toISOString()}`;
          page = items1.slice(0, limit);
        } else {
          page = items1;
          const remain = limit - page.length;
          const items2 = remain > 0 ? await ThreadModel.find(group2).sort({ createdAt: -1 }).limit(remain + 1) : [];

          if (remain > 0) {
            const take = items2.slice(0, remain);
            page = [...page, ...take];

            if (items2.length > remain) {
              nextCursor = `o:${items2[remain]!.createdAt.toISOString()}`;
            } else {
              nextCursor = null;
            }
          } else {
            nextCursor = null;
          }
        }
      } else {
        if (cursorDate) (group2 as any).createdAt = { $lt: cursorDate };
        const items2 = await ThreadModel.find(group2).sort({ createdAt: -1 }).limit(limit + 1);
        nextCursor = items2.length > limit ? `o:${items2[limit]!.createdAt.toISOString()}` : null;
        page = items2.slice(0, limit);
      }
    }

    const authorIds = Array.from(new Set(page.map((t) => String(t.authorId))));
    const authors = await UserModel.find({ _id: { $in: authorIds } });
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));

    const threadIds = page.map((t) => t._id);
    const saved = await SavedThreadModel.find({ userId: meId, threadId: { $in: threadIds } });
    const savedSet = new Set(saved.map((s) => String(s.threadId)));

    const reposts = await RepostModel.find({ userId: meId, threadId: { $in: threadIds } });
    const repostSet = new Set(reposts.map((r) => String(r.threadId)));

    res.json({
      items: page.map((t) => {
        const author = authorMap.get(String(t.authorId));
        const likedByMe = t.likedBy.map(String).includes(meId);
        return {
          id: String(t._id),
          author: {
            uid: String(t.authorId),
            displayName: author?.displayName ?? 'GymBro',
            photoURL: author?.photoURL ?? '',
          },
          createdAt: t.createdAt,
          text: t.text,
          tags: t.tags,
          media: t.media,
          fitness: t.fitness,
          stats: { likes: t.likeCount, replies: t.replyCount, reposts: t.repostCount },
          likedByMe,
          savedByMe: savedSet.has(String(t._id)),
          repostedByMe: repostSet.has(String(t._id)),
        };
      }),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

threadsRouter.get('/reposts', requireAuth, async (req, res, next) => {
  try {
    const meId = req.auth!.sub;
    const uid = String(req.query.uid ?? '');
    if (!mongoose.isValidObjectId(uid)) throw Object.assign(new Error('Not found'), { status: 404 });

    const targetId = new mongoose.Types.ObjectId(uid);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

    const q: Record<string, unknown> = { userId: targetId };
    if (cursor && !Number.isNaN(cursor.getTime())) {
      q.createdAt = { $lt: cursor };
    }

    const repostDocs = await RepostModel.find(q).sort({ createdAt: -1 }).limit(limit + 1);
    const nextCursor = repostDocs.length > limit ? repostDocs[limit]!.createdAt : null;
    const page = repostDocs.slice(0, limit);

    const threadIds = page.map((r) => r.threadId);
    const threads = await ThreadModel.find({ _id: { $in: threadIds } });
    const threadMap = new Map(threads.map((t) => [String(t._id), t]));

    const existingThreads = page.map((r) => threadMap.get(String(r.threadId))).filter(Boolean) as any[];

    const authorIds = Array.from(new Set(existingThreads.map((t) => String(t.authorId))));
    const authors = await UserModel.find({ _id: { $in: authorIds } });
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));

    const saved = await SavedThreadModel.find({ userId: meId, threadId: { $in: existingThreads.map((t) => t._id) } });
    const savedSet = new Set(saved.map((s) => String(s.threadId)));

    const reposts = await RepostModel.find({ userId: meId, threadId: { $in: existingThreads.map((t) => t._id) } });
    const repostSet = new Set(reposts.map((r) => String(r.threadId)));

    res.json({
      items: existingThreads.map((t) => {
        const author = authorMap.get(String(t.authorId));
        const likedByMe = t.likedBy.map(String).includes(meId);
        return {
          id: String(t._id),
          author: {
            uid: String(t.authorId),
            displayName: author?.displayName ?? 'GymBro',
            photoURL: author?.photoURL ?? '',
          },
          createdAt: t.createdAt,
          text: t.text,
          tags: t.tags,
          media: t.media,
          fitness: t.fitness,
          stats: { likes: t.likeCount, replies: t.replyCount, reposts: t.repostCount },
          likedByMe,
          savedByMe: savedSet.has(String(t._id)),
          repostedByMe: repostSet.has(String(t._id)),
        };
      }),
      nextCursor: nextCursor ? nextCursor.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

threadsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body?.text ?? '').trim();

    const mediaRaw = Array.isArray(req.body?.media) ? req.body.media : [];

    const media: MediaItem[] = mediaRaw
      .filter(Boolean)
      .map((m: any): MediaItem => ({
        type: m?.type,
        url: m?.url,
        width: m?.width,
        height: m?.height,
        duration: m?.duration,
      }));

    if (!text && media.length === 0) throw Object.assign(new Error('text or media is required'), { status: 400 });

    if (media.length > 6) throw Object.assign(new Error('Too many media items'), { status: 400 });

    for (const m of media) {
      const okType = m.type === 'image' || m.type === 'video';
      const okUrl = typeof m.url === 'string' && m.url.length > 0;
      if (!okType || !okUrl) throw Object.assign(new Error('Invalid media'), { status: 400 });
    }

    const hasVideo = media.some((m: MediaItem) => m.type === 'video');
    const hasImage = media.some((m: MediaItem) => m.type === 'image');
    if (hasVideo && hasImage) throw Object.assign(new Error('Only multiple images OR a single video is allowed'), { status: 400 });
    if (hasVideo && media.length > 1) throw Object.assign(new Error('Only 1 video is allowed per post'), { status: 400 });

    const fitness = req.body?.fitness && typeof req.body.fitness === 'object' ? req.body.fitness : undefined;

    const t = await ThreadModel.create({
      authorId: new mongoose.Types.ObjectId(req.auth!.sub),
      text,
      tags: text ? extractTags(text) : [],
      media,
      fitness,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      likedBy: [],
    });

    {
      const authorId = new mongoose.Types.ObjectId(req.auth!.sub);
      const [followingDocs, followerDocs] = await Promise.all([
        FollowModel.find({ followerId: authorId }).select({ followingId: 1 }),
        FollowModel.find({ followingId: authorId }).select({ followerId: 1 }),
      ]);

      const followingSet = new Set(followingDocs.map((d: any) => String(d.followingId)));
      const recipientIds = followerDocs
        .map((d: any) => String(d.followerId))
        .filter((id: string) => followingSet.has(id));

      if (recipientIds.length > 0) {
        await NotificationModel.insertMany(
          recipientIds.map((rid) => ({
            recipientId: new mongoose.Types.ObjectId(rid),
            actorId: authorId,
            type: 'post',
            entityType: 'thread',
            entityId: t._id,
            text: 'posted a new post',
            readAt: null,
          }))
        );

        const io = req.app.get('io');
        if (io) {
          for (const rid of recipientIds) {
            const recipientSocketId = onlineUsers.get(rid);
            if (!recipientSocketId) continue;
            io.to(recipientSocketId).emit('new-notification', {
              type: 'post',
              entityType: 'thread',
              entityId: String(t._id),
              actorId: String(authorId),
              recipientId: rid,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    res.status(201).json({ id: String(t._id) });
  } catch (err) {
    next(err);
  }
});

// ...

// ==================== ✅ UPDATED LIKE ====================
threadsRouter.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Not found'), { status: 404 });

    const thread = await ThreadModel.findById(id);
    const userId = req.auth!.sub;
    const liked = thread.likedBy.map(String).includes(userId);
    const nextLikedBy = liked
      ? thread.likedBy.filter((x: mongoose.Types.ObjectId) => String(x) !== userId)
      : [...thread.likedBy, new mongoose.Types.ObjectId(userId)];

    thread.likedBy = nextLikedBy;
    thread.likeCount = liked ? Math.max(0, thread.likeCount - 1) : thread.likeCount + 1;
    await thread.save();

    const isSelf = String(thread.authorId) === String(userId);
    if (!isSelf) {
      const io = req.app.get('io'); // ✅ Lấy Socket.IO instance

      if (!liked) {
        // Like - tạo notification

        const notif = await NotificationModel.create({
          recipientId: new mongoose.Types.ObjectId(String(thread.authorId)),
          actorId: new mongoose.Types.ObjectId(userId),
          type: 'like',
          entityType: 'thread',
          entityId: new mongoose.Types.ObjectId(id),
          text: 'liked your post',
        });

        // ✅ Gửi thông báo đến người dùng
        if (io) {
          const recipientId = String(thread.authorId);
          const recipientSocketId = onlineUsers.get(recipientId);
          if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-notification', {
              id: String(notif._id),
              type: 'like',
              entityType: 'thread',
              entityId: id,
              actorId: userId,
              text: 'liked your post',
              recipientId,
              createdAt: notif.createdAt,
            });
          }
        }
      } else {
        // Unlike - xóa notification
        await NotificationModel.deleteMany({
          recipientId: new mongoose.Types.ObjectId(String(thread.authorId)),
          actorId: new mongoose.Types.ObjectId(userId),
          type: 'like',
          entityType: 'thread',
          entityId: new mongoose.Types.ObjectId(id),
        });
      }
    }

    res.json({ likedByMe: !liked, likeCount: thread.likeCount });
  } catch (err) {
    next(err);
  }
});

threadsRouter.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Not found'), { status: 404 });

    const thread = await ThreadModel.findById(id);
    if (!thread) throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = String(req.auth!.sub);
    const threadId = new mongoose.Types.ObjectId(id);

    const comments = await CommentModel.find({ threadId }).sort({ createdAt: -1 }).limit(200);

    const authorIds = Array.from(new Set(comments.map((c: any) => String(c.authorId))));
    const authors = await UserModel.find({ _id: { $in: authorIds } });
    const authorMap = new Map(authors.map((a: any) => [String(a._id), a]));

    const byId = new Map<string, any>();
    for (const c of comments) {
      const author = authorMap.get(String((c as any).authorId));
      const id = String((c as any)._id);
      byId.set(id, {
        id,
        parentCommentId: (c as any).parentCommentId ? String((c as any).parentCommentId) : null,
        author: {
          uid: String((c as any).authorId),
          displayName: author?.displayName ?? 'GymBro',
          photoURL: author?.photoURL ?? '',
        },
        text: (c as any).text,
        createdAt: (c as any).createdAt,
        likeCount: (c as any).likeCount,
        likedByMe: (c as any).likedBy.map(String).includes(meId),
        replies: [],
      });
    }

    const roots: any[] = [];
    for (const item of byId.values()) {
      const pid = item.parentCommentId;
      if (pid && byId.has(pid)) {
        byId.get(pid)!.replies.push(item);
      } else {
        roots.push(item);
      }
    }

    res.json({
      items: roots,
    });
  } catch (err) {
    next(err);
  }
});

threadsRouter.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Not found'), { status: 404 });

    const text = String(req.body?.text ?? '').trim();
    if (!text) throw Object.assign(new Error('text is required'), { status: 400 });

    const parentCommentIdRaw = req.body?.parentCommentId !== undefined ? String(req.body.parentCommentId) : '';
    const hasParent = !!parentCommentIdRaw;
    if (hasParent && !mongoose.isValidObjectId(parentCommentIdRaw)) {
      throw Object.assign(new Error('Invalid parentCommentId'), { status: 400 });
    }

    const thread = await ThreadModel.findById(id);
    if (!thread) throw Object.assign(new Error('Not found'), { status: 404 });

    let parent: any = null;
    if (hasParent) {
      parent = await CommentModel.findOne({
        _id: new mongoose.Types.ObjectId(parentCommentIdRaw),
        threadId: new mongoose.Types.ObjectId(id),
      });
      if (!parent) throw Object.assign(new Error('Parent comment not found'), { status: 404 });
      if ((parent as any).parentCommentId) {
        throw Object.assign(new Error('Only one level of replies is supported'), { status: 400 });
      }
    }

    const c = await CommentModel.create({
      threadId: new mongoose.Types.ObjectId(id),
      parentCommentId: hasParent ? new mongoose.Types.ObjectId(parentCommentIdRaw) : null,
      authorId: new mongoose.Types.ObjectId(req.auth!.sub),
      text,
    });

    thread.replyCount += 1;
    await thread.save();

    const userId = req.auth!.sub;
    const io = req.app.get('io');

    const recipientUserId = hasParent ? String((parent as any).authorId) : String(thread.authorId);
    const isSelf = String(recipientUserId) === String(userId);
    if (!isSelf) {
      const preview = text.substring(0, 50);
      const notifText = hasParent ? `replied: "${preview}..."` : `commented: "${preview}..."`;
      const notif = await NotificationModel.create({
        recipientId: new mongoose.Types.ObjectId(recipientUserId),
        actorId: new mongoose.Types.ObjectId(userId),
        type: 'comment',
        entityType: 'thread',
        entityId: new mongoose.Types.ObjectId(id),
        text: notifText,
      });

      if (io) {
        const recipientSocketId = onlineUsers.get(recipientUserId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new-notification', {
            id: String(notif._id),
            type: 'comment',
            entityType: 'thread',
            entityId: id,
            actorId: userId,
            text: notifText,
            recipientId: recipientUserId,
            createdAt: notif.createdAt,
          });
        }
      }
    }

    res.status(201).json({ id: String(c._id) });
  } catch (err) {
    next(err);
  }
});

threadsRouter.delete('/:threadId/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const threadIdRaw = String(req.params.threadId);
    const commentIdRaw = String(req.params.commentId);
    if (!mongoose.isValidObjectId(threadIdRaw)) throw Object.assign(new Error('Not found'), { status: 404 });
    if (!mongoose.isValidObjectId(commentIdRaw)) throw Object.assign(new Error('Not found'), { status: 404 });

    const thread = await ThreadModel.findById(threadIdRaw);
    if (!thread) throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = new mongoose.Types.ObjectId(req.auth!.sub);
    const comment = await CommentModel.findOne({
      _id: new mongoose.Types.ObjectId(commentIdRaw),
      threadId: new mongoose.Types.ObjectId(threadIdRaw),
    });
    if (!comment) throw Object.assign(new Error('Not found'), { status: 404 });

    if (String(comment.authorId) !== String(meId)) throw Object.assign(new Error('Forbidden'), { status: 403 });

    const replies = await CommentModel.find({
      threadId: new mongoose.Types.ObjectId(threadIdRaw),
      parentCommentId: new mongoose.Types.ObjectId(commentIdRaw),
    }).select({ _id: 1 });

    const deleteIds = [new mongoose.Types.ObjectId(commentIdRaw), ...replies.map((r: any) => r._id)];
    const deletedCount = deleteIds.length;

    await CommentModel.deleteMany({ _id: { $in: deleteIds }, threadId: new mongoose.Types.ObjectId(threadIdRaw) });
    thread.replyCount = Math.max(0, thread.replyCount - deletedCount);
    await thread.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

threadsRouter.post('/:threadId/comments/:commentId/like', requireAuth, async (req, res, next) => {
  try {
    const threadIdRaw = String(req.params.threadId);
    const commentIdRaw = String(req.params.commentId);
    if (!mongoose.isValidObjectId(threadIdRaw)) throw Object.assign(new Error('Not found'), { status: 404 });
    if (!mongoose.isValidObjectId(commentIdRaw)) throw Object.assign(new Error('Not found'), { status: 404 });

    const thread = await ThreadModel.findById(threadIdRaw);
    if (!thread) throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = new mongoose.Types.ObjectId(req.auth!.sub);
    const comment = await CommentModel.findOne({
      _id: new mongoose.Types.ObjectId(commentIdRaw),
      threadId: new mongoose.Types.ObjectId(threadIdRaw),
    });
    if (!comment) throw Object.assign(new Error('Not found'), { status: 404 });

    const liked = comment.likedBy.map(String).includes(String(meId));
    comment.likedBy = liked
      ? comment.likedBy.filter((x: mongoose.Types.ObjectId) => String(x) !== String(meId))
      : [...comment.likedBy, meId];
    comment.likeCount = liked ? Math.max(0, comment.likeCount - 1) : comment.likeCount + 1;
    await comment.save();

    res.json({ likedByMe: !liked, likeCount: comment.likeCount });
  } catch (err) {
    next(err);
  }
});

// ...

// ==================== ✅ UPDATED REPOST ====================
threadsRouter.post('/:id/repost', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Not found'), { status: 404 });

    const thread = await ThreadModel.findById(id);
    if (!thread) throw Object.assign(new Error('Not found'), { status: 404 });

    const meId = new mongoose.Types.ObjectId(req.auth!.sub);
    const threadId = new mongoose.Types.ObjectId(id);
    const io = req.app.get('io'); // 

    const existing = await RepostModel.findOne({ userId: meId, threadId });
    const isSelf = String(thread.authorId) === String(meId);

    if (existing) {
      await existing.deleteOne();
      thread.repostCount = Math.max(0, thread.repostCount - 1);
      await thread.save();

      if (!isSelf) {
        await NotificationModel.deleteMany({
          recipientId: new mongoose.Types.ObjectId(String(thread.authorId)),
          actorId: meId,
          type: 'repost',
          entityType: 'thread',
          entityId: threadId,
        });
      }

      res.json({ repostedByMe: false, repostCount: thread.repostCount });
      return;
    }

    await RepostModel.create({ userId: meId, threadId });
    thread.repostCount += 1;
    await thread.save();

    if (!isSelf) {
      const notif = await NotificationModel.create({
        recipientId: new mongoose.Types.ObjectId(String(thread.authorId)),
        actorId: meId,
        type: 'repost',
        entityType: 'thread',
        entityId: threadId,
        text: 'reposted your post',
      });

      // 
      if (io) {
        const recipientId = String(thread.authorId);
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new-notification', {
            id: String(notif._id),
            type: 'repost',
            entityType: 'thread',
            entityId: id,
            actorId: String(meId),
            text: 'reposted your post',
            recipientId,
            createdAt: notif.createdAt,
          });
        }
      }
    }

    res.json({ repostedByMe: true, repostCount: thread.repostCount });
  } catch (err) {
    next(err);
  }
});