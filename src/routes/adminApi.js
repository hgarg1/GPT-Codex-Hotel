const express = require('express');
const Joi = require('joi');
const {
  requireRole,
  Roles,
  roleHigherThan,
  normalizeRole,
  getRolePriority
} = require('../utils/rbac');
const {
  getAllUsers,
  createSubAdmin,
  listSubAdmins,
  getUserById,
  removeSubAdmin
} = require('../models/users');
const { listEntries, updateEntry } = require('../models/timeEntries');
const {
  listAllRequests,
  updateRequestStatus,
  getRequestById,
  upsertProfile
} = require('../models/employeeRequests');
const { generateBadge } = require('../services/employeeBadges');
const {
  getRolePermissions,
  setRolePermission,
  listRoles
} = require('../models/roles');
const { recordAuditLog } = require('../models/auditLogs');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const roleSummaryOrder = [Roles.GLOBAL_ADMIN, Roles.SUPER_ADMIN, Roles.ADMIN, Roles.EMPLOYEE];

function sanitizeOptional(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const clean = sanitizeString(value);
  return clean.length ? clean : null;
}

const subAdminSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string()
    .valid(Roles.ADMIN, Roles.SUPER_ADMIN)
    .required(),
  department: Joi.string().max(120).allow(null, ''),
  status: Joi.string().valid('active', 'suspended', 'terminated').default('active')
});

const permissionUpdateSchema = Joi.object({
  permission: Joi.string().required(),
  allowed: Joi.boolean().required()
});

const timeAdjustmentSchema = Joi.object({
  clockInAt: Joi.string().isoDate().optional(),
  clockOutAt: Joi.string().isoDate().allow(null, '').optional(),
  department: Joi.string().max(120).allow('', null),
  role: Joi.string().max(120).allow('', null),
  location: Joi.string().max(180).allow('', null),
  notes: Joi.string().max(500).allow('', null)
}).min(1);

const requestStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'approved', 'denied', 'cancelled', 'canceled', 'in_review', 'completed')
    .required(),
  note: Joi.string().max(500).allow('', null)
});

router.use(requireRole(Roles.ADMIN));

