const { getDb } = require('../db');
const { normalizeRole, Roles, ALL_PERMISSIONS, isValidPermission } = require('../utils/rbac');
const { recordAuditLog } = require('./auditLogs');

const db = getDb();

function listRoles() {
  const rows = db
    .prepare('SELECT id, label, priority FROM roles ORDER BY priority DESC')
    .all();
  return rows.map((row) => ({
    id: normalizeRole(row.id),
    label: row.label,
    priority: row.priority
  }));
}

function getRoleById(roleId) {
  const normalized = normalizeRole(roleId);
  const row = db.prepare('SELECT id, label, priority FROM roles WHERE id = ?').get(normalized);
  if (!row) {
    return null;
  }
  return {
    id: normalizeRole(row.id),
    label: row.label,
    priority: row.priority
  };
}

function getRolePermissions(roleId) {
  const normalized = normalizeRole(roleId);
  const rows = db
    .prepare('SELECT permission, allowed FROM role_permissions WHERE roleId = ?')
    .all(normalized);
  const map = new Map(rows.map((row) => [row.permission, Boolean(row.allowed)]));
  const permissions = {};
  ALL_PERMISSIONS.forEach((permission) => {
    permissions[permission] = map.has(permission) ? map.get(permission) : false;
  });
  return permissions;
}

function setRolePermission({ roleId, permission, allowed, updatedByUserId }) {
  const normalizedRole = normalizeRole(roleId);
  if (!getRoleById(normalizedRole)) {
    const error = new Error('Role not found');
    error.status = 404;
    throw error;
  }
  if (!isValidPermission(permission)) {
    const error = new Error('Unknown permission');
    error.status = 400;
    throw error;
  }
  const nextAllowed = Boolean(allowed);
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT allowed FROM role_permissions WHERE roleId = ? AND permission = ?')
    .get(normalizedRole, permission);
  const previous = existing ? Boolean(existing.allowed) : false;

  db.prepare(
    `INSERT INTO role_permissions (roleId, permission, allowed, updatedAt, updatedByUserId)
     VALUES (@roleId, @permission, @allowed, @updatedAt, @updatedByUserId)
     ON CONFLICT(roleId, permission)
     DO UPDATE SET allowed = excluded.allowed, updatedAt = excluded.updatedAt, updatedByUserId = excluded.updatedByUserId`
  ).run({
    roleId: normalizedRole,
    permission,
    allowed: nextAllowed ? 1 : 0,
    updatedAt: now,
    updatedByUserId: updatedByUserId || null
  });

  if (previous !== nextAllowed) {
    recordAuditLog({
      actorUserId: updatedByUserId || null,
      targetUserId: null,
      action: 'role_permission_updated',
      details: {
        roleId: normalizedRole,
        permission,
        oldValue: previous,
        newValue: nextAllowed
      }
    });
  }

  return getRolePermissions(normalizedRole);
}

function canManageRole(actorRole, targetRole) {
  const normalizedActor = normalizeRole(actorRole);
  const normalizedTarget = normalizeRole(targetRole);
  if (normalizedActor === Roles.GLOBAL_ADMIN) {
    return normalizedTarget !== Roles.GLOBAL_ADMIN;
  }
  if (normalizedActor === Roles.SUPER_ADMIN) {
    return [Roles.ADMIN, Roles.EMPLOYEE].includes(normalizedTarget);
  }
  if (normalizedActor === Roles.ADMIN) {
    return normalizedTarget === Roles.EMPLOYEE;
  }
  return false;
}

module.exports = {
  listRoles,
  getRoleById,
  getRolePermissions,
  setRolePermission,
  canManageRole
};
