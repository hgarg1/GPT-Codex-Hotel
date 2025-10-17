import express, { type Request, type Response, type Express, type NextFunction } from 'express';
import multer from 'multer';
import sanitizeHtml, { type IOptions } from 'sanitize-html';
import crypto from 'node:crypto';
import { parse as parseCookie } from 'cookie';
import { seedCareersData } from './db';
import {
  listJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  countActiveJobs,
  type JobRecord,
} from './jobsRepo';
import {
  createApplication,
  listApplications,
  getApplicationById,
  getApplicationByTrackingId,
  updateApplicationStatus,
  countApplicationsByStatus,
  type ApplicationsFilter,
} from './applicationsRepo';
import type { ApplicationStatus } from './tracking';
import { getWizardState, mergeWizardState, clearWizardState } from './wizardSession';
import { persistApplicationFiles, resolveAbsolutePath, fileExists, getStoredExtension } from './uploads';
import type { PendingUpload } from './uploads';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

type LimiterEntry = { count: number; resetAt: number };

type CsrfRecord = { token: string; expiresAt: number };

const ADMIN_CSRF_TTL_MS = 15 * 60 * 1000;
const adminCsrfStore = new Map<string, CsrfRecord>();

function createInMemoryLimiter(limit: number, windowMs: number) {
  const store = new Map<string, LimiterEntry>();
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'anonymous';
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= limit) {
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
      return;
    }
    entry.count += 1;
    store.set(key, entry);
    next();
  };
}

const applyStepLimiter = createInMemoryLimiter(30, 15 * 60 * 1000);
const applySubmitLimiter = createInMemoryLimiter(10, 15 * 60 * 1000);

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function pruneAdminCsrfStore(): void {
  const now = Date.now();
  for (const [key, record] of adminCsrfStore.entries()) {
    if (record.expiresAt <= now) {
      adminCsrfStore.delete(key);
    }
  }
}

function getSessionToken(req: Request): string | null {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) {
    return null;
  }
  try {
    const cookies = parseCookie(rawCookie);
    return cookies.session_token || null;
  } catch {
    return null;
  }
}

function rememberAdminCsrfToken(req: Request, token?: string): void {
  if (!token) return;
  const sessionToken = getSessionToken(req);
  if (!sessionToken) return;
  pruneAdminCsrfStore();
  adminCsrfStore.set(sessionToken, { token, expiresAt: Date.now() + ADMIN_CSRF_TTL_MS });
}

function validateAdminCsrfToken(req: Request, candidate?: string): boolean {
  if (!candidate) return false;
  const sessionToken = getSessionToken(req);
  if (!sessionToken) return false;
  pruneAdminCsrfStore();
  const record = adminCsrfStore.get(sessionToken);
  if (!record) return false;
  if (record.expiresAt <= Date.now()) {
    adminCsrfStore.delete(sessionToken);
    return false;
  }
  const matches = record.token === candidate;
  if (matches) {
    adminCsrfStore.set(sessionToken, { token: record.token, expiresAt: Date.now() + ADMIN_CSRF_TTL_MS });
  }
  return matches;
}

function extractAdminCsrfCandidate(req: Request): string | undefined {
  const headerValue = req.headers['x-csrf-token'] ?? req.headers['x-xsrf-token'];
  if (Array.isArray(headerValue)) {
    const first = headerValue[0];
    if (first && first !== 'null' && first !== 'undefined') {
      return first;
    }
  } else if (typeof headerValue === 'string') {
    if (headerValue && headerValue !== 'null' && headerValue !== 'undefined') {
      return headerValue;
    }
  }
  const bodyToken = (req.body as Record<string, unknown> | undefined)?._csrf;
  if (typeof bodyToken === 'string') {
    return bodyToken;
  }
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return undefined;
  }
  const record = adminCsrfStore.get(sessionToken);
  return record?.token;
}

function careersAdminCsrfGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const candidate = extractAdminCsrfCandidate(req);
  if (!validateAdminCsrfToken(req, candidate)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

const sanitizeConfig: IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'h3'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
};

function sanitizeJob(job: JobRecord) {
  return {
    ...job,
    description: job.description ? sanitizeHtml(job.description, sanitizeConfig) : null,
    requirementsList: job.requirements ? job.requirements.split('\n').filter(Boolean) : [],
  };
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSkills(raw: string | string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
  }
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function mapLinks(body: Record<string, unknown>): Record<string, string> {
  const links: Record<string, string> = {};
  ['github', 'linkedin', 'portfolio'].forEach((key) => {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      links[key] = value.trim();
    }
  });
  return links;
}

