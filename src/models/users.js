const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { Roles, normalizeRole } = require('../utils/rbac');

const db = getDb();

function ensureMustChangePasswordColumn() {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!tableExists) {
    return;
  }
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const hasColumn = columns.some((column) => column.name === 'mustChangePassword');
  if (!hasColumn) {
    db.prepare('ALTER TABLE users ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0').run();
  }
}

ensureMustChangePasswordColumn();

function serialiseUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeRole(row.role),
    phone: row.phone,
    bio: row.bio,
    department: row.department,
    status: row.status,
    mustChangePassword: Boolean(row.mustChangePassword),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getAllUsers() {
  const rows = db.prepare('SELECT * FROM users ORDER BY createdAt ASC').all();
  return rows.map(serialiseUser);
}

function searchUsers(query, limit = 10) {
  const likeQuery = `%${query.toLowerCase()}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users
       WHERE (LOWER(name) LIKE ? OR LOWER(email) LIKE ?)
       ORDER BY name ASC
       LIMIT ?`
    )
    .all(likeQuery, likeQuery, limit);
  return rows.map(serialiseUser);
}

function getUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  return serialiseUser(row);
}

function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return serialiseUser(row);
}

function getUserAuthByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
}

function createUser({ name, email, password, role = Roles.GUEST, department = null, createdByUserId = null }) {
  const existing = getUserAuthByEmail(email);
  if (existing) {
    const error = new Error('An account already exists for this email.');
    error.status = 409;
    throw error;
  }
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    name,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: normalizeRole(role),
    phone: null,
    bio: null,
    department,
    status: 'active',
    createdByUserId,
    createdAt: now,
    updatedAt: now,
    mustChangePassword: 0
  };
  db.prepare(`
    INSERT INTO users (id, name, email, passwordHash, role, phone, bio, department, status, createdByUserId, createdAt, updatedAt, mustChangePassword)
    VALUES (@id, @name, @email, @passwordHash, @role, @phone, @bio, @department, @status, @createdByUserId, @createdAt, @updatedAt, @mustChangePassword)
  `).run(record);
  return serialiseUser(record);
}

function createSubAdmin({
  name,
  email,
  password,
  role,
  department,
  status = 'active',
  createdByUserId
}) {
  const normalizedRole = normalizeRole(role);
  if (![Roles.ADMIN, Roles.SUPER_ADMIN].includes(normalizedRole)) {
    const error = new Error('Sub-admin role must be ADMIN or SUPER_ADMIN.');
    error.status = 400;
    throw error;
  }
  const existing = getUserAuthByEmail(email);
  if (existing) {
    const error = new Error('An account already exists for this email.');
    error.status = 409;
    throw error;
  }
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    name,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: normalizedRole,
    phone: null,
    bio: null,
    department: department || null,
    status,
    createdByUserId: createdByUserId || null,
    createdAt: now,
    updatedAt: now,
    mustChangePassword: 1
  };
  db.prepare(`
    INSERT INTO users (id, name, email, passwordHash, role, phone, bio, department, status, createdByUserId, createdAt, updatedAt, mustChangePassword)
    VALUES (@id, @name, @email, @passwordHash, @role, @phone, @bio, @department, @status, @createdByUserId, @createdAt, @updatedAt, @mustChangePassword)
  `).run(record);
  return serialiseUser(record);
}

function listSubAdmins() {
  const rows = db
    .prepare(
      `SELECT * FROM users WHERE role IN (@adminRole, @superRole) ORDER BY createdAt DESC`
    )
    .all({ adminRole: Roles.ADMIN, superRole: Roles.SUPER_ADMIN });
  return rows.map(serialiseUser);
}

function removeSubAdmin(id) {
  const user = getUserById(id);
  if (!user) {
    const error = new Error('Sub-admin not found');
    error.status = 404;
    throw error;
  }
  const normalizedRole = normalizeRole(user.role);
  if (![Roles.ADMIN, Roles.SUPER_ADMIN].includes(normalizedRole)) {
    const error = new Error('Only admin accounts can be removed via this endpoint.');
    error.status = 400;
    throw error;
  }
  db.prepare('UPDATE users SET status = ?, updatedAt = ? WHERE id = ?').run('terminated', new Date().toISOString(), id);
  return getUserById(id);
}

function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

function updateUserProfile(id, updates = {}) {
  const user = getUserById(id);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const next = {
    name: updates.name ?? user.name,
    phone: updates.phone ?? user.phone,
    bio: updates.bio ?? user.bio,
    updatedAt: now,
    id
  };
  db.prepare(`
    UPDATE users
    SET name = @name, phone = @phone, bio = @bio, updatedAt = @updatedAt
    WHERE id = @id
  `).run(next);
  return getUserById(id);
}

function updateUserPassword(id, password, options = {}) {
  const now = new Date().toISOString();
  const requireChange = options.requireChange ? 1 : 0;
  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ?, mustChangePassword = ? WHERE id = ?').run(
    bcrypt.hashSync(password, 10),
    now,
    requireChange,
    id
  );
  return getUserById(id);
}

function getUserPasswordHash(id) {
  const row = db.prepare('SELECT passwordHash FROM users WHERE id = ?').get(id);
  return row ? row.passwordHash : null;
}

module.exports = {
  getAllUsers,
  getUserByEmail,
  getUserById,
  getUserAuthByEmail,
  createUser,
  createSubAdmin,
  listSubAdmins,
  removeSubAdmin,
  verifyPassword,
  updateUserProfile,
  updateUserPassword,
  getUserPasswordHash,
  searchUsers
};
