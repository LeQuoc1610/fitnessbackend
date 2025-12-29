import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { WorkoutModel } from '../models/Workout.js';

export const workoutsRouter = Router();

workoutsRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const items = await WorkoutModel.find({ userId: req.auth!.sub }).sort({ date: -1 }).limit(60);
    res.json({
      items: items.map((w) => ({
        id: String(w._id),
        date: w.date,
        durationMinutes: w.durationMinutes,
        exercises: w.exercises,
      })),
    });
  } catch (err) {
    next(err);
  }
});

workoutsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const date = new Date(String(req.body?.date ?? ''));
    const durationMinutes = Number(req.body?.durationMinutes ?? NaN);
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];

    if (Number.isNaN(date.getTime())) throw Object.assign(new Error('date is required'), { status: 400 });
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw Object.assign(new Error('durationMinutes must be > 0'), { status: 400 });
    }

    const doc = await WorkoutModel.create({
      userId: new mongoose.Types.ObjectId(req.auth!.sub),
      date,
      durationMinutes,
      exercises,
    });

    res.status(201).json({ id: String(doc._id) });
  } catch (err) {
    next(err);
  }
});
