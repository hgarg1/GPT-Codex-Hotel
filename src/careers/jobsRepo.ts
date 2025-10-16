import { db } from './db';

export interface JobRecord {
  id: string;
  title: string;
  location: string | null;
  department: string | null;
  employment_type: string | null;
  description: string | null;
  requirements: string | null;
  posted_at: string;
  is_active: number;
}

export interface JobFilters {
  query?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  includeInactive?: boolean;
}

export function listJobs(filters: JobFilters = {}): JobRecord[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (!filters.includeInactive) {
    clauses.push('is_active = 1');
  }
  if (filters.department) {
    clauses.push('department = @department');
    params.department = filters.department;
  }
  if (filters.location) {
    clauses.push('location = @location');
    params.location = filters.location;
  }
  if (filters.employmentType) {
    clauses.push('employment_type = @employmentType');
    params.employmentType = filters.employmentType;
  }
  if (filters.query) {
    clauses.push('(title LIKE @query OR department LIKE @query OR location LIKE @query)');
    params.query = `%${filters.query}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM jobs ${where} ORDER BY datetime(posted_at) DESC`;
  const statement = db.prepare(sql);
  return statement.all(params) as JobRecord[];
}

export function getJobById(id: string): JobRecord | undefined {
  const statement = db.prepare('SELECT * FROM jobs WHERE id = ?');
  return statement.get(id) as JobRecord | undefined;
}

export interface CreateJobInput {
  id: string;
  title: string;
  location?: string | null;
  department?: string | null;
  employment_type?: string | null;
  description?: string | null;
  requirements?: string | null;
  posted_at: string;
  is_active?: number;
}

export function createJob(input: CreateJobInput): JobRecord {
  const statement = db.prepare(
    `INSERT INTO jobs (id, title, location, department, employment_type, description, requirements, posted_at, is_active)
     VALUES (@id, @title, @location, @department, @employment_type, @description, @requirements, @posted_at, @is_active)`
  );
  statement.run({
    ...input,
    is_active: typeof input.is_active === 'number' ? input.is_active : 1,
  });
  return getJobById(input.id) as JobRecord;
}

export interface UpdateJobInput {
  title?: string;
  location?: string | null;
  department?: string | null;
  employment_type?: string | null;
  description?: string | null;
  requirements?: string | null;
  is_active?: number;
}

export function updateJob(id: string, updates: UpdateJobInput): JobRecord | undefined {
  const fields: string[] = [];
  const params: Record<string, unknown> = { id };

  Object.entries(updates).forEach(([key, value]) => {
    if (typeof value === 'undefined') return;
    fields.push(`${key} = @${key}`);
    params[key] = value;
  });

  if (!fields.length) {
    return getJobById(id);
  }

  const sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = @id`;
  db.prepare(sql).run(params);
  return getJobById(id);
}

export function deleteJob(id: string): void {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

export function countActiveJobs(): number {
  const statement = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE is_active = 1');
  const { count } = statement.get() as { count: number };
  return count;
}
