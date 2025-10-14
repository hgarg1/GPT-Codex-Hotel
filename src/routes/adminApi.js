const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const {
  requireRole,
  Roles,
  roleHigherThan,
  normalizeRole,
  getRolePriority,
  roleAtLeast
} = require('../utils/rbac');
const {
  getAllUsers,
  createSubAdmin,
  listSubAdmins,
  getUserById,
  removeSubAdmin,
  getUserByEmail,
  updateUserPassword
} = require('../models/users');
const {
  getRolePermissions,
  setRolePermission,
  listRoles
} = require('../models/roles');
const { recordAuditLog } = require('../models/auditLogs');
const {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  bulkUpdateEmployees,
  listEmployeeFilters,
  importLeadership
} = require('../models/employees');
const {
  listRequests: listEmployeeRequests,
  getRequestById,
  listPendingRequestsByEmployee,
  updateRequestStatus
} = require('../models/employeeRequests');
const { boardMembers, executiveTeam, advisoryCouncil } = require('../data/leadership');

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

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const employeeCreateSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  phone: Joi.string().max(40).allow(null, '').empty(''),
  department: Joi.string().max(120).allow(null, '').empty(''),
  title: Joi.string().max(120).allow(null, '').empty(''),
  employmentType: Joi.string().max(80).allow(null, '').default('Full-Time'),
  startDate: Joi.string().pattern(datePattern).allow(null, '').empty(''),
  status: Joi.string().max(40).allow(null, '').empty('').default('active'),
  emergencyContact: Joi.string().max(160).allow(null, '').empty(''),
  notes: Joi.string().max(1000).allow(null, '').empty('')
});

const employeeUpdateSchema = employeeCreateSchema.fork(['name', 'email'], (schema) => schema.optional());

const employeeBulkSchema = Joi.object({
  ids: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).min(1).required(),
  department: Joi.string().max(120).allow(null, '').empty(''),
  status: Joi.string().max(40).allow(null, '').empty('')
}).custom((value, helpers) => {
  if (value.department == null && value.status == null) {
    return helpers.error('any.custom', { message: 'A department or status update is required.' });
  }
  return value;
}, 'Bulk employee validation');

const leadershipImportSchema = Joi.object({
  includeAdvisory: Joi.boolean().default(true),
  includeBoard: Joi.boolean().default(true),
  includeExecutive: Joi.boolean().default(true)
});

const requestDecisionSchema = Joi.object({
  status: Joi.string().valid('approved', 'denied').required(),
  comment: Joi.string().max(500).allow(null, '').empty('')
});

const transferApprovalSchema = Joi.object({
  requestId: Joi.string().guid({ version: 'uuidv4' }).optional(),
  comment: Joi.string().max(500).allow(null, '').empty('')
});

function buildLeadershipEntries(options) {
  const entries = [];
  const today = new Date().toISOString().slice(0, 10);
  if (options.includeBoard) {
    boardMembers.forEach((member) => {
      entries.push({
        name: member.name,
        email: member.contact,
        title: member.role,
        department: 'Board of Directors',
        employmentType: 'Full-Time',
        status: 'active',
        startDate: today,
        notes: member.focus
      });
    });
  }
  if (options.includeExecutive) {
    executiveTeam.forEach((member) => {
      entries.push({
        name: member.name,
        email: member.contact,
        title: member.role,
        department: 'Executive Team',
        employmentType: 'Full-Time',
        status: 'active',
        startDate: today,
        notes: member.focus
      });
    });
  }
  if (options.includeAdvisory) {
    advisoryCouncil.forEach((member) => {
      entries.push({
        name: member.name,
        email: member.contact,
        title: member.role,
        department: 'Advisory Council',
        employmentType: 'Contract',
        status: 'active',
        startDate: today,
        notes: member.focus
      });
    });
  }
  return entries;
}

function generateTemporaryPassword() {
  const raw = crypto.randomBytes(9).toString('base64');
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Skyhaven123';
}

function resolvePendingRequest(employeeId, type, requestId) {
  if (requestId) {
    const request = getRequestById(requestId);
    if (!request || request.employeeId !== employeeId || request.type !== type || request.status !== 'pending') {
      const error = new Error('Matching pending request not found for this employee.');
      error.status = 404;
      throw error;
    }
    return request;
  }
  const [latest] = listPendingRequestsByEmployee(employeeId, type);
  if (!latest) {
    const error = new Error('No pending request found for this employee.');
    error.status = 404;
    throw error;
  }
  return latest;
}

