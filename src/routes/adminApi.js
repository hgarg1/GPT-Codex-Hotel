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
const {
  getRolePermissions,
  setRolePermission,
  listRoles
} = require('../models/roles');
const { recordAuditLog } = require('../models/auditLogs');

const router = express.Router();

const roleSummaryOrder = [Roles.GLOBAL_ADMIN, Roles.SUPER_ADMIN, Roles.ADMIN, Roles.EMPLOYEE];

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
