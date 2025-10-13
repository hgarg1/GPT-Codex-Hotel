const { getUserById } = require('../models/users');
const { countUnreadMessages } = require('../models/chat');

// Ensures a user is attached to the request if their session is active.
function hydrateUser(req, res, next) {
  if (req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        phone: user.phone
      };
      res.locals.chatUnreadCount = countUnreadMessages(user.id);
      return next();
    }
    delete req.session.userId;
  }
  res.locals.currentUser = null;
  res.locals.chatUnreadCount = 0;
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

function ensureAdmin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    req.pushAlert('warning', 'Administrator access requires you to log in first.');
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    req.pushAlert('danger', 'You need Aurora Nexus Skyhaven curator privileges to view that console.');
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = {
  hydrateUser,
  ensureAuthenticated,
  ensureApiAuth,
  ensureAdmin
};