function approveTransfer({ employeeId, actorUserId, request, comment }) {
  const payload = request.payload || {};
  const updates = {};
  if (payload.targetDepartment) {
    updates.department = payload.targetDepartment;
  }
  if (payload.targetStatus) {
    updates.status = payload.targetStatus;
  }
  let updatedEmployee = getEmployeeById(employeeId);
  if (!updatedEmployee) {
    const error = new Error('Employee not found');
    error.status = 404;
    throw error;
  }
  if (Object.keys(updates).length > 0) {
    updatedEmployee = updateEmployee(employeeId, updates);
  }
  const updatedRequest = updateRequestStatus(request.id, 'approved', comment, actorUserId);
  const linkedUser = updatedEmployee?.email ? getUserByEmail(updatedEmployee.email) : null;
  recordAuditLog({
    actorUserId,
    targetUserId: linkedUser?.id || null,
    action: 'employee_transfer_approved',
    details: {
      employeeId,
      requestId: request.id,
      targetDepartment: updates.department || updatedEmployee.department,
      payload
    }
  });
  return { employee: updatedEmployee, request: updatedRequest };
}

function approveResignation({ employeeId, actorUserId, request, comment }) {
  const existing = getEmployeeById(employeeId);
  if (!existing) {
    const error = new Error('Employee not found');
    error.status = 404;
    throw error;
  }
  const updatedEmployee = updateEmployee(employeeId, { status: 'terminated' });
  const updatedRequest = updateRequestStatus(request.id, 'approved', comment, actorUserId);
  const linkedUser = updatedEmployee?.email ? getUserByEmail(updatedEmployee.email) : null;
  const payload = request.payload || {};
  recordAuditLog({
    actorUserId,
    targetUserId: linkedUser?.id || null,
    action: 'employee_resignation_approved',
    details: {
      employeeId,
      requestId: request.id,
      effectiveLastDay: payload.lastDay || null,
      reason: payload.reason || null
    }
  });
  recordAuditLog({
    actorUserId,
    targetUserId: linkedUser?.id || null,
    action: 'employee_termination',
    details: {
      employeeId,
      source: 'resignation_approval',
      requestId: request.id
    }
  });
  return { employee: updatedEmployee, request: updatedRequest };
}

router.use(requireRole(Roles.ADMIN));

router.get('/employees', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const department = typeof req.query.department === 'string' ? req.query.department.trim() : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
  const employmentType =
    typeof req.query.employmentType === 'string' ? req.query.employmentType.trim() : undefined;
  const { employees, pagination } = listEmployees({
    search,
    department,
    status,
    employmentType,
    page: req.query.page,
    pageSize: req.query.pageSize
  });
  const filters = listEmployeeFilters();
  return res.json({
    employees,
    pagination,
    filters
  });
});

router.post('/employees', (req, res) => {
  const { error, value } = employeeCreateSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({
      error: 'Invalid employee payload',
      details: error.details.map((detail) => detail.message)
    });
  }
  try {
    const employee = createEmployee(value);
    return res.status(201).json({ employee });
  } catch (creationError) {
    const status = creationError.status || 500;
    return res.status(status).json({ error: creationError.message || 'Unable to create employee' });
  }
});

router.patch('/employees/:id', (req, res) => {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const { error, value } = employeeUpdateSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({
      error: 'Invalid employee payload',
      details: error.details.map((detail) => detail.message)
    });
  }
  try {
    const employee = updateEmployee(employeeId, value);
    return res.json({ employee });
  } catch (updateError) {
    const status = updateError.status || 500;
    return res.status(status).json({ error: updateError.message || 'Unable to update employee' });
  }
});

router.delete('/employees/:id', (req, res) => {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const actorRole = normalizeRole(req.user.role);
  if (!roleAtLeast(actorRole, Roles.SUPER_ADMIN)) {
    return res.status(403).json({ error: 'Only Super or Global administrators can delete employees.' });
  }
  const employee = getEmployeeById(employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  deleteEmployee(employeeId);
  const linkedUser = employee.email ? getUserByEmail(employee.email) : null;
  recordAuditLog({
    actorUserId: req.user.id,
    targetUserId: linkedUser?.id || null,
    action: 'employee_deleted',
    details: { employeeId }
  });
  return res.json({ success: true });
});

router.post('/employees/bulk', (req, res) => {
  const { error, value } = employeeBulkSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    const customMessage = error.details?.[0]?.context?.message;
    return res.status(400).json({
      error: customMessage || 'Invalid bulk update payload',
      details: error.details.map((detail) => detail.message)
    });
  }
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(value, 'department')) {
    updates.department = value.department || null;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'status')) {
    updates.status = value.status || null;
  }
  const result = bulkUpdateEmployees(value.ids, updates);
  const employees = value.ids.map((id) => getEmployeeById(id)).filter(Boolean);
  return res.json({
    updated: result.updated,
    employees
  });
});

