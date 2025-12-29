import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User.js';
import { signAccessToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, registerValidation, loginValidation } from '../middleware/validation.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerValidation), async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const displayName = String(req.body?.displayName ?? '').trim();

    if (!email || !password || !displayName) {
      throw Object.assign(new Error('email, password, displayName are required'), { status: 400 });
    }

    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw Object.assign(new Error('Email already in use'), { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ email, passwordHash, displayName });

    const token = signAccessToken({ sub: String(user._id), email: user.email });

    res.json({
      token,
      user: {
        uid: String(user._id),
        email: user.email,
        displayName: user.displayName,
        bio: user.bio ?? '',
        photoURL: user.photoURL ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', validate(loginValidation), async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      throw Object.assign(new Error('email and password are required'), { status: 400 });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    const token = signAccessToken({ sub: String(user._id), email: user.email });

    res.json({
      token,
      user: {
        uid: String(user._id),
        email: user.email,
        displayName: user.displayName,
        bio: user.bio ?? '',
        photoURL: user.photoURL ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const user = await UserModel.findById(userId);
    if (!user) throw Object.assign(new Error('Not found'), { status: 404 });

    res.json({
      uid: String(user._id),
      email: user.email,
      displayName: user.displayName,
      bio: user.bio ?? '',
      photoURL: user.photoURL ?? '',
    });
  } catch (err) {
    next(err);
  }
});
