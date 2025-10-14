const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serializeEmployee(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    title: row.title,
    employmentType: row.employmentType,
    startDate: row.startDate,
    status: row.status,
    emergencyContact: row.emergencyContact,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
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

function buildWhereClause({ search, department, status, employmentType }) {
  const conditions = [];
  const values = [];
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    conditions.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(department) LIKE ? OR LOWER(title) LIKE ?)');
    values.push(like, like, like, like);
  }
  if (department) {
    conditions.push('LOWER(department) = ?');
    values.push(department.toLowerCase());
  }
  if (status) {
    conditions.push('LOWER(status) = ?');
    values.push(status.toLowerCase());
  }
  if (employmentType) {
    conditions.push('LOWER(employmentType) = ?');
    values.push(employmentType.toLowerCase());
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}

function listEmployees(options = {}) {
  const page = normalisePage(options.page, 1);
  const pageSize = normalisePageSize(options.pageSize, 20);
  const { whereClause, values } = buildWhereClause(options);
  const offset = (page - 1) * pageSize;
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM employees ${whereClause}`);
  const total = countStmt.get(...values).count;
  const dataStmt = db.prepare(
    `SELECT * FROM employees ${whereClause} ORDER BY LOWER(name) ASC LIMIT ? OFFSET ?`
  );
  const rows = dataStmt.all(...values, pageSize, offset);
  return {
    employees: rows.map(serializeEmployee),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    }
  };
}

function getEmployeeById(id) {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  return serializeEmployee(row);
}

function getEmployeeByEmail(email) {
  if (!email) {
    return null;
  }
  const row = db.prepare('SELECT * FROM employees WHERE LOWER(email) = LOWER(?)').get(email);
  return serializeEmployee(row);
}

function createEmployee(payload) {
  const existing = getEmployeeByEmail(payload.email);
  if (existing) {
    const error = new Error('An employee record already exists for that email address.');
    error.status = 409;
    throw error;
  }
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    name: payload.name,
    email: payload.email.toLowerCase(),
    phone: payload.phone || null,
    department: payload.department || null,
    title: payload.title || null,
    employmentType: payload.employmentType || 'Full-Time',
    startDate: payload.startDate || null,
    status: payload.status || 'active',
    emergencyContact: payload.emergencyContact || null,
    notes: payload.notes || null,
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO employees (id, name, email, phone, department, title, employmentType, startDate, status, emergencyContact, notes, createdAt, updatedAt)
    VALUES (@id, @name, @email, @phone, @department, @title, @employmentType, @startDate, @status, @emergencyContact, @notes, @createdAt, @updatedAt)
  `).run(record);
  return serializeEmployee(record);
}

function updateEmployee(id, updates = {}) {
  const existing = getEmployeeById(id);
  if (!existing) {
    const error = new Error('Employee not found');
    error.status = 404;
    throw error;
  }
  const fields = [];
  const values = [];
  const allowed = [
    'name',
    'email',
    'phone',
    'department',
    'title',
    'employmentType',
    'startDate',
    'status',
    'emergencyContact',
    'notes'
  ];
  allowed.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      if (field === 'email' && updates.email) {
        const lower = updates.email.toLowerCase();
        if (lower !== existing.email.toLowerCase()) {
          const other = getEmployeeByEmail(lower);
          if (other && other.id !== id) {
            const error = new Error('Another employee already uses that email address.');
            error.status = 409;
            throw error;
          }
        }
        values.push(lower);
      } else {
        values.push(updates[field] ?? null);
      }
      fields.push(`${field} = ?`);
    }
  });
  if (!fields.length) {
    return existing;
  }
  values.push(new Date().toISOString());
  values.push(id);
  db.prepare(
    `UPDATE employees SET ${fields.join(', ')}, updatedAt = ? WHERE id = ?`
  ).run(...values);
  return getEmployeeById(id);
}

function deleteEmployee(id) {
  const existing = getEmployeeById(id);
  if (!existing) {
    return false;
  }
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  return true;
}

function bulkUpdateEmployees(ids = [], updates = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { updated: 0 };
  }
  const allowed = ['department', 'status'];
  const fields = [];
  const values = [];
  allowed.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      fields.push(`${field} = ?`);
      values.push(updates[field] ?? null);
    }
  });
  if (!fields.length) {
    return { updated: 0 };
  }
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(
    `UPDATE employees SET ${fields.join(', ')}, updatedAt = ? WHERE id IN (${placeholders})`
  );
  const result = stmt.run(...values, new Date().toISOString(), ...ids);
  return { updated: result.changes };
}

function listEmployeeFilters() {
  const departments = db
    .prepare(
      "SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND department != '' ORDER BY LOWER(department) ASC"
    )
    .all()
    .map((row) => row.department);
  const statuses = db
    .prepare(
      "SELECT DISTINCT status FROM employees WHERE status IS NOT NULL AND status != '' ORDER BY LOWER(status) ASC"
    )
    .all()
    .map((row) => row.status);
  const employmentTypes = db
    .prepare(
      "SELECT DISTINCT employmentType FROM employees WHERE employmentType IS NOT NULL AND employmentType != '' ORDER BY LOWER(employmentType) ASC"
    )
    .all()
    .map((row) => row.employmentType);
  return { departments, statuses, employmentTypes };
}

function importLeadership(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { created: [], skipped: [] };
  }
  const insertStmt = db.prepare(`
    INSERT INTO employees (id, name, email, phone, department, title, employmentType, startDate, status, emergencyContact, notes, createdAt, updatedAt)
    VALUES (@id, @name, @email, @phone, @department, @title, @employmentType, @startDate, @status, @emergencyContact, @notes, @createdAt, @updatedAt)
  `);
  const created = [];
  const skipped = [];
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const txn = db.transaction((payloads) => {
    payloads.forEach((entry) => {
      const lowerEmail = String(entry.email || '').toLowerCase();
      if (!lowerEmail || getEmployeeByEmail(lowerEmail)) {
        skipped.push(lowerEmail);
        return;
      }
      const record = {
        id: uuidv4(),
        name: entry.name,
        email: lowerEmail,
        phone: entry.phone || null,
        department: entry.department || null,
        title: entry.title || null,
        employmentType: entry.employmentType || 'Full-Time',
        startDate: entry.startDate || today,
        status: entry.status || 'active',
        emergencyContact: entry.emergencyContact || null,
        notes: entry.notes || `Imported from leadership directory on ${today}.`,
        createdAt: now,
        updatedAt: now
      };
      insertStmt.run(record);
      created.push(serializeEmployee(record));
    });
  });
  txn(entries);
  return { created, skipped };
}

module.exports = {
  listEmployees,
  getEmployeeById,
  getEmployeeByEmail,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  bulkUpdateEmployees,
  listEmployeeFilters,
  importLeadership
};
