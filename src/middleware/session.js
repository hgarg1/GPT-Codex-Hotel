const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: path.join(__dirname, '..', '..', 'data'),
  table: 'sessions'
});

const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'skyhaven_session';
const sessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;
const isProd = process.env.NODE_ENV === 'production';

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'aurora-nexus-skyhaven-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  name: sessionCookieName,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    domain: sessionCookieDomain
  }
});

module.exports = {
  sessionMiddleware,
  sessionStore
};
