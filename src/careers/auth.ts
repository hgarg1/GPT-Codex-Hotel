import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/verifySession';

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as AuthenticatedUser | undefined;
  if (!user || !user.email) {
    res.status(403).send('Forbidden');
    return;
  }

  if (!adminEmails.has(user.email.toLowerCase())) {
    res.status(403).send('Forbidden');
    return;
  }

  next();
}