function ensureJobActive(job: JobRecord | undefined, res: Response): job is JobRecord {
  if (!job || job.is_active !== 1) {
    res.status(404).render('404', { pageTitle: 'Role unavailable' });
    return false;
  }
  return true;
}

function buildStepUrl(jobId: string, step: number): string {
  return `/careers/${jobId}/apply?step=${step}`;
}

function requireMultipart(req: Request, res: Response, next: express.NextFunction): void {
  if (req.is('multipart/form-data')) {
    upload.fields([
      { name: 'resume', maxCount: 1 },
      { name: 'coverLetter', maxCount: 1 },
    ])(req, res, next);
    return;
  }
  next();
}

function extractPendingUpload(file?: Express.Multer.File): PendingUpload | undefined {
  if (!file) return undefined;
  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new Error('Unsupported file type');
  }
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    base64: file.buffer.toString('base64'),
  };
}

function ensureUploadsMetadata(state: ReturnType<typeof getWizardState>): { resume?: PendingUpload; coverLetter?: PendingUpload | null } {
  return {
    resume: state.resume,
    coverLetter: state.coverLetter ?? null,
  };
}

function buildWizardSummary(state: ReturnType<typeof getWizardState>) {
  return {
    basics: state.basics,
    experience: state.experience,
    role: state.role,
    resume: state.resume?.originalName ?? null,
    coverLetter: state.coverLetter?.originalName ?? null,
  };
}

function renderWizardStep(req: Request, res: Response, job: JobRecord, step: number) {
  const state = getWizardState(req, job.id);
  const summary = buildWizardSummary(state);
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/careers.css'];
  res.render('careers/apply', {
    pageTitle: `${job.title} · Apply`,
    job: sanitizeJob(job),
    step,
    state,
    summary,
    stepUrl: buildStepUrl(job.id, step),
  });
}

export const careersRouter = express.Router();
export const careersApiRouter = express.Router();
export const careersAdminRouter = express.Router();
export const careersAdminApiRouter = express.Router();

careersAdminRouter.use((req, res, next) => {
  if (req.method === 'GET' && typeof (res.locals as Record<string, unknown>).csrfToken === 'string') {
    rememberAdminCsrfToken(req, (res.locals as Record<string, string>).csrfToken);
  }
  next();
});

careersAdminApiRouter.use(careersAdminCsrfGuard);

careersRouter.get('/careers', (req, res) => {
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/careers.css'];
  const filters = {
    query: typeof req.query.q === 'string' ? req.query.q : undefined,
    department: typeof req.query.department === 'string' ? req.query.department : undefined,
    location: typeof req.query.location === 'string' ? req.query.location : undefined,
    employmentType: typeof req.query.type === 'string' ? req.query.type : undefined,
  };

  const jobs = listJobs(filters).map(sanitizeJob);

  res.render('careers/index', {
    pageTitle: 'Careers at Aurora Nexus',
    jobs,
    filters,
  });
});

careersRouter.get('/careers/:jobId', (req, res) => {
  const job = getJobById(req.params.jobId);
  if (!ensureJobActive(job, res)) {
    return;
  }

  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/careers.css'];
  res.render('careers/detail', {
    pageTitle: `${job.title} · Careers`,
    job: sanitizeJob(job),
  });
});

careersRouter.get('/careers/:jobId/apply', (req, res) => {
  const job = getJobById(req.params.jobId);
  if (!ensureJobActive(job, res)) {
    return;
  }

  const step = Math.min(Math.max(parseInt((req.query.step as string) || '1', 10) || 1, 1), 5);
  renderWizardStep(req, res, job, step);
});

careersRouter.get('/careers/track/:trackingId', (req, res) => {
  const trackingId = req.params.trackingId;
  const application = getApplicationByTrackingId(trackingId);
  if (!application) {
    res.status(404).render('404', { pageTitle: 'Tracking ID not found' });
    return;
  }

  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/careers.css'];
  res.render('careers/track', {
    pageTitle: `Application · ${application.tracking_id}`,
    application,
  });
});

