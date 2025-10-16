const path = require('node:path');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');

const testDbPath = path.join(__dirname, 'careers.test.db');
const uploadsDir = path.join(__dirname, 'uploads-test');

process.env.CAREERS_DB_PATH = testDbPath;
process.env.UPLOAD_DIR = uploadsDir;
process.env.ADMIN_EMAILS = 'you@yourdomain.com,hr@yourdomain.com';

const { register } = require('tsx/cjs/api');
register();

const { DEFAULT_JWT_SECRET } = require('../src/utils/jwtDefaults.js');
const { listJobs } = require('../src/careers/jobsRepo.ts');
const { getApplicationByTrackingId } = require('../src/careers/applicationsRepo.ts');
const app = require('../src/app');

const request = supertest.agent(app);

function createPdfBuffer() {
  return Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF');
}

function extractCsrf(html) {
  const match = html.match(/name="csrf-token" content="([^"]+)"/);
  return match ? match[1] : null;
}

let lastTrackingId;

describe('Careers module', () => {
  beforeAll(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  test('public listings render seeded roles', async () => {
    const res = await request.get('/careers');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Frontend Engineer');
    expect(res.text).toContain('Restaurant Operations Manager');
  });

  test('job detail is accessible', async () => {
    const jobs = listJobs();
    const jobId = jobs[0].id;
    const res = await request.get(`/careers/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(jobs[0].title);
  });

  test('wizard completes and tracking page reflects SUBMITTED', async () => {
    const jobs = listJobs();
    const jobId = jobs[0].id;
    const agent = supertest.agent(app);

    const initialPage = await agent.get(`/careers/${jobId}/apply`);
    const csrfStep1 = extractCsrf(initialPage.text);
    expect(csrfStep1).toBeTruthy();

    const step1 = await agent
      .post('/api/careers/apply/step')
      .set('x-csrf-token', csrfStep1)
      .send({
        jobId,
        step: 1,
        fullName: 'Jordan Polaris',
        email: 'jordan@example.com',
        phone: '+1-202-555-0100',
        locationEligibility: 'Eligible across Sol system.',
      });
    expect(step1.status).toBe(200);

    const step2Page = await agent.get(`/careers/${jobId}/apply?step=2`);
    const csrfStep2 = extractCsrf(step2Page.text);
    expect(csrfStep2).toBeTruthy();

    const step2 = await agent
      .post('/api/careers/apply/step')
      .set('x-csrf-token', csrfStep2)
      .send({
        jobId,
        step: 2,
        years: '5',
        skills: 'React, Systems',
        github: 'https://github.com/example',
      });
    expect(step2.status).toBe(200);

    const step3Page = await agent.get(`/careers/${jobId}/apply?step=3`);
    const csrfStep3 = extractCsrf(step3Page.text);
    expect(csrfStep3).toBeTruthy();

    const step3 = await agent
      .post('/api/careers/apply/step')
      .set('x-csrf-token', csrfStep3)
      .send({
        jobId,
        step: 3,
        motivation: 'I love building future-forward hospitality.',
        proudest: 'Led a spaceport launch.',
        availability: 'Two weeks notice',
      });
    expect(step3.status).toBe(200);

    const pdfBuffer = createPdfBuffer();
    const step4Page = await agent.get(`/careers/${jobId}/apply?step=4`);
    const csrfStep4 = extractCsrf(step4Page.text);
    expect(csrfStep4).toBeTruthy();

    const step4 = await agent
      .post('/api/careers/apply/step')
      .set('x-csrf-token', csrfStep4)
      .field('jobId', jobId)
      .field('step', '4')
      .attach('resume', pdfBuffer, 'resume.pdf');
    expect(step4.status).toBe(200);

    const reviewPage = await agent.get(`/careers/${jobId}/apply?step=5`);
    const csrfSubmit = extractCsrf(reviewPage.text);
    expect(csrfSubmit).toBeTruthy();

    const submit = await agent
      .post('/api/careers/apply/submit')
      .set('x-csrf-token', csrfSubmit)
      .send({
        jobId,
        consent: true,
      });
    expect(submit.status).toBe(200);
    expect(submit.body.trackingId).toMatch(/^CARE-/);
    lastTrackingId = submit.body.trackingId;

    const track = await agent.get(`/careers/track/${encodeURIComponent(submit.body.trackingId)}`);
    expect(track.status).toBe(200);
    expect(track.text).toContain('SUBMITTED');
  });

  test('admin can manage jobs and approve application', async () => {
    const jobs = listJobs();
    const token = jwt.sign({ sub: 'admin-1', email: 'you@yourdomain.com' }, DEFAULT_JWT_SECRET, {
      algorithm: 'HS256',
    });
    const adminAgent = supertest.agent(app);
    const cookie = `session_token=${token}`;

    const adminJobsPage = await adminAgent.get('/admin/careers/jobs').set('Cookie', cookie);
    const adminCsrf = extractCsrf(adminJobsPage.text);
    expect(adminCsrf).toBeTruthy();

    const create = await adminAgent
      .post('/api/admin/careers/jobs')
      .set('Cookie', cookie)
      .set('x-csrf-token', adminCsrf)
      .send({
        title: 'Galactic Concierge',
        department: 'Guest Experience',
        location: 'Orbit Hub',
        employment_type: 'Contract',
        is_active: 1,
      });
    expect(create.status).toBe(201);
    const createdJob = create.body.job;

    const listAfterCreate = await request.get('/careers');
    expect(listAfterCreate.text).toContain('Galactic Concierge');

    const adminJobsPageAfterCreate = await adminAgent.get('/admin/careers/jobs').set('Cookie', cookie);
    const adminCsrfUpdate = extractCsrf(adminJobsPageAfterCreate.text);

    const deactivate = await adminAgent
      .patch(`/api/admin/careers/jobs/${createdJob.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', adminCsrfUpdate)
      .send({ is_active: 0 });
    expect(deactivate.status).toBe(200);

    const listAfterDeactivate = await request.get('/careers');
    expect(listAfterDeactivate.text).not.toContain('Galactic Concierge');

    const apps = await adminAgent.get('/admin/careers/applications').set('Cookie', cookie);
    expect(apps.status).toBe(200);

    const latest = getApplicationByTrackingId(lastTrackingId);
    expect(latest).toBeTruthy();

    const detailPage = await adminAgent
      .get(`/admin/careers/applications/${latest.id}`)
      .set('Cookie', cookie);
    const adminCsrfStatus = extractCsrf(detailPage.text);

    const approve = await adminAgent
      .post(`/api/admin/careers/applications/${latest.id}/status`)
      .set('Cookie', cookie)
      .set('x-csrf-token', adminCsrfStatus)
      .send({ status: 'APPROVED' });
    expect(approve.status).toBe(200);
    expect(approve.body.application.status).toBe('APPROVED');

    const track = await request.get(`/careers/track/${encodeURIComponent(approve.body.application.tracking_id)}`);
    expect(track.text).toContain('APPROVED');

    const csv = await adminAgent.get('/api/admin/careers/export.csv').set('Cookie', cookie);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Tracking ID');
  });
});
