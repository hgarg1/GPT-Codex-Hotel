import crypto from 'node:crypto';

export type ApplicationStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export function generateTrackingBase(): string {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const randomBytes = crypto.randomBytes(4).readUInt32BE(0);
  const randomPart = randomBytes.toString(36).toUpperCase().slice(0, 6).padEnd(6, '0');
  return `CARE-${datePart}-${randomPart}`;
}

export function withStatus(base: string, status: ApplicationStatus): string {
  return `${base} (${status})`;
}

export function generateTrackingIdForStatus(status: ApplicationStatus): string {
  return withStatus(generateTrackingBase(), status);
}

export function updateTrackingStatus(currentTrackingId: string, status: ApplicationStatus): string {
  const base = currentTrackingId.split(' (')[0];
  return withStatus(base, status);
}
