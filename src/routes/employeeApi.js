const express = require('express');
const Joi = require('joi');
const { ensureEmployeeApi } = require('../middleware/auth');
const { createClockIn, completeClockOut, getOpenEntryForEmployee, listEntriesForEmployee } = require('../models/timeEntries');
const {
  createRequest,
  listRequestsForEmployee,
  getProfile
} = require('../models/employeeRequests');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

function sanitizeOptional(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const clean = sanitizeString(value);
  return clean.length ? clean : null;
}

const clockInSchema = Joi.object({
  department: Joi.string().max(120).allow('', null),
  role: Joi.string().max(120).allow('', null),
  location: Joi.string().max(180).allow('', null),
  notes: Joi.string().max(500).allow('', null)
});

const clockOutSchema = Joi.object({
  notes: Joi.string().max(500).allow('', null)
});

const rangeSchema = Joi.string()
  .pattern(/^[^:]+:[^:]+$/)
  .allow('current', 'history', '', null);

const ptoSchema = Joi.object({
  startDate: Joi.string().required(),
  endDate: Joi.string().required(),
  reason: Joi.string().max(500).allow('', null)
});

const workersCompSchema = Joi.object({
  incidentDate: Joi.string().required(),
  location: Joi.string().max(180).allow('', null),
  description: Joi.string().max(1000).required()
});

const profileSchema = Joi.object({
  addressLine1: Joi.string().max(200).allow('', null),
  addressLine2: Joi.string().max(200).allow('', null),
  city: Joi.string().max(120).allow('', null),
  state: Joi.string().max(120).allow('', null),
  postalCode: Joi.string().max(40).allow('', null),
  emergencyContactName: Joi.string().max(160).allow('', null),
  emergencyContactPhone: Joi.string().max(60).allow('', null),
  emergencyContactRelationship: Joi.string().max(120).allow('', null)
});

router.use(ensureEmployeeApi);

