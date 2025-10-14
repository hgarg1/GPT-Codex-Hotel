const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { normalizeRole } = require('../utils/rbac');

const db = getDb();

db.prepare(`
  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    clockInAt TEXT NOT NULL,
    clockOutAt TEXT,
    department TEXT,
    role TEXT,
    location TEXT,
    notes TEXT,
    sourceIp TEXT,
    sourceUserAgent TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

db.prepare('CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employeeId)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_time_entries_clock ON time_entries(clockInAt)').run();

function serialiseTimeEntry(row) {
  if (!row) return null;
  const clockInAt = row.clockInAt ? new Date(row.clockInAt) : null;
  const clockOutAt = row.clockOutAt ? new Date(row.clockOutAt) : null;
  let durationMinutes = null;
  if (clockInAt && clockOutAt && !Number.isNaN(clockInAt.valueOf()) && !Number.isNaN(clockOutAt.valueOf())) {
    durationMinutes = Math.max(0, Math.round((clockOutAt - clockInAt) / 60000));
  }
  return {
    id: row.id,
    employeeId: row.employeeId,
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
    department: row.department || null,
    role: row.role ? normalizeRole(row.role) : null,
    location: row.location || null,
    notes: row.notes || null,
    source: {
      ip: row.sourceIp || null,
      userAgent: row.sourceUserAgent || null
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    durationMinutes
  };
}

function getOpenEntryForEmployee(employeeId) {
  const row = db
    .prepare(
      `SELECT * FROM time_entries WHERE employeeId = ? AND clockOutAt IS NULL ORDER BY clockInAt DESC LIMIT 1`
    )
    .get(employeeId);
  return serialiseTimeEntry(row);
}

function createClockIn({
  employeeId,
  clockInAt,
  department,
  role,
  location,
  notes,
  sourceIp,
  sourceUserAgent
}) {
  if (!employeeId || !clockInAt) {
    throw new Error('Invalid time entry payload.');
  }
  const openEntry = getOpenEntryForEmployee(employeeId);
  if (openEntry) {
    const error = new Error('An active shift already exists. Clock out before starting a new one.');
    error.code = 'SHIFT_OPEN';
    throw error;
  }
  const nowIso = new Date().toISOString();
  const record = {
    id: uuidv4(),
    employeeId,
    clockInAt: new Date(clockInAt).toISOString(),
    clockOutAt: null,
    department: department || null,
    role: role || null,
    location: location || null,
    notes: notes || null,
    sourceIp: sourceIp || null,
    sourceUserAgent: sourceUserAgent || null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  db.prepare(`
    INSERT INTO time_entries (
      id, employeeId, clockInAt, clockOutAt, department, role, location, notes, sourceIp, sourceUserAgent, createdAt, updatedAt
    ) VALUES (
      @id, @employeeId, @clockInAt, @clockOutAt, @department, @role, @location, @notes, @sourceIp, @sourceUserAgent, @createdAt, @updatedAt
    )
  `).run(record);
  return serialiseTimeEntry(record);
}

function completeClockOut({ employeeId, clockOutAt, notes }) {
  if (!employeeId) {
    throw new Error('Employee id required to clock out.');
  }
  const openEntry = getOpenEntryForEmployee(employeeId);
  if (!openEntry) {
    const error = new Error('No open shift found.');
    error.code = 'SHIFT_MISSING';
    throw error;
  }
  const clockOutIso = new Date(clockOutAt || new Date()).toISOString();
  const updatedNotes = notes || openEntry.notes;
  db.prepare(
    `UPDATE time_entries SET clockOutAt = ?, notes = ?, updatedAt = ? WHERE id = ?`
  ).run(clockOutIso, updatedNotes, new Date().toISOString(), openEntry.id);
  return getTimeEntryById(openEntry.id);
}

function getTimeEntryById(id) {
  const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  return serialiseTimeEntry(row);
}

function listEntriesForEmployee(employeeId, { start, end } = {}) {
  let query = 'SELECT * FROM time_entries WHERE employeeId = ?';
  const params = [employeeId];
  if (start) {
    query += ' AND clockInAt >= ?';
    params.push(new Date(start).toISOString());
  }
  if (end) {
    query += ' AND clockInAt <= ?';
    params.push(new Date(end).toISOString());
  }
  query += ' ORDER BY clockInAt DESC';
  const rows = db.prepare(query).all(...params);
  return rows.map(serialiseTimeEntry);
}

function listEntries({ start, end, employeeId } = {}) {
  let query = 'SELECT * FROM time_entries WHERE 1=1';
  const params = [];
  if (employeeId) {
    query += ' AND employeeId = ?';
    params.push(employeeId);
  }
  if (start) {
    query += ' AND clockInAt >= ?';
    params.push(new Date(start).toISOString());
  }
  if (end) {
    query += ' AND clockInAt <= ?';
    params.push(new Date(end).toISOString());
  }
  query += ' ORDER BY clockInAt DESC';
  const rows = db.prepare(query).all(...params);
  return rows.map(serialiseTimeEntry);
}

function updateEntry(id, updates = {}) {
  const entry = getTimeEntryById(id);
  if (!entry) {
    const error = new Error('Time entry not found');
    error.status = 404;
    throw error;
  }
  const next = {
    clockInAt: updates.clockInAt ? new Date(updates.clockInAt).toISOString() : entry.clockInAt,
    clockOutAt: updates.clockOutAt ? new Date(updates.clockOutAt).toISOString() : entry.clockOutAt,
    department: updates.department ?? entry.department,
    role: updates.role ?? entry.role,
    location: updates.location ?? entry.location,
    notes: updates.notes ?? entry.notes,
    updatedAt: new Date().toISOString(),
    id
  };
  db.prepare(
    `UPDATE time_entries
     SET clockInAt = @clockInAt,
         clockOutAt = @clockOutAt,
         department = @department,
         role = @role,
         location = @location,
         notes = @notes,
         updatedAt = @updatedAt
     WHERE id = @id`
  ).run(next);
  return getTimeEntryById(id);
}

module.exports = {
  createClockIn,
  completeClockOut,
  getOpenEntryForEmployee,
  listEntriesForEmployee,
  listEntries,
  getTimeEntryById,
  updateEntry
};
