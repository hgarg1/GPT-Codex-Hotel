import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { generateTrackingIdForStatus } from './tracking';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'careers.db');

export const db = new Database(process.env.CAREERS_DB_PATH || DEFAULT_DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const createJobsTableSQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT,
  department TEXT,
  employment_type TEXT,
  description TEXT,
  requirements TEXT,
  posted_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
`;

const createApplicationsTableSQL = `
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  answers_json TEXT NOT NULL,
  resume_path TEXT,
  cover_letter_path TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  tracking_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function initializeSchema(): void {
  db.exec(createJobsTableSQL);
  db.exec(createApplicationsTableSQL);
}

function seedJobs(): string[] {
  const countStatement = db.prepare('SELECT COUNT(*) as count FROM jobs');
  const { count } = countStatement.get() as { count: number };
  if (count > 0) {
    const idsStatement = db.prepare('SELECT id FROM jobs ORDER BY posted_at DESC LIMIT 2');
    return idsStatement.all().map((row: { id: string }) => row.id);
  }

  const nowIso = new Date().toISOString();

  const frontendId = crypto.randomUUID();
  const operationsId = crypto.randomUUID();

  const insertJob = db.prepare(
    `INSERT INTO jobs (id, title, location, department, employment_type, description, requirements, posted_at, is_active)
     VALUES (@id, @title, @location, @department, @employment_type, @description, @requirements, @posted_at, @is_active)`
  );

  insertJob.run({
    id: frontendId,
    title: 'Frontend Engineer',
    location: 'Remote - North America',
    department: 'Engineering',
    employment_type: 'Full-time',
    description:
      '<p>Design immersive, accessible interfaces for interstellar guests. Collaborate with product and design to build responsive experiences.</p>',
    requirements: ['5+ years modern frontend experience', 'Expertise in React and TypeScript', 'Track record shipping polished UX'].join('\n'),
    posted_at: nowIso,
    is_active: 1,
  });

  insertJob.run({
    id: operationsId,
    title: 'Restaurant Operations Manager',
    location: 'On-site — Aurora Spire',
    department: 'Hospitality',
    employment_type: 'Full-time',
    description:
      '<p>Lead our signature dining venues with operational excellence. Mentor stellar teams, refine service rituals, and elevate guest satisfaction.</p>',
    requirements: ['7+ years luxury dining leadership', 'Passion for hospitality innovation', 'Certified sommelier or equivalent'].join('\n'),
    posted_at: nowIso,
    is_active: 1,
  });

  return [frontendId, operationsId];
}

function seedApplication(jobIds: string[]): void {
  if (!jobIds.length) return;
  const countStatement = db.prepare('SELECT COUNT(*) as count FROM applications');
  const { count } = countStatement.get() as { count: number };
  if (count > 0) {
    return;
  }

  const nowIso = new Date().toISOString();
  const applicationId = crypto.randomUUID();
  const trackingId = generateTrackingIdForStatus('SUBMITTED');

  const insert = db.prepare(
    `INSERT INTO applications (id, job_id, user_id, full_name, email, phone, answers_json, resume_path, cover_letter_path, status, tracking_id, created_at, updated_at)
     VALUES (@id, @job_id, @user_id, @full_name, @email, @phone, @answers_json, @resume_path, @cover_letter_path, @status, @tracking_id, @created_at, @updated_at)`
  );

  insert.run({
    id: applicationId,
    job_id: jobIds[0],
    user_id: null,
    full_name: 'Taylor Quantum',
    email: 'taylor@example.com',
    phone: '+1-202-555-0130',
    answers_json: JSON.stringify({
      basics: {
        locationEligibility: 'Eligible for remote work in North America',
      },
      experience: {
        years: '6',
        skills: ['React', 'TypeScript', 'Design Systems'],
      },
      role: {
        motivation: 'Excited to craft luminous guest journeys.',
        proudest: 'Launched award-winning hospitality app.',
      },
    }),
    resume_path: null,
    cover_letter_path: null,
    status: 'SUBMITTED',
    tracking_id: trackingId,
    created_at: nowIso,
    updated_at: nowIso,
  });
}

export function seedCareersData(): void {
  initializeSchema();
  const jobIds = seedJobs();
  seedApplication(jobIds);
}

export function ensureUploadsDir(uploadDir: string): void {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}
