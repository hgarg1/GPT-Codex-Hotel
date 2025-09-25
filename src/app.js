const path = require('path');
const express = require('express');
const session = require('express-session');
const csrf = require('csurf');
const { hydrateUser } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { HOTEL_NAME } = require('./utils/constants');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/booking');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Serve immersive assets and parse request payloads.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'aurora-nexus-skyhaven-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 6
    }
  })
);

app.use((req, res, next) => {
  // Lightweight flash messaging utility shared across routes and templates.
  req.pushAlert = (type, message) => {
    const alerts = req.session.alerts || [];
    alerts.push({ type, message });
    req.session.alerts = alerts;
  };
  // Persist theme preference and brand identity for every render.
  res.locals.hotelName = HOTEL_NAME;
  res.locals.darkMode = req.session.darkMode ?? true;
  next();
});

app.use(hydrateUser);

const csrfProtection = csrf();
app.use(csrfProtection);
app.use((req, res, next) => {
  // Supply CSRF tokens and current alerts to every template render.
  res.locals.csrfToken = req.csrfToken();
  res.locals.alerts = req.session.alerts || [];
  req.session.alerts = [];
  next();
});

app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/', bookingRoutes);
app.use('/', dashboardRoutes);
app.use('/', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
