import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../middleware/auth.js';

export const uploadsRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
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
    cb(null, `${Date.now()}_${id}${ext}`);
  },
});

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const isImage = ALLOWED_IMAGE_MIME.has(file.mimetype);
  const isVideo = ALLOWED_VIDEO_MIME.has(file.mimetype);
  if (!isImage && !isVideo) {
    cb(Object.assign(new Error('Unsupported file type'), { status: 400 }));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 6,
    fileSize: MAX_VIDEO_BYTES,
  },
});

uploadsRouter.post('/', requireAuth, upload.array('files', 6), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const hasVideo = files.some((f) => ALLOWED_VIDEO_MIME.has(f.mimetype));
    const hasImage = files.some((f) => ALLOWED_IMAGE_MIME.has(f.mimetype));
    const invalidMix = hasVideo && hasImage;
    const tooManyVideos = hasVideo && files.length > 1;
    const tooManyFiles = files.length > 6;

    const tooLarge = files.some((f) => {
      if (ALLOWED_VIDEO_MIME.has(f.mimetype)) return f.size > MAX_VIDEO_BYTES;
      if (ALLOWED_IMAGE_MIME.has(f.mimetype)) return f.size > MAX_IMAGE_BYTES;
      return true;
    });

    if (invalidMix || tooManyVideos || tooManyFiles || tooLarge) {
      for (const f of files) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          // ignore
        }
      }

      if (invalidMix) throw Object.assign(new Error('Only multiple images OR a single video is allowed'), { status: 400 });
      if (tooManyVideos) throw Object.assign(new Error('Only 1 video is allowed per post'), { status: 400 });
      if (tooLarge) throw Object.assign(new Error('File is too large'), { status: 413 });
      if (tooManyFiles) throw Object.assign(new Error('Too many files'), { status: 400 });
    }

    const items = files.map((f) => {
      const type = f.mimetype.startsWith('video/') ? 'video' : 'image';
      return {
        type,
        url: `/uploads/${encodeURIComponent(f.filename)}`,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
      };
    });

    res.status(201).json({ items });
  } catch (err) {
    next(err);
  }
});
