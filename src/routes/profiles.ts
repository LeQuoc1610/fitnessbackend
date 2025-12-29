import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UserModel } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

export const profilesRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadsDir();
      cb(null, UPLOADS_DIR);
    } catch (e) {
      cb(e as Error, UPLOADS_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 16);
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    cb(null, `avatar_${Date.now()}_${id}${ext}`);
  },
});

function avatarFileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const isImage = file.mimetype.startsWith('image/');
  if (!isImage) {
    cb(Object.assign(new Error('Only image files are allowed'), { status: 400 }));
    return;
  }
  cb(null, true);
}

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
});

profilesRouter.get('/:uid', async (req, res, next) => {
  try {
    const uid = String(req.params.uid);
    if (!mongoose.isValidObjectId(uid)) {
      throw Object.assign(new Error('Profile not found'), { status: 404 });
    }

    const user = await UserModel.findById(uid);
    if (!user) {
      throw Object.assign(new Error('Profile not found'), { status: 404 });
    }

    res.json({
      uid: String(user._id),
      email: user.email,
      displayName: user.displayName,
      bio: user.bio ?? '',
      photoURL: user.photoURL ?? '',
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

profilesRouter.put('/me/avatar', requireAuth, uploadAvatar.single('avatar'), async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw Object.assign(new Error('avatar file is required'), { status: 400 });
    }

    const prev = await UserModel.findById(userId).select('photoURL');
    if (!prev) throw Object.assign(new Error('Not found'), { status: 404 });

    const nextPhotoURL = `/uploads/${encodeURIComponent(file.filename)}`;

    const user = await UserModel.findByIdAndUpdate(userId, { photoURL: nextPhotoURL }, { new: true });
    if (!user) throw Object.assign(new Error('Not found'), { status: 404 });

    const prevPhoto = typeof prev.photoURL === 'string' ? prev.photoURL : '';
    if (prevPhoto.startsWith('/uploads/')) {
      const prevFilename = decodeURIComponent(prevPhoto.slice('/uploads/'.length));
      const prevPath = path.resolve(UPLOADS_DIR, prevFilename);
      if (prevPath.startsWith(UPLOADS_DIR) && fs.existsSync(prevPath)) {
        try {
          fs.unlinkSync(prevPath);
        } catch {
        }
      }
    }

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

profilesRouter.put('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;

    const displayName = req.body?.displayName !== undefined ? String(req.body.displayName).trim() : undefined;
    const bio = req.body?.bio !== undefined ? String(req.body.bio) : undefined;
    const photoURL = req.body?.photoURL !== undefined ? String(req.body.photoURL) : undefined;

    if (displayName !== undefined && !displayName) {
      throw Object.assign(new Error('displayName is required'), { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio !== undefined) update.bio = bio;
    if (photoURL !== undefined) update.photoURL = photoURL;

    const user = await UserModel.findByIdAndUpdate(userId, update, { new: true });
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