careersApiRouter.post('/apply/step', applyStepLimiter, requireMultipart, async (req, res) => {
  try {
    const jobId = typeof req.body.jobId === 'string' ? req.body.jobId : undefined;
    const step = parseInt(req.body.step, 10);
    if (!jobId || !step) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const job = getJobById(jobId);
    if (!job || job.is_active !== 1) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const wizardState = getWizardState(req, jobId);

    switch (step) {
      case 1: {
        const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
        const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
        const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
        const locationEligibility = typeof req.body.locationEligibility === 'string' ? req.body.locationEligibility.trim() : '';

        if (!fullName || !validateEmail(email) || !locationEligibility) {
          res.status(400).json({ error: 'Please complete all required fields with valid information.' });
          return;
        }

        mergeWizardState(req, jobId, {
          basics: {
            fullName,
            email,
            phone: phone || undefined,
            locationEligibility,
          },
        });
        res.json({ next: buildStepUrl(jobId, 2) });
        return;
      }
      case 2: {
        const years = typeof req.body.years === 'string' ? req.body.years.trim() : '';
        const skills = parseSkills(req.body.skills ?? []);
        const links = mapLinks(req.body);

        if (!years || !skills.length) {
          res.status(400).json({ error: 'Share your experience and at least one skill.' });
          return;
        }

        mergeWizardState(req, jobId, {
          experience: {
            years,
            skills,
            links,
          },
        });
        res.json({ next: buildStepUrl(jobId, 3) });
        return;
      }
      case 3: {
        const motivation = typeof req.body.motivation === 'string' ? req.body.motivation.trim() : '';
        const proudest = typeof req.body.proudest === 'string' ? req.body.proudest.trim() : '';
        const availability = typeof req.body.availability === 'string' ? req.body.availability.trim() : '';

        if (!motivation || !proudest) {
          res.status(400).json({ error: 'Please answer the short questions to continue.' });
          return;
        }

        mergeWizardState(req, jobId, {
          role: {
            motivation,
            proudest,
            availability: availability || undefined,
          },
        });
        res.json({ next: buildStepUrl(jobId, 4) });
        return;
      }
      case 4: {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const resumeFile = files?.resume?.[0];
        const coverFile = files?.coverLetter?.[0];

        if (!resumeFile && !wizardState.resume) {
          res.status(400).json({ error: 'Resume is required and must be a PDF or Word document under 5MB.' });
          return;
        }

        try {
          const resume = resumeFile ? extractPendingUpload(resumeFile) : wizardState.resume;
          const coverLetter = coverFile ? extractPendingUpload(coverFile) : wizardState.coverLetter ?? undefined;
          mergeWizardState(req, jobId, {
            resume,
            coverLetter: coverLetter ?? null,
          });
          res.json({ next: buildStepUrl(jobId, 5) });
        } catch (error) {
          res.status(400).json({ error: 'Only PDF or Word documents up to 5MB are accepted.' });
        }
        return;
      }
      default:
        res.status(400).json({ error: 'Unknown step.' });
        return;
    }
  } catch (error) {
    console.error('Failed to save wizard step', error);
    res.status(500).json({ error: 'Unable to save progress right now. Please try again.' });
  }
});

careersApiRouter.post('/apply/submit', applySubmitLimiter, async (req, res) => {
  try {
    const jobId = typeof req.body.jobId === 'string' ? req.body.jobId : undefined;
    const consent = req.body.consent === 'true' || req.body.consent === true;

    if (!jobId) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const job = getJobById(jobId);
    if (!job || job.is_active !== 1) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    if (!consent) {
      res.status(400).json({ error: 'Consent is required to submit your application.' });
      return;
    }

    const state = getWizardState(req, jobId);
    if (!state.basics || !state.experience || !state.role || !state.resume) {
      res.status(400).json({ error: 'Please complete all steps before submitting.' });
      return;
    }

    const files = ensureUploadsMetadata(state);
    const applicationId = crypto.randomUUID();
    const persisted = persistApplicationFiles(applicationId, files);

    const answers = {
      basics: state.basics,
      experience: state.experience,
      role: state.role,
    };

    const application = createApplication({
      id: applicationId,
      jobId,
      userId: req.user?.id,
      fullName: state.basics.fullName,
      email: state.basics.email,
      phone: state.basics.phone,
      answers,
      resumePath: persisted.resumePath ?? null,
      coverLetterPath: persisted.coverLetterPath ?? null,
    });

    clearWizardState(req, jobId);

    res.json({
      trackingId: application.tracking_id,
      confirmationUrl: `/careers/track/${encodeURIComponent(application.tracking_id)}`,
    });
  } catch (error) {
    console.error('Failed to submit application', error);
    res.status(500).json({ error: 'We could not submit your application. Please try again shortly.' });
  }
});

function parseStatus(value: unknown): ApplicationStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const upper = value.toUpperCase() as ApplicationStatus;
  if (['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'].includes(upper)) {
    return upper;
  }
  return undefined;
}

careersAdminRouter.get('/', (req, res) => {
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];
  const activeJobs = countActiveJobs();
  const statusCounts = countApplicationsByStatus();

  res.render('admin/careers/dashboard', {
    pageTitle: 'Careers dashboard',
    activeJobs,
    statusCounts,
  });
});

