import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';

type JwtUserPayload = JwtPayload & {
  sub?: string;
  email?: string;
  name?: string;
  id?: string;
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const SESSION_COOKIE_NAME = 'session_token';
const EXPECTED_ALGORITHMS: jwt.Algorithm[] = ['RS256'];

export function verifySession(req: Request, res: Response, next: NextFunction): void {
  try {
    const rawCookieHeader = req.headers.cookie;
    if (!rawCookieHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const cookies = parseCookie(rawCookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const publicKey = process.env.HOTEL_JWT_PUBLIC_KEY;
    if (!publicKey) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const payload = jwt.verify(token, publicKey, {
      algorithms: EXPECTED_ALGORITHMS,
    }) as JwtUserPayload;

    const userId = payload.sub ?? payload.id;
    const userEmail = payload.email;

    if (!userId || !userEmail) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.user = {
      id: userId,
      email: userEmail,
      name: payload.name ?? null,
    };

    next();
  } catch (error) {
    console.warn('Failed to verify session token', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}