router.post('/employees/import-from-leadership', (req, res) => {
  const { error, value } = leadershipImportSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({ error: 'Invalid import options', details: error.details.map((detail) => detail.message) });
  }
  const entries = buildLeadershipEntries(value || {});
  const summary = importLeadership(entries);
  if (summary.created.length > 0) {
    summary.created.forEach((employee) => {
      const linkedUser = employee.email ? getUserByEmail(employee.email) : null;
      recordAuditLog({
        actorUserId: req.user.id,
        targetUserId: linkedUser?.id || null,
        action: 'employee_imported',
        details: { employeeId: employee.id, source: 'leadership_directory' }
      });
    });
  }
  return res.json({
    created: summary.created,
    createdCount: summary.created.length,
    skippedCount: summary.skipped.filter(Boolean).length
  });
});

router.post('/employees/:id/reset-password', (req, res) => {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const employee = getEmployeeById(employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  if (!employee.email) {
    return res.status(400).json({ error: 'Employee record does not include an email address.' });
  }
  const user = getUserByEmail(employee.email);
  if (!user) {
    return res.status(404).json({ error: 'No user account linked to that employee email.' });
  }
  const temporaryPassword = generateTemporaryPassword();
  updateUserPassword(user.id, temporaryPassword);
  recordAuditLog({
    actorUserId: req.user.id,
    targetUserId: user.id,
    action: 'employee_password_reset',
    details: {
      employeeId,
      email: employee.email
    }
  });
  return res.json({
    employee,
    temporaryPassword
  });
});

router.post('/employees/:id/approve-transfer', (req, res) => {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const { error, value } = transferApprovalSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({ error: 'Invalid approval payload', details: error.details.map((detail) => detail.message) });
  }
  try {
    const request = resolvePendingRequest(employeeId, 'transfer', value.requestId);
    const result = approveTransfer({
      employeeId,
      actorUserId: req.user.id,
      request,
      comment: value.comment || null
    });
    return res.json(result);
  } catch (approvalError) {
    const status = approvalError.status || 500;
    return res.status(status).json({ error: approvalError.message || 'Unable to approve transfer request' });
  }
});

router.post('/employees/:id/approve-resignation', (req, res) => {
  const employeeId = String(req.params.id || '').trim();
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee id is required' });
  }
  const { error, value } = transferApprovalSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({ error: 'Invalid approval payload', details: error.details.map((detail) => detail.message) });
  }
  try {
    const request = resolvePendingRequest(employeeId, 'resignation', value.requestId);
    const result = approveResignation({
      employeeId,
      actorUserId: req.user.id,
      request,
      comment: value.comment || null
    });
    return res.json(result);
  } catch (approvalError) {
    const status = approvalError.status || 500;
    return res.status(status).json({ error: approvalError.message || 'Unable to approve resignation request' });
  }
});

router.get('/employee-requests', (req, res) => {
  const { requests, pagination } = listEmployeeRequests({
    status: typeof req.query.status === 'string' ? req.query.status.trim() : undefined,
    type: typeof req.query.type === 'string' ? req.query.type.trim() : undefined,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    page: req.query.page,
    pageSize: req.query.pageSize
  });
  return res.json({ requests, pagination });
});

router.post('/employee-requests/:id/decision', (req, res) => {
  const requestId = String(req.params.id || '').trim();
  if (!requestId) {
    return res.status(400).json({ error: 'Request id is required' });
  }
  const { error, value } = requestDecisionSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({ error: 'Invalid decision payload', details: error.details.map((detail) => detail.message) });
  }
  const request = getRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request has already been processed.' });
  }
  const comment = value.comment || null;
  if (value.status === 'approved') {
    if (request.type === 'transfer') {
      try {
        const result = approveTransfer({
          employeeId: request.employeeId,
          actorUserId: req.user.id,
          request,
          comment
        });
        return res.json(result);
      } catch (approvalError) {
        const status = approvalError.status || 500;
        return res.status(status).json({ error: approvalError.message || 'Unable to approve transfer request' });
      }
    }
    if (request.type === 'resignation') {
      try {
        const result = approveResignation({
          employeeId: request.employeeId,
          actorUserId: req.user.id,
          request,
          comment
        });
        return res.json(result);
      } catch (approvalError) {
        const status = approvalError.status || 500;
        return res.status(status).json({ error: approvalError.message || 'Unable to approve resignation request' });
      }
    }
    const updated = updateRequestStatus(requestId, 'approved', comment, req.user.id);
    recordAuditLog({
      actorUserId: req.user.id,
      targetUserId: null,
      action: 'employee_request_approved',
      details: {
        requestId,
        employeeId: request.employeeId,
        type: request.type
      }
    });
    return res.json({ request: updated });
  }

  const updated = updateRequestStatus(requestId, 'denied', comment, req.user.id);
  recordAuditLog({
    actorUserId: req.user.id,
    targetUserId: null,
    action: 'employee_request_denied',
    details: {
      requestId,
      employeeId: request.employeeId,
      type: request.type
    }
  });
  return res.json({ request: updated });
});

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
