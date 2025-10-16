import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/verifySession';
import { normalizeRole, roleAtLeast, Roles } from '../utils/rbac.js';

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

  const normalizedRole = user.role ? normalizeRole(user.role) : undefined;
  if (
    (normalizedRole && roleAtLeast(normalizedRole, Roles.ADMIN)) ||
    adminEmails.has(user.email.toLowerCase())
  ) {
    next();
    return;
  }

  res.status(403).send('Forbidden');
}
