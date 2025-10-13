import type { NextFunction, Request, Response } from 'express';

function parseAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const allowlist = parseAllowlist();
  if (allowlist.size === 0) {
    return false;
  }
  return allowlist.has(email.trim().toLowerCase());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!isEmailAllowed(req.user.email)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return isEmailAllowed(email);
}
