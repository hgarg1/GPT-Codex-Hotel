import crypto from 'node:crypto';
import { db } from './db';
import type { ApplicationStatus } from './tracking';
import { generateTrackingIdForStatus, updateTrackingStatus } from './tracking';

export interface ApplicationRecord {
  id: string;
  job_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  answers_json: string;
  resume_path: string | null;
  cover_letter_path: string | null;
  status: ApplicationStatus;
  tracking_id: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationWithJob extends ApplicationRecord {
  job_title: string;
}

export interface CreateApplicationInput {
  jobId: string;
  userId?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  answers: unknown;
  resumePath?: string | null;
  coverLetterPath?: string | null;
  status?: ApplicationStatus;
}

export function createApplication(input: CreateApplicationInput & { id?: string }): ApplicationRecord {
  const id = input.id ?? crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status: ApplicationStatus = input.status ?? 'SUBMITTED';
  const trackingId = generateTrackingIdForStatus(status);

  const statement = db.prepare(
    `INSERT INTO applications (id, job_id, user_id, full_name, email, phone, answers_json, resume_path, cover_letter_path, status, tracking_id, created_at, updated_at)
     VALUES (@id, @job_id, @user_id, @full_name, @email, @phone, @answers_json, @resume_path, @cover_letter_path, @status, @tracking_id, @created_at, @updated_at)`
  );

  statement.run({
    id,
    job_id: input.jobId,
    user_id: input.userId ?? null,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    answers_json: JSON.stringify(input.answers ?? {}),
    resume_path: input.resumePath ?? null,
    cover_letter_path: input.coverLetterPath ?? null,
    status,
    tracking_id: trackingId,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return getApplicationById(id) as ApplicationRecord;
}

export interface ApplicationsFilter {
  jobId?: string;
  status?: ApplicationStatus;
  startDate?: string;
  endDate?: string;
}

export function listApplications(filters: ApplicationsFilter = {}): ApplicationWithJob[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.jobId) {
    clauses.push('applications.job_id = @jobId');
    params.jobId = filters.jobId;
  }
  if (filters.status) {
    clauses.push('applications.status = @status');
    params.status = filters.status;
  }
  if (filters.startDate) {
    clauses.push('datetime(applications.created_at) >= datetime(@startDate)');
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    clauses.push('datetime(applications.created_at) <= datetime(@endDate)');
    params.endDate = filters.endDate;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `
    SELECT applications.*, jobs.title as job_title
    FROM applications
    JOIN jobs ON jobs.id = applications.job_id
    ${where}
    ORDER BY datetime(applications.created_at) DESC
  `;

  const statement = db.prepare(sql);
  return statement.all(params) as ApplicationWithJob[];
}

export function getApplicationById(id: string): ApplicationRecord | undefined {
  const statement = db.prepare('SELECT * FROM applications WHERE id = ?');
  const record = statement.get(id) as ApplicationRecord | undefined;
  if (!record) return undefined;
  return record;
}

export function getApplicationByTrackingId(trackingId: string): ApplicationWithJob | undefined {
  const statement = db.prepare(
    `SELECT applications.*, jobs.title as job_title
     FROM applications
     JOIN jobs ON jobs.id = applications.job_id
     WHERE applications.tracking_id = ?`
  );
  return statement.get(trackingId) as ApplicationWithJob | undefined;
}

export function updateApplicationStatus(id: string, status: ApplicationStatus): ApplicationRecord | undefined {
  const application = getApplicationById(id);
  if (!application) {
    return undefined;
  }

  const trackingId = updateTrackingStatus(application.tracking_id, status);
  const nowIso = new Date().toISOString();

  db.prepare('UPDATE applications SET status = ?, tracking_id = ?, updated_at = ? WHERE id = ?').run(
    status,
    trackingId,
    nowIso,
    id
  );

  return getApplicationById(id) ?? undefined;
}

export function countApplicationsByStatus(): Record<ApplicationStatus, number> {
  const statement = db.prepare(
    `SELECT status, COUNT(*) as total
     FROM applications
     GROUP BY status`
  );
  const rows = statement.all() as { status: ApplicationStatus; total: number }[];
  return rows.reduce(
    (acc, row) => {
      acc[row.status] = row.total;
      return acc;
    },
    { SUBMITTED: 0, IN_REVIEW: 0, APPROVED: 0, REJECTED: 0 } as Record<ApplicationStatus, number>
  );
}
