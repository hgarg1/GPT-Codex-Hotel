const express = require('express');
const { ensureHrStaff } = require('../middleware/auth');
const {
  listApplications,
  countApplicationsByStatus,
  getApplicationById,
} = require('../careers/applicationsRepo.ts');
const { listJobs, getJobById, countActiveJobs } = require('../careers/jobsRepo.ts');
const { resolveAbsolutePath, fileExists, getStoredExtension } = require('../careers/uploads');

const router = express.Router();

const VALID_STATUS = new Set(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']);

function parseStatus(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const upper = value.trim().toUpperCase();
  return VALID_STATUS.has(upper) ? upper : undefined;
}

function buildFilters(query) {
  const jobId = typeof query.jobId === 'string' && query.jobId.trim() ? query.jobId.trim() : undefined;
  const status = parseStatus(query.status);
  return { jobId, status };
}

function parseAnswers(application) {
  try {
    return JSON.parse(application.answers_json || '{}');
  } catch (error) {
    console.warn('Failed to parse application answers for HR portal', error);
    return {};
  }
}

router.get('/hr', ensureHrStaff, (req, res) => {
  const filters = buildFilters(req.query || {});
  const jobs = listJobs({ includeInactive: true });
  const applications = listApplications(filters).map((application) => ({
    ...application,
    answers: parseAnswers(application),
  }));
  const statusCounts = countApplicationsByStatus();
  const totalActiveJobs = countActiveJobs();

  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];

  res.render('hr/index', {
    pageTitle: 'HR Portal',
    applications,
    jobs,
    filters,
    statusCounts,
    totalActiveJobs,
  });
});

router.get('/hr/applications/:id', ensureHrStaff, (req, res) => {
  const application = getApplicationById(req.params.id);
  if (!application) {
    res.status(404).render('404', { pageTitle: 'Application not found' });
    return;
  }

  const job = getJobById(application.job_id);
  const answers = parseAnswers(application);

  res.locals.extraStyles = [...(res.locals.extraStyles || []), '/css/admin-console.css', '/css/admin-careers.css'];

  res.render('admin/careers/application-detail', {
    pageTitle: `${application.full_name} · HR Portal`,
    application,
    job,
    answers,
    backUrl: '/hr',
    downloadUrlBase: '/hr/applications',
  });
});

router.get('/hr/applications/:id/download/:type', ensureHrStaff, (req, res) => {
  const application = getApplicationById(req.params.id);
  if (!application) {
    res.status(404).send('Application not found');
    return;
  }

  const type = req.params.type;
  const isResume = type === 'resume';
  const filePath = isResume ? application.resume_path : application.cover_letter_path;
  if (!filePath) {
    res.status(404).send('File not found');
    return;
  }

  const absolute = resolveAbsolutePath(filePath);
  if (!fileExists(absolute)) {
    res.status(404).send('File not found');
    return;
  }

  const safeName = (application.full_name || 'candidate').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'candidate';
  const ext = getStoredExtension(filePath);
  const suffix = isResume ? 'resume' : 'cover-letter';
  const downloadName = `${safeName}-${suffix}${ext}`;

  res.download(absolute, downloadName);
});

module.exports = router;