router.get('/directory', (req, res) => {
  const users = getAllUsers();
  const units = new Map();
  const roleSummary = {};

  users.forEach((user) => {
    const departmentName = user.department?.trim() || 'Unassigned';
    const key = departmentName.toLowerCase();
    const current = units.get(key) || { name: departmentName, members: [] };
    current.members.push({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'active'
    });
    units.set(key, current);
    const normalizedRole = normalizeRole(user.role);
    roleSummary[normalizedRole] = (roleSummary[normalizedRole] || 0) + 1;
  });

  const sortedUnits = Array.from(units.values())
    .map((unit) => ({
      ...unit,
      members: unit.members.sort((a, b) => {
        const priorityDiff = getRolePriority(b.role) - getRolePriority(a.role);
        if (priorityDiff !== 0) return priorityDiff;
        return a.name.localeCompare(b.name);
      })
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const orderedSummary = roleSummaryOrder.reduce((acc, role) => {
    if (roleSummary[role]) {
      acc.push({ role, count: roleSummary[role] });
    }
    return acc;
  }, []);

  return res.json({
    units: sortedUnits,
    roleSummary: orderedSummary,
    totalUsers: users.length,
    generatedAt: new Date().toISOString()
  });
});

router.get('/subadmins', requireRole(Roles.SUPER_ADMIN), (req, res) => {
  const subAdmins = listSubAdmins();
  const cache = new Map();
  const enriched = subAdmins.map((user) => {
    const role = normalizeRole(user.role);
    if (!cache.has(role)) {
      cache.set(role, getRolePermissions(role));
    }
    return {
      ...user,
      permissions: cache.get(role)
    };
  });
  return res.json({ subAdmins: enriched });
});

router.post('/subadmins', requireRole(Roles.SUPER_ADMIN), (req, res) => {
  const { error, value } = subAdminSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid sub-admin payload', details: error.details.map((detail) => detail.message) });
  }
  const normalizedRole = normalizeRole(value.role);
  const actorRole = normalizeRole(req.user.role);
  if (normalizedRole === Roles.SUPER_ADMIN && actorRole !== Roles.GLOBAL_ADMIN) {
    return res.status(403).json({ error: 'Only the Global Admin can create Super Admins.' });
  }
  if (normalizedRole === Roles.ADMIN && ![Roles.GLOBAL_ADMIN, Roles.SUPER_ADMIN].includes(actorRole)) {
    return res.status(403).json({ error: 'Insufficient privileges to create an Admin account.' });
  }
  try {
    const newUser = createSubAdmin({
      name: value.name,
      email: value.email,
      password: value.password,
      role: normalizedRole,
      department: value.department,
      status: value.status,
      createdByUserId: req.user.id
    });
    recordAuditLog({
      actorUserId: req.user.id,
      targetUserId: newUser.id,
      action: 'subadmin_created',
      details: {
        role: newUser.role,
        department: newUser.department || null
      }
    });
    const permissions = getRolePermissions(newUser.role);
    return res.status(201).json({ subAdmin: { ...newUser, permissions } });
  } catch (creationError) {
    const status = creationError.status || 500;
    return res.status(status).json({ error: creationError.message || 'Unable to create sub-admin' });
  }
});

router.delete('/subadmins/:id', requireRole(Roles.SUPER_ADMIN), (req, res) => {
  const targetId = String(req.params.id || '').trim();
  if (!targetId) {
    return res.status(400).json({ error: 'Sub-admin id is required' });
  }
  const actorRole = normalizeRole(req.user.role);
  const target = getUserById(targetId);
  if (!target) {
    return res.status(404).json({ error: 'Sub-admin not found' });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own status.' });
  }
  const targetRole = normalizeRole(target.role);
  if (![Roles.ADMIN, Roles.SUPER_ADMIN].includes(targetRole)) {
    return res.status(400).json({ error: 'Only admin accounts can be terminated via this endpoint.' });
  }
  if (!roleHigherThan(actorRole, targetRole)) {
    return res.status(403).json({ error: 'You do not have sufficient privileges to remove that account.' });
  }
  const previousStatus = target.status;
  const updated = removeSubAdmin(targetId);
  recordAuditLog({
    actorUserId: req.user.id,
    targetUserId: targetId,
    action: 'subadmin_status_changed',
    details: {
      role: updated.role,
      previousStatus,
      newStatus: updated.status
    }
  });
  const permissions = getRolePermissions(updated.role);
  return res.json({ subAdmin: { ...updated, permissions } });
});

router.get('/time-entries', (req, res) => {
  const employeeId = req.query.employeeId ? String(req.query.employeeId).trim() : null;
  const start = req.query.start ? new Date(req.query.start) : null;
  const end = req.query.end ? new Date(req.query.end) : null;
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 150, 500);
  const range = {
    start: start && !Number.isNaN(start.valueOf()) ? start.toISOString() : undefined,
    end: end && !Number.isNaN(end.valueOf()) ? end.toISOString() : undefined,
    employeeId: employeeId || undefined
  };
  const entries = listEntries(range).slice(0, limit);
  const enriched = entries.map((entry) => {
    const employee = getUserById(entry.employeeId);
    return {
      ...entry,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            department: employee.department || null
          }
        : null
    };
  });
  return res.json({ entries: enriched });
});

router.post('/time-entries/:id/adjust', (req, res) => {
  const entryId = String(req.params.id || '').trim();
  if (!entryId) {
    return res.status(400).json({ error: 'Time entry id is required' });
  }
  const { error, value } = timeAdjustmentSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid time adjustment payload', details: error.details.map((d) => d.message) });
  }
  const updates = {
    clockInAt: value.clockInAt || undefined,
    clockOutAt: value.clockOutAt === '' ? null : value.clockOutAt,
    department: sanitizeOptional(value.department),
    role: sanitizeOptional(value.role),
    location: sanitizeOptional(value.location),
    notes: sanitizeOptional(value.notes)
  };
  try {
    const updated = updateEntry(entryId, updates);
    recordAuditLog({
      actorUserId: req.user.id,
      targetUserId: updated.employeeId,
      action: 'time_entry_adjusted',
      details: {
        entryId,
        updates
      }
    });
    return res.json({ entry: updated });
  } catch (adjustError) {
    const status = adjustError.status || 500;
    return res.status(status).json({ error: adjustError.message || 'Unable to adjust time entry' });
  }
});

