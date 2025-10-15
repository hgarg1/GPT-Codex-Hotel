const Roles = Object.freeze({
  GUEST: 'GUEST',
  GLOBAL_ADMIN: 'GLOBAL_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE'
});

const RolePriority = Object.freeze({
  [Roles.GUEST]: 0,
  [Roles.EMPLOYEE]: 10,
  [Roles.ADMIN]: 30,
  [Roles.SUPER_ADMIN]: 40,
  [Roles.GLOBAL_ADMIN]: 50
});

const Permissions = Object.freeze({
  MANAGE_EMPLOYEES: 'manage:employees',
  RESET_PASSWORDS: 'reset:passwords',
  APPROVE_TRANSFERS: 'approve:transfers',
  MANAGE_PERMISSIONS: 'manage:permissions'
});

const ALL_PERMISSIONS = Object.freeze(Object.values(Permissions));

function normalizeRole(role) {
  if (!role || typeof role !== 'string') {
    return Roles.GUEST;
  }
  const upper = role.trim().toUpperCase();
  if (Roles[upper]) {
    return Roles[upper];
  }
  const match = Object.values(Roles).find((value) => value === upper);
  return match || Roles.GUEST;
}

function getRolePriority(role) {
  const normalized = normalizeRole(role);
  return RolePriority[normalized] || 0;
}

function roleAtLeast(role, minimumRole) {
  return getRolePriority(role) >= getRolePriority(minimumRole);
}

function roleHigherThan(role, otherRole) {
  return getRolePriority(role) > getRolePriority(otherRole);
}

function isValidPermission(permission) {
  if (!permission || typeof permission !== 'string') {
    return false;
  }
  return ALL_PERMISSIONS.includes(permission);
}

function buildUnauthorizedResponse(req, res) {
  if (req.originalUrl && req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }
  if (typeof req.pushAlert === 'function') {
    req.pushAlert('warning', 'Please log in to continue your Skyhaven journey.');
  }
  return res.redirect('/login');
}

function buildForbiddenResponse(req, res, message) {
  if (req.originalUrl && req.originalUrl.startsWith('/api')) {
    return res.status(403).json({ error: message || 'Forbidden' });
  }
  if (typeof req.pushAlert === 'function') {
    req.pushAlert('danger', message || 'You do not have the required privileges to access that area.');
  }
  return res.redirect('/dashboard');
}

function requireRole(minimumRole, options = {}) {
  const minRoleNormalized = normalizeRole(minimumRole);
  const forbiddenMessage = options.forbiddenMessage;
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return buildUnauthorizedResponse(req, res);
    }
    const userRole = normalizeRole(req.user.role);
    if (!roleAtLeast(userRole, minRoleNormalized)) {
      return buildForbiddenResponse(req, res, forbiddenMessage);
    }
    return next();
  };
}

module.exports = {
  Roles,
  Permissions,
  ALL_PERMISSIONS,
  normalizeRole,
  getRolePriority,
  roleAtLeast,
  roleHigherThan,
  isValidPermission,
  requireRole
};
