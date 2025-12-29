import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { UserModel } from '../models/User.js';

export const usersRouter = Router();

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

usersRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const qRaw = String(req.query.q ?? '').trim();
    if (!qRaw) {
      res.json({ items: [] });
      return;
    }

    const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 8)));
    const q = escapeRegExp(qRaw);

    const re = new RegExp(q, 'i');

    const users = await UserModel.find({
      $or: [{ displayName: re }, { email: re }],
    })
      .select('displayName photoURL email')
      .sort({ displayName: 1 })
      .limit(limit);

    res.json({
      items: users.map((u) => ({
        uid: String(u._id),
        displayName: u.displayName,
        photoURL: u.photoURL ?? '',
        email: u.email,
      })),
    });
  } catch (err) {
    next(err);
  }
});
