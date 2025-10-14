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
function parsePayload(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function serializeRequest(row) {
  if (!row) {
    return null;
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
    userId: row.userId,
    type: row.type,
    payload: parsePayload(row.payload),
    status: row.status,
    comment: row.comment,
    decisionByUserId: row.decisionByUserId,
    decisionAt: row.decisionAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employee: row.employeeId
      ? {
          id: row.employeeId,
          name: row.employeeName,
          email: row.employeeEmail,
          department: row.employeeDepartment,
          status: row.employeeStatus
        }
      : null
  };
}

function normalisePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function normalisePageSize(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

function createRequest({ employeeId, userId, type, payload }) {
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
    userId: userId || null,
    type,
    payload: JSON.stringify(payload || {}),
    status: 'pending',
    comment: null,
    decisionByUserId: null,
    decisionAt: null,
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO employee_requests (id, employeeId, userId, type, payload, status, comment, decisionByUserId, decisionAt, createdAt, updatedAt)
    VALUES (@id, @employeeId, @userId, @type, @payload, @status, @comment, @decisionByUserId, @decisionAt, @createdAt, @updatedAt)
  `).run(record);
  return getRequestById(record.id);
}

function getRequestById(id) {
  const row = db
    .prepare(
      `SELECT er.*, e.name as employeeName, e.email as employeeEmail, e.department as employeeDepartment, e.status as employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       WHERE er.id = ?`
    )
    .get(id);
  return serializeRequest(row);
}

function listRequests(options = {}) {
  const page = normalisePage(options.page, 1);
  const pageSize = normalisePageSize(options.pageSize, 20);
  const conditions = [];
  const values = [];
  if (options.status) {
    conditions.push('LOWER(er.status) = ?');
    values.push(String(options.status).toLowerCase());
  }
  if (options.type) {
    conditions.push('LOWER(er.type) = ?');
    values.push(String(options.type).toLowerCase());
  }
  if (options.search) {
    const like = `%${String(options.search).toLowerCase()}%`;
    conditions.push('(LOWER(e.name) LIKE ? OR LOWER(e.email) LIKE ? OR LOWER(er.type) LIKE ?)');
    values.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseQuery = `FROM employee_requests er LEFT JOIN employees e ON e.id = er.employeeId ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...values).count;
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT er.*, e.name as employeeName, e.email as employeeEmail, e.department as employeeDepartment, e.status as employeeStatus
       ${baseQuery}
       ORDER BY er.createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, pageSize, offset);
  return {
    requests: rows.map(serializeRequest),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    }
  };
}

function listPendingRequestsByEmployee(employeeId, type) {
  const rows = db
    .prepare(
      `SELECT er.*, e.name as employeeName, e.email as employeeEmail, e.department as employeeDepartment, e.status as employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       WHERE er.employeeId = ? AND er.status = 'pending' AND er.type = ?
       ORDER BY er.createdAt DESC`
    )
    .all(employeeId, type);
  return rows.map(serializeRequest);
}

function updateRequestStatus(id, status, comment, decisionByUserId) {
  const existing = getRequestById(id);
  if (!existing) {
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
  db.prepare(
    `UPDATE employee_requests
     SET status = ?, comment = ?, decisionByUserId = ?, decisionAt = ?, updatedAt = ?
     WHERE id = ?`
  ).run(status, comment || null, decisionByUserId || null, now, now, id);
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
  listRequests,
  listPendingRequestsByEmployee,
  updateRequestStatus
};
