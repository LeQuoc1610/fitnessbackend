import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { PrModel } from '../models/Pr.js';

export const prsRouter = Router();

prsRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const items = await PrModel.find({ userId: req.auth!.sub }).sort({ achievedAt: -1 }).limit(100);
    res.json({
      items: items.map((p) => ({
        id: String(p._id),
        exercise: p.exercise,
        weightKg: p.weightKg,
        achievedAt: p.achievedAt,
        isNew: (p as any).isNewFlag ?? (p as any).isNew ?? false,
      })),
    });
  } catch (err) {
    next(err);
  }
});

prsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const exercise = String(req.body?.exercise ?? '').trim();
    const weightKg = Number(req.body?.weightKg ?? NaN);
    const achievedAt = new Date(String(req.body?.achievedAt ?? ''));
    const isNew = Boolean(req.body?.isNew ?? false);

    if (!exercise) throw Object.assign(new Error('exercise is required'), { status: 400 });
    if (!Number.isFinite(weightKg) || weightKg <= 0) throw Object.assign(new Error('weightKg must be > 0'), { status: 400 });
    if (Number.isNaN(achievedAt.getTime())) throw Object.assign(new Error('achievedAt is required'), { status: 400 });

    const doc = await PrModel.create({
      userId: new mongoose.Types.ObjectId(req.auth!.sub),
      exercise,
      weightKg,
      achievedAt,
      isNewFlag: isNew,
    });

    res.status(201).json({ id: String(doc._id) });
  } catch (err) {
    next(err);
  }
});
