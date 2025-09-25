const path = require('path');
const express = require('express');
const csrf = require('csurf');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { hydrateUser } = require('./middleware/auth');
const { sessionMiddleware } = require('./middleware/session');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { HOTEL_NAME } = require('./utils/constants');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/booking');
const amenityRoutes = require('./routes/amenities');
const paymentRoutes = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", 'ws:', 'wss:', 'ws://localhost:3000', 'ws://127.0.0.1:3000'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:']
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives
    },
    crossOriginEmbedderPolicy: false
  })
);

// Serve immersive assets and parse request payloads.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(sessionMiddleware);

app.use((req, res, next) => {
  const now = Date.now();
  if (!req.session.createdAt) {
    req.session.createdAt = now;
  } else {
    const absoluteTimeout = 1000 * 60 * 60 * 12;
    if (now - req.session.createdAt > absoluteTimeout) {
      req.session.destroy(() => {
        res.redirect('/login');
      });
      return;
    }
  }

  req.pushAlert = (type, message) => {
    const alerts = req.session.alerts || [];
    alerts.push({ type, message });
    req.session.alerts = alerts;
  };
  res.locals.hotelName = HOTEL_NAME;
  res.locals.darkMode = req.session.darkMode ?? true;
  next();
});

app.use(hydrateUser);

const csrfProtection = csrf();
app.use(csrfProtection);
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.alerts = req.session.alerts || [];
  req.session.alerts = [];
  next();
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5
});
const chatLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20
});

app.use('/', publicRoutes);
app.use('/', authLimiter, authRoutes);
app.use('/', bookingRoutes);
app.use('/', amenityRoutes);
app.use('/', paymentLimiter, paymentRoutes);
app.use('/', dashboardRoutes);
app.use('/', chatLimiter, chatRoutes);
app.use('/', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
