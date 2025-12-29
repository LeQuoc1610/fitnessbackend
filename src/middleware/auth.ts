import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export type AuthPayload = {
  sub: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    return next(Object.assign(new Error('Unauthorized'), { status: 401 }));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(Object.assign(new Error('JWT_SECRET is required'), { status: 500 }));
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthPayload;
    req.auth = decoded;
    return next();
  } catch {
    return next(Object.assign(new Error('Unauthorized'), { status: 401 }));
  }
};
