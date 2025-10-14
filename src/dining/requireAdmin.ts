import type { NextFunction, Request, Response } from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { roleAtLeast, Roles, normalizeRole } = require('../utils/rbac.js') as {
  roleAtLeast: (current: string, minimum: string) => boolean;
  Roles: Record<string, string>;
  normalizeRole: (role: string | null | undefined) => string;
};

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role ? normalizeRole(req.user.role) : null;
  if (!req.user || !role || !roleAtLeast(role, Roles.ADMIN)) {
    res.status(req.user ? 403 : 401).json({ error: req.user ? 'Forbidden' : 'Unauthorized' });
    return;
  }
  next();
}
