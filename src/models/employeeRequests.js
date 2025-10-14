const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

db.prepare(`
  CREATE TABLE IF NOT EXISTS employee_requests (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    resolvedAt TEXT,
    resolvedBy TEXT,
    FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

db.prepare('CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employeeId)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_employee_requests_status ON employee_requests(status)').run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS employee_profiles (
    employeeId TEXT PRIMARY KEY,
    addressLine1 TEXT,
    addressLine2 TEXT,
    city TEXT,
    state TEXT,
    postalCode TEXT,
    emergencyContactName TEXT,
    emergencyContactPhone TEXT,
    emergencyContactRelationship TEXT,
    updatedAt TEXT,
    FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

function serialiseRequest(row) {
  if (!row) return null;
  let payload;
  try {
    payload = JSON.parse(row.payload || '{}');
  } catch (error) {
    payload = {};
  }
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type,
    payload,
    status: row.status || 'pending',
    note: row.note || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt || null,
    resolvedBy: row.resolvedBy || null
  };
}

function getProfile(employeeId) {
  const row = db.prepare('SELECT * FROM employee_profiles WHERE employeeId = ?').get(employeeId);
  if (!row) {
    return {
      employeeId,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      updatedAt: null
    };
  }
  return {
    employeeId: row.employeeId,
    addressLine1: row.addressLine1 || null,
    addressLine2: row.addressLine2 || null,
    city: row.city || null,
    state: row.state || null,
    postalCode: row.postalCode || null,
    emergencyContactName: row.emergencyContactName || null,
    emergencyContactPhone: row.emergencyContactPhone || null,
    emergencyContactRelationship: row.emergencyContactRelationship || null,
    updatedAt: row.updatedAt || null
  };
}

function upsertProfile(employeeId, updates) {
  const existing = db.prepare('SELECT employeeId FROM employee_profiles WHERE employeeId = ?').get(employeeId);
  const payload = {
    employeeId,
    addressLine1: updates.addressLine1 || null,
    addressLine2: updates.addressLine2 || null,
    city: updates.city || null,
    state: updates.state || null,
    postalCode: updates.postalCode || null,
    emergencyContactName: updates.emergencyContactName || null,
    emergencyContactPhone: updates.emergencyContactPhone || null,
    emergencyContactRelationship: updates.emergencyContactRelationship || null,
    updatedAt: new Date().toISOString()
  };
  if (existing) {
    db.prepare(
      `UPDATE employee_profiles SET
        addressLine1=@addressLine1,
        addressLine2=@addressLine2,
        city=@city,
        state=@state,
        postalCode=@postalCode,
        emergencyContactName=@emergencyContactName,
        emergencyContactPhone=@emergencyContactPhone,
        emergencyContactRelationship=@emergencyContactRelationship,
        updatedAt=@updatedAt
      WHERE employeeId=@employeeId`
    ).run(payload);
  } else {
    db.prepare(
      `INSERT INTO employee_profiles (
        employeeId, addressLine1, addressLine2, city, state, postalCode,
        emergencyContactName, emergencyContactPhone, emergencyContactRelationship, updatedAt
      ) VALUES (
        @employeeId, @addressLine1, @addressLine2, @city, @state, @postalCode,
        @emergencyContactName, @emergencyContactPhone, @emergencyContactRelationship, @updatedAt
      )`
    ).run(payload);
  }
  return getProfile(employeeId);
}

function createRequest({ employeeId, type, payload }) {
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    employeeId,
    type,
    payload: JSON.stringify(payload || {}),
    status: 'pending',
    note: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedBy: null
  };
  db.prepare(`
    INSERT INTO employee_requests (
      id, employeeId, type, payload, status, note, createdAt, updatedAt, resolvedAt, resolvedBy
    ) VALUES (
      @id, @employeeId, @type, @payload, @status, @note, @createdAt, @updatedAt, @resolvedAt, @resolvedBy
    )
  `).run(record);
  return serialiseRequest(record);
}

function getRequestById(id) {
  const row = db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  return serialiseRequest(row);
}

function listRequestsForEmployee(employeeId) {
  const rows = db
    .prepare('SELECT * FROM employee_requests WHERE employeeId = ? ORDER BY createdAt DESC')
    .all(employeeId);
  return rows.map(serialiseRequest);
}

function listAllRequests() {
  const rows = db.prepare('SELECT * FROM employee_requests ORDER BY createdAt DESC').all();
  return rows.map(serialiseRequest);
}

function updateRequestStatus(id, { status, note, resolvedBy }) {
  const request = getRequestById(id);
  if (!request) {
    const error = new Error('Request not found');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const payload = {
    status: status || request.status,
    note: typeof note === 'string' ? note : request.note,
    resolvedBy: resolvedBy || request.resolvedBy,
    resolvedAt: ['approved', 'denied', 'cancelled', 'canceled', 'completed'].includes((status || '').toLowerCase())
      ? now
      : request.resolvedAt,
    id,
    updatedAt: now
  };
  db.prepare(
    `UPDATE employee_requests SET status = @status, note = @note, resolvedBy = @resolvedBy, resolvedAt = @resolvedAt, updatedAt = @updatedAt WHERE id = @id`
  ).run(payload);
  return getRequestById(id);
}

module.exports = {
  createRequest,
  getRequestById,
  listRequestsForEmployee,
  listAllRequests,
  updateRequestStatus,
  getProfile,
  upsertProfile
};
