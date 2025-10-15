const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

const REQUEST_TYPE_VALUES = ['pto', 'workers-comp', 'resignation', 'transfer', 'profile-update'];

const REQUEST_TYPE_ALIASES = {
  pto: 'pto',
  'paid-time-off': 'pto',
  'workers-comp': 'workers-comp',
  'workers_comp': 'workers-comp',
  'workerscomp': 'workers-comp',
  resignation: 'resignation',
  transfer: 'transfer',
  'profile-update': 'profile-update',
  'profile_update': 'profile-update',
  'profileupdate': 'profile-update'
};

function normaliseRequestType(type) {
  if (type === undefined || type === null) {
    return null;
  }
  const raw = String(type).trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(REQUEST_TYPE_ALIASES, raw)) {
    return REQUEST_TYPE_ALIASES[raw];
  }
  const collapsed = raw.replace(/[\s_]+/g, '-');
  if (Object.prototype.hasOwnProperty.call(REQUEST_TYPE_ALIASES, collapsed)) {
    return REQUEST_TYPE_ALIASES[collapsed];
  }
  return null;
}

function buildEmployeeRequestsTableSql() {
  const allowed = REQUEST_TYPE_VALUES.map((value) => `'${value}'`).join(',');
  return `
    CREATE TABLE employee_requests (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      userId TEXT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN (${allowed})),
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      comment TEXT,
      decisionByUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      decisionAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `;
}