router.get('/requests', (req, res) => {
  const requests = listAllRequests().map((request) => {
    const employee = getUserById(request.employeeId);
    return {
      ...request,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            department: employee.department || null
          }
        : null
    };
  });
  return res.json({ requests });
});

router.post('/requests/:id/status', (req, res) => {
  const requestId = String(req.params.id || '').trim();
  if (!requestId) {
    return res.status(400).json({ error: 'Request id is required' });
  }
  const { error, value } = requestStatusSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid status payload', details: error.details.map((d) => d.message) });
  }
  const existing = getRequestById(requestId);
  if (!existing) {
    return res.status(404).json({ error: 'Request not found' });
  }
  const updated = updateRequestStatus(requestId, {
    status: value.status,
    note: sanitizeOptional(value.note),
    resolvedBy: req.user.id
  });
  if (value.status.toLowerCase() === 'approved' && existing.type === 'profile_update') {
    upsertProfile(existing.employeeId, existing.payload || {});
  }
  recordAuditLog({
    actorUserId: req.user.id,
    targetUserId: existing.employeeId,
    action: 'employee_request_updated',
    details: {
      requestId,
      status: updated.status
    }
  });
  return res.json({ request: updated });
});

async function resolveBadge(req, res, method) {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const employee = getUserById(employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const badge = await generateBadge(employee, baseUrl);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${employee.name.replace(/[^a-z0-9]/gi, '_')}-badge.pdf"`);
    if (method === 'POST') {
      recordAuditLog({
        actorUserId: req.user.id,
        targetUserId: employeeId,
        action: 'employee_badge_generated',
        details: {
          badgeId: badge.badgeId
        }
      });
    }
    return res.send(badge.buffer);
  } catch (badgeError) {
    console.error('Badge generation failed', badgeError);
    return res.status(500).json({ error: 'Unable to generate badge' });
  }
}

router.post('/employees/:id/badge', (req, res) => resolveBadge(req, res, 'POST'));
router.get('/employees/:id/badge', (req, res) => resolveBadge(req, res, 'GET'));

router.get('/roles', requireRole(Roles.SUPER_ADMIN), (_req, res) => {
  const roles = listRoles().map((role) => ({
    ...role,
    permissions: getRolePermissions(role.id)
  }));
  return res.json({ roles });
});

router.get('/roles/:roleId/permissions', requireRole(Roles.SUPER_ADMIN), (req, res) => {
  const roleId = normalizeRole(req.params.roleId);
  if (!listRoles().some((role) => role.id === roleId)) {
    return res.status(404).json({ error: 'Role not found' });
  }
  return res.json({ roleId, permissions: getRolePermissions(roleId) });
});

router.patch('/roles/:roleId/permissions', requireRole(Roles.SUPER_ADMIN), (req, res) => {
  const { error, value } = permissionUpdateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Invalid permission payload', details: error.details.map((detail) => detail.message) });
  }
  const targetRole = normalizeRole(req.params.roleId);
  const actorRole = normalizeRole(req.user.role);
  if (targetRole === Roles.GLOBAL_ADMIN) {
    return res.status(403).json({ error: 'Global Admin permissions cannot be modified.' });
  }
  if (!roleHigherThan(actorRole, targetRole)) {
    return res.status(403).json({ error: 'You cannot modify permissions for an equal or higher role.' });
  }
  try {
    const permissions = setRolePermission({
      roleId: targetRole,
      permission: value.permission,
      allowed: value.allowed,
      updatedByUserId: req.user.id
    });
    return res.json({ roleId: targetRole, permissions });
  } catch (updateError) {
    const status = updateError.status || 500;
    return res.status(status).json({ error: updateError.message || 'Unable to update permission' });
  }
});

module.exports = router;
