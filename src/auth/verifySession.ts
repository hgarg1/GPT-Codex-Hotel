import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_JWT_SECRET } = require('../utils/jwtDefaults.js') as { DEFAULT_JWT_SECRET: string };

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

function resolveVerificationConfig(): { key: string; algorithms: jwt.Algorithm[] } | null {
  const algorithmEnv = process.env.HOTEL_JWT_ALGORITHM;
  const preferredAlgorithm = algorithmEnv && typeof algorithmEnv === 'string' ? (algorithmEnv as jwt.Algorithm) : undefined;

  if (process.env.HOTEL_JWT_PUBLIC_KEY) {
    return {
      key: process.env.HOTEL_JWT_PUBLIC_KEY,
      algorithms: [preferredAlgorithm && preferredAlgorithm.startsWith('RS') ? preferredAlgorithm : 'RS256'],
    };
  }

  const sharedSecret = process.env.HOTEL_JWT_SECRET || DEFAULT_JWT_SECRET;
  return {
    key: sharedSecret,
    algorithms: [preferredAlgorithm && preferredAlgorithm.startsWith('HS') ? preferredAlgorithm : 'HS256'],
  };
}

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

    const verification = resolveVerificationConfig();
    if (!verification) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const payload = jwt.verify(token, verification.key, {
      algorithms: verification.algorithms,
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