function computeRange(range) {
  const dayMs = 24 * 60 * 60 * 1000;
  if (!range || range === 'current') {
    const end = new Date();
    const start = new Date(end.getTime() - 13 * dayMs);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (range === 'history') {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * dayMs);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (range.includes(':')) {
    const [startRaw, endRaw] = range.split(':');
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (!Number.isNaN(startDate.valueOf()) && !Number.isNaN(endDate.valueOf())) {
      return { start: startDate.toISOString(), end: endDate.toISOString() };
    }
  }
  const fallbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return { start: fallbackStart.toISOString(), end: new Date().toISOString() };
}

function formatTimesheetPayload(entries, { start, end }) {
  const totalMinutes = entries.reduce((acc, entry) => acc + (entry.durationMinutes || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const openEntry = entries.find((entry) => !entry.clockOutAt) || null;
  return {
    range: { start, end },
    entries,
    summary: {
      totalMinutes,
      totalHours,
      formatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    },
    openEntry
  };
}

router.post('/time/clock-in', (req, res) => {
  const { error, value } = clockInSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid clock in payload', details: error.details.map((d) => d.message) });
  }
  try {
    const entry = createClockIn({
      employeeId: req.user.id,
      clockInAt: new Date().toISOString(),
      department: sanitizeOptional(value.department),
      role: sanitizeOptional(value.role) || req.user.role,
      location: sanitizeOptional(value.location) || 'Onsite',
      notes: sanitizeOptional(value.notes),
      sourceIp: req.ip,
      sourceUserAgent: req.get('user-agent')
    });
    return res.status(201).json({ entry });
  } catch (clockError) {
    const status = clockError.code === 'SHIFT_OPEN' ? 409 : 500;
    return res.status(status).json({ error: clockError.message || 'Unable to clock in.' });
  }
});

router.post('/time/clock-out', (req, res) => {
  const { error, value } = clockOutSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid clock out payload', details: error.details.map((d) => d.message) });
  }
  try {
    const entry = completeClockOut({
      employeeId: req.user.id,
      clockOutAt: new Date().toISOString(),
      notes: sanitizeOptional(value.notes) || undefined
    });
    return res.json({ entry });
  } catch (clockError) {
    const status = clockError.code === 'SHIFT_MISSING' ? 409 : 500;
    return res.status(status).json({ error: clockError.message || 'Unable to clock out.' });
  }
});

router.get('/time/open', (req, res) => {
  const entry = getOpenEntryForEmployee(req.user.id);
  return res.json({ entry });
});

router.get('/time/timesheet', (req, res) => {
  const { error } = rangeSchema.validate(req.query.range);
  if (error) {
    return res.status(400).json({ error: 'Invalid range format' });
  }
  const range = computeRange(req.query.range);
  const entries = listEntriesForEmployee(req.user.id, range);
  return res.json(formatTimesheetPayload(entries, range));
});

router.get('/time/timesheet.csv', (req, res) => {
  const { error } = rangeSchema.validate(req.query.range);
  if (error) {
    return res.status(400).json({ error: 'Invalid range format' });
  }
  const range = computeRange(req.query.range);
  const entries = listEntriesForEmployee(req.user.id, range);
  const header = ['Date', 'Clock In', 'Clock Out', 'Duration (minutes)', 'Status', 'Location', 'Notes'];
  const rows = entries.map((entry) => {
    const clockIn = entry.clockInAt ? new Date(entry.clockInAt) : null;
    const clockOut = entry.clockOutAt ? new Date(entry.clockOutAt) : null;
    const dateLabel = clockIn ? clockIn.toLocaleDateString() : '';
    const inLabel = clockIn ? clockIn.toLocaleTimeString() : '';
    const outLabel = clockOut ? clockOut.toLocaleTimeString() : '';
    const status = entry.clockOutAt ? (entry.durationMinutes ? 'Completed' : 'Pending Review') : 'Open';
    return [
      dateLabel,
      inLabel,
      outLabel,
      entry.durationMinutes ?? '',
      status,
      entry.location || '',
      entry.notes || ''
    ];
  });
  const csv = [header, ...rows].map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="timesheet.csv"');
  return res.send(csv);
});

router.post('/requests/pto', (req, res) => {
  const { error, value } = ptoSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid PTO request', details: error.details.map((d) => d.message) });
  }
  const payload = {
    startDate: sanitizeString(value.startDate),
    endDate: sanitizeString(value.endDate),
    reason: sanitizeOptional(value.reason)
  };
  const request = createRequest({ employeeId: req.user.id, type: 'pto', payload });
  return res.status(201).json({ request });
});

router.post('/requests/workers-comp', (req, res) => {
  const { error, value } = workersCompSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res
      .status(400)
      .json({ error: 'Invalid workers\' compensation payload', details: error.details.map((d) => d.message) });
  }
  const payload = {
    incidentDate: sanitizeString(value.incidentDate),
    location: sanitizeOptional(value.location),
    description: sanitizeString(value.description)
  };
  const request = createRequest({ employeeId: req.user.id, type: 'workers_comp', payload });
  return res.status(201).json({ request });
});

router.get('/requests', (req, res) => {
  const requests = listRequestsForEmployee(req.user.id);
  return res.json({ requests });
});

router.post('/profile/update', (req, res) => {
  const { error, value } = profileSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid profile update', details: error.details.map((d) => d.message) });
  }
  const payload = Object.entries(value).reduce((acc, [key, val]) => {
    acc[key] = sanitizeOptional(val);
    return acc;
  }, {});
  const request = createRequest({ employeeId: req.user.id, type: 'profile_update', payload });
  return res.status(201).json({ request });
});

router.get('/profile', (req, res) => {
  const profile = getProfile(req.user.id);
  const requests = listRequestsForEmployee(req.user.id).filter((request) => request.type === 'profile_update');
  return res.json({ profile, updates: requests });
});

module.exports = router;