careersAdminRouter.get('/jobs', (req, res) => {
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];
  const jobs = listJobs({ includeInactive: true }).map(sanitizeJob);
  res.render('admin/careers/jobs', {
    pageTitle: 'Manage job openings',
    jobs,
  });
});

careersAdminRouter.get('/applications', (req, res) => {
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];
  const filters: ApplicationsFilter = {};
  if (typeof req.query.status === 'string') {
    const status = parseStatus(req.query.status);
    if (status) filters.status = status;
  }
  if (typeof req.query.jobId === 'string') {
    filters.jobId = req.query.jobId;
  }

  const applications = listApplications(filters);
  const jobs = listJobs({ includeInactive: true });
  res.render('admin/careers/applications', {
    pageTitle: 'Applications',
    applications,
    jobs,
    filters,
  });
});

careersAdminRouter.get('/applications/:id', (req, res) => {
  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];
  const application = getApplicationById(req.params.id);
  if (!application) {
    res.status(404).render('404', { pageTitle: 'Application not found' });
    return;
  }
  const job = getJobById(application.job_id);
  const answers = JSON.parse(application.answers_json || '{}');
  res.render('admin/careers/application-detail', {
    pageTitle: `Application · ${application.full_name}`,
    application,
    job,
    answers,
  });
});

careersAdminRouter.get('/applications/:id/download/:type', (req, res) => {
  const application = getApplicationById(req.params.id);
  if (!application) {
    res.status(404).send('Not found');
    return;
  }
  const type = req.params.type;
  let storedPath: string | null = null;
  if (type === 'resume') {
    storedPath = application.resume_path;
  } else if (type === 'cover') {
    storedPath = application.cover_letter_path;
  }

  if (!storedPath || !fileExists(storedPath)) {
    res.status(404).send('File not found');
    return;
  }

  const absolutePath = resolveAbsolutePath(storedPath);
  const safeName = (application.full_name || 'candidate')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'candidate';
  const ext = getStoredExtension(storedPath);
  const suffix = type === 'cover' ? 'cover-letter' : 'resume';
  const filename = `${safeName}-${suffix}${ext}`;

  res.download(absolutePath, filename);
});

careersAdminApiRouter.post('/jobs', (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }
  const nowIso = new Date().toISOString();
  const job = createJob({
    id: req.body.id || crypto.randomUUID(),
    title,
    location: typeof req.body.location === 'string' ? req.body.location.trim() : null,
    department: typeof req.body.department === 'string' ? req.body.department.trim() : null,
    employment_type: typeof req.body.employment_type === 'string' ? req.body.employment_type.trim() : null,
    description: typeof req.body.description === 'string' ? req.body.description : null,
    requirements: typeof req.body.requirements === 'string' ? req.body.requirements : null,
    posted_at: nowIso,
    is_active: req.body.is_active ? 1 : 0,
  });
  res.status(201).json({ job });
});

careersAdminApiRouter.patch('/jobs/:id', (req, res) => {
  const updates: Record<string, unknown> = {};
  ['title', 'location', 'department', 'employment_type', 'description', 'requirements'].forEach((field) => {
    const value = req.body[field];
    if (typeof value === 'string') {
      updates[field] = value;
    }
  });
  if (typeof req.body.is_active !== 'undefined') {
    updates.is_active = req.body.is_active ? 1 : 0;
  }

  const job = updateJob(req.params.id, updates);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({ job });
});

careersAdminApiRouter.delete('/jobs/:id', (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  deleteJob(req.params.id);
  res.status(204).send();
});

careersAdminApiRouter.post('/applications/:id/status', (req, res) => {
  const status = parseStatus(req.body.status);
  if (!status || status === 'SUBMITTED') {
    res.status(400).json({ error: 'Provide a valid status.' });
    return;
  }
  const updated = updateApplicationStatus(req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  res.json({ application: updated });
});

careersAdminApiRouter.get('/export.csv', (req, res) => {
  const filters: ApplicationsFilter = {};
  if (typeof req.query.start === 'string') {
    filters.startDate = req.query.start;
  }
  if (typeof req.query.end === 'string') {
    filters.endDate = req.query.end;
  }
  const rows = listApplications(filters);

  const header = ['Tracking ID', 'Status', 'Full Name', 'Email', 'Phone', 'Job Title', 'Submitted'];
  const csvLines = [header.join(',')];
  rows.forEach((row) => {
    const values = [
      row.tracking_id,
      row.status,
      row.full_name,
      row.email,
      row.phone ?? '',
      row.job_title,
      row.created_at,
    ].map((value) => {
      const stringValue = value ?? '';
      if (typeof stringValue === 'string' && stringValue.includes(',')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvLines.push(values.join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
  res.send(csvLines.join('\n'));
});

export function initCareers(): void {
  seedCareersData();
}
