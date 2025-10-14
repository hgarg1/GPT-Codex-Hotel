const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

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
  listRequests,
  listPendingRequestsByEmployee,
  updateRequestStatus
};
