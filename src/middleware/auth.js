const { getUserById } = require('../models/users');
const { getEmployeeByEmail } = require('../models/employees');
const { countUnreadMessages } = require('../models/chat');
const { getSessionToken, verifyHotelToken, issueSessionToken } = require('../utils/jwt');
const { requireRole, Roles, normalizeRole } = require('../utils/rbac');

function ensureDiningSessionCookie(req, res, user) {
  if (!user) {
    return;
  }

  const existingToken = getSessionToken(req);
  if (!existingToken) {
    issueSessionToken(res, user);
    return;
  }

  const payload = verifyHotelToken(existingToken);
  const payloadUser = payload?.user;
  const payloadId = payloadUser?.id || payload?.sub || payload?.id;
  const payloadEmail = payloadUser?.email || payload?.email;
  const emailsMatch =
    !payloadEmail || !user.email
      ? true
      : String(payloadEmail).toLowerCase() === String(user.email).toLowerCase();

  if (!payload || payloadId !== user.id || !emailsMatch) {
    issueSessionToken(res, user);
  }
}

// Ensures a user is attached to the request if their session is active.
function hydrateUser(req, res, next) {
  if (req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user) {
      const normalizedRole = normalizeRole(user.role);
      req.user = {
        ...user,
        role: normalizedRole
      };
      res.locals.currentUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizedRole,
        department: user.department || null,
        status: user.status || null,
        bio: user.bio,
        phone: user.phone,
        mustChangePassword: Boolean(user.mustChangePassword)
      };
      ensureDiningSessionCookie(req, res, req.user);
      res.locals.chatUnreadCount = countUnreadMessages(user.id);
      res.locals.forcePasswordChange = Boolean(user.mustChangePassword);
      return next();
    }
    delete req.session.userId;
  }
  res.locals.currentUser = null;
  res.locals.chatUnreadCount = 0;
  res.locals.forcePasswordChange = false;
  return next();
}

function ensureAuthenticated(req, res, next) {
  if (req.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  req.pushAlert('warning', 'Please log in to continue your Skyhaven journey.');
  return res.redirect('/login');
}

function ensureApiAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function ensureEmployeePortal(req, res, next) {
  if (!req.user) {
    req.session.returnTo = '/employee';
    req.pushAlert('warning', 'Please log in with your crew credentials to continue.');
    return res.redirect('/login');
  }
  if (normalizeRole(req.user.role) !== Roles.EMPLOYEE) {
    return res.redirect('/dashboard');
  }
  const employeeRecord = getEmployeeByEmail(req.user.email);
  if (!employeeRecord) {
    req.pushAlert('warning', 'Your profile is not registered with the crew manifest yet.');
    return res.redirect('/dashboard');
  }
  res.locals.employeeRecord = employeeRecord;
  return next();
}

function ensureEmployeeApi(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (normalizeRole(req.user.role) !== Roles.EMPLOYEE) {
    return res.status(403).json({ error: 'Employee access required' });
  }
  const employeeRecord = getEmployeeByEmail(req.user.email);
  if (!employeeRecord) {
    return res.status(403).json({ error: 'Employee access required' });
  }
  res.locals.employeeRecord = employeeRecord;
  return next();
}

const ensureAdmin = requireRole(Roles.ADMIN, {
  forbiddenMessage: 'You need Aurora Nexus Skyhaven curator privileges to view that console.'
});

module.exports = {
  hydrateUser,
  ensureAuthenticated,
  ensureApiAuth,
  ensureAdmin,
  ensureEmployeePortal,
  ensureEmployeeApi
};