function ensureEmployeeRequestsTable() {
  const table = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'employee_requests'")
    .get();
  if (!table) {
    db.prepare(buildEmployeeRequestsTableSql()).run();
  } else {
    const sql = table.sql || '';
    const hasAllTypes = REQUEST_TYPE_VALUES.every((value) => sql.includes(`'${value}'`));
    if (!hasAllTypes) {
      const existingRows = db.prepare('SELECT * FROM employee_requests').all();
      db.exec('BEGIN TRANSACTION');
      try {
        db.exec('ALTER TABLE employee_requests RENAME TO employee_requests_legacy');
        db.exec(buildEmployeeRequestsTableSql());
        const insert = db.prepare(`
          INSERT INTO employee_requests (
            id, employeeId, userId, type, payload, status, comment, decisionByUserId, decisionAt, createdAt, updatedAt
          ) VALUES (
            @id, @employeeId, @userId, @type, @payload, @status, @comment, @decisionByUserId, @decisionAt, @createdAt, @updatedAt
          )
        `);
        existingRows.forEach((row) => {
          const normalisedType = normaliseRequestType(row.type) || row.type;
          insert.run({
            ...row,
            type: normalisedType
          });
        });
        db.exec('DROP TABLE employee_requests_legacy');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  }
  db.prepare('CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employeeId)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_employee_requests_status ON employee_requests(status)').run();
}

ensureEmployeeRequestsTable();

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
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
  )
`).run();

function parsePayload(raw) {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function serializeRequest(row) {
  if (!row) {
    return null;
  }
  const payload = parsePayload(row.payload);
  const employeeDetails = {
    id: row.employeeId || null,
    name: row.employeeName || null,
    email: row.employeeEmail || null,
    department: row.employeeDepartment || null,
    status: row.employeeStatus || null
  };
  const hasEmployeeDetails = Object.values(employeeDetails).some((value) => value !== null && value !== undefined);

  return {
    id: row.id,
    employeeId: row.employeeId,
    userId: row.userId || null,
    type: normaliseRequestType(row.type) || row.type,
    payload,
    status: row.status || 'pending',
    comment: row.comment || null,
    decisionByUserId: row.decisionByUserId || null,
    decisionAt: row.decisionAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employee: hasEmployeeDetails ? employeeDetails : null,
    employeeName: row.employeeName || null,
    employeeEmail: row.employeeEmail || null,
    employeeDepartment: row.employeeDepartment || null,
    employeeStatus: row.employeeStatus || null,
    submittedLabel: row.submittedLabel || null
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

function upsertProfile(employeeId, updates = {}) {
  const existing = db.prepare('SELECT employeeId FROM employee_profiles WHERE employeeId = ?').get(employeeId);
  const record = {
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
    ).run(record);
  } else {
    db.prepare(
      `INSERT INTO employee_profiles (
        employeeId, addressLine1, addressLine2, city, state, postalCode,
        emergencyContactName, emergencyContactPhone, emergencyContactRelationship, updatedAt
      ) VALUES (
        @employeeId, @addressLine1, @addressLine2, @city, @state, @postalCode,
        @emergencyContactName, @emergencyContactPhone, @emergencyContactRelationship, @updatedAt
      )`
    ).run(record);
  }

  return getProfile(employeeId);
}

function createRequest({ employeeId, userId, type, payload }) {
  if (!employeeId) {
    throw new Error('employeeId is required to create a request');
  }
  const normalisedType = normaliseRequestType(type);
  if (!normalisedType) {
    const error = new Error('A supported request type is required to create a request');
    error.code = 'INVALID_REQUEST_TYPE';
    throw error;
  }
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    employeeId,
    userId: userId || null,
    type: normalisedType,
    payload: JSON.stringify(payload || {}),
    status: 'pending',
    comment: null,
    decisionByUserId: null,
    decisionAt: null,
    createdAt: now,
    updatedAt: now
  };
  try {
    db.prepare(
      `INSERT INTO employee_requests (
        id, employeeId, userId, type, payload, status, comment, decisionByUserId, decisionAt, createdAt, updatedAt
      ) VALUES (
        @id, @employeeId, @userId, @type, @payload, @status, @comment, @decisionByUserId, @decisionAt, @createdAt, @updatedAt
      )`
    ).run(record);
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_CHECK') {
      const constraintError = new Error('Unable to create the employee request due to invalid data.');
      constraintError.code = 'INVALID_REQUEST_CONSTRAINT';
      throw constraintError;
    }
    throw error;
  }
  return getRequestById(record.id);
}

function getRequestById(id) {
  const row = db
    .prepare(
      `SELECT er.*, e.name AS employeeName, e.email AS employeeEmail, e.department AS employeeDepartment, e.status AS employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       WHERE er.id = ?`
    )
    .get(id);
  return serializeRequest(row);
}

function listRequestsForEmployee(employeeId) {
  const rows = db
    .prepare(
      `SELECT er.*, e.name AS employeeName, e.email AS employeeEmail, e.department AS employeeDepartment, e.status AS employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       WHERE er.employeeId = ?
       ORDER BY er.createdAt DESC`
    )
    .all(employeeId);
  return rows.map(serializeRequest);
}

function listAllRequests() {
  const rows = db
    .prepare(
      `SELECT er.*, e.name AS employeeName, e.email AS employeeEmail, e.department AS employeeDepartment, e.status AS employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       ORDER BY er.createdAt DESC`
    )
    .all();
  return rows.map(serializeRequest);
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
    const filterType = normaliseRequestType(options.type);
    if (!filterType) {
      return {
        requests: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0
        }
      };
    }
    conditions.push('LOWER(er.type) = ?');
    values.push(filterType.toLowerCase());
  }

  if (options.search) {
    const search = `%${String(options.search).toLowerCase()}%`;
    conditions.push('(LOWER(e.name) LIKE ? OR LOWER(e.email) LIKE ? OR LOWER(er.type) LIKE ? OR LOWER(er.status) LIKE ? OR LOWER(er.comment) LIKE ? )');
    values.push(search, search, search, search, search);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseQuery = `FROM employee_requests er LEFT JOIN employees e ON e.id = er.employeeId ${whereClause}`;
  const total = db.prepare(`SELECT COUNT(*) AS count ${baseQuery}`).get(...values).count;
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT er.*, e.name AS employeeName, e.email AS employeeEmail, e.department AS employeeDepartment, e.status AS employeeStatus
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
  const normalisedType = normaliseRequestType(type);
  const rows = db
    .prepare(
      `SELECT er.*, e.name AS employeeName, e.email AS employeeEmail, e.department AS employeeDepartment, e.status AS employeeStatus
       FROM employee_requests er
       LEFT JOIN employees e ON e.id = er.employeeId
       WHERE er.employeeId = ? AND er.status = 'pending' AND er.type = ?
       ORDER BY er.createdAt DESC`
    )
    .all(employeeId, normalisedType || type);
  return rows.map(serializeRequest);
}

function updateRequestStatus(id, status, comment, decisionByUserId) {
  const existing = getRequestById(id);
  if (!existing) {
    const error = new Error('Request not found');
    error.status = 404;
    throw error;
  }

  let nextStatus = status;
  let nextComment = comment;
  let nextDecisionByUserId = decisionByUserId;

  if (status && typeof status === 'object') {
    const payload = status;
    nextStatus = payload.status !== undefined ? payload.status : existing.status;
    nextComment =
      payload.comment !== undefined
        ? payload.comment
        : payload.note !== undefined
        ? payload.note
        : comment;
    nextDecisionByUserId =
      payload.decisionByUserId !== undefined
        ? payload.decisionByUserId
        : payload.resolvedBy !== undefined
        ? payload.resolvedBy
        : decisionByUserId;
  }

  const now = new Date().toISOString();
  const resolvedStatus = nextStatus !== undefined ? nextStatus : existing.status;
  const normalizedStatus = String(resolvedStatus || '').toLowerCase();
  let decisionAt = existing.decisionAt;
  if (['approved', 'denied', 'cancelled', 'canceled', 'completed'].includes(normalizedStatus)) {
    decisionAt = now;
  } else if (normalizedStatus === 'pending') {
    decisionAt = null;
  }

  db.prepare(
    `UPDATE employee_requests
     SET status = @status,
         comment = @comment,
         decisionByUserId = @decisionByUserId,
         decisionAt = @decisionAt,
         updatedAt = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    status: resolvedStatus,
    comment:
      nextComment !== undefined
        ? nextComment
        : existing.comment !== undefined
        ? existing.comment
        : null,
    decisionByUserId:
      nextDecisionByUserId !== undefined
        ? nextDecisionByUserId
        : existing.decisionByUserId !== undefined
        ? existing.decisionByUserId
        : null,
    decisionAt,
    updatedAt: now
  });

  return getRequestById(id);
}

module.exports = {
  createRequest,
  getRequestById,
  listRequestsForEmployee,
  listAllRequests,
  updateRequestStatus,
  getProfile,
  upsertProfile,
  listRequests,
  listPendingRequestsByEmployee,
  normaliseRequestType
};
