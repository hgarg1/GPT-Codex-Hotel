const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: path.join(__dirname, '..', '..', 'data'),
  table: 'sessions'
});

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'aurora-nexus-skyhaven-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2
  }
});

module.exports = {
  sessionMiddleware,
  sessionStore
};
