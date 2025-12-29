import jwt from 'jsonwebtoken';

export function signAccessToken(payload: { sub: string; email: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');

  return jwt.sign(payload, secret, { expiresIn: '7d' });
}
