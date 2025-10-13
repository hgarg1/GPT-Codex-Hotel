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
const diningRoutes = require('./routes/dining');
const adminDiningRoutes = require('./routes/adminDining');

const app = express();

// Ensure Express respects proxy headers so rate limiting can accurately
// identify clients when the app is behind a reverse proxy.
app.set('trust proxy', true);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
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

const buildLimiter = ({ windowMs, max, skipSuccessfulRequests = false, message }) => {
  const retryAfterSeconds = Math.ceil(windowMs / 1000);
  const friendlyMessage =
    message || 'Too many requests detected. Please slow down and try again soon.';

  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
      const responsePayload = {
        error: friendlyMessage,
        retryAfter: retryAfterSeconds
      };

      res.setHeader('Retry-After', retryAfterSeconds);

      if (acceptsHtml) {
        if (typeof req.pushAlert === 'function') {
          req.pushAlert(
            'danger',
            `${friendlyMessage} Please wait ${retryAfterSeconds} seconds before retrying.`
          );
        }

        const redirectTarget = req.get('referer') || req.originalUrl || '/';
        return res.status(429).redirect(redirectTarget);
      }

      return res.status(429).json(responsePayload);
    }
  });
};

const authLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts detected.'
});
const paymentLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many payment attempts detected.'
});
const chatLimiter = buildLimiter({
  windowMs: 10 * 1000,
  max: 60,
  message: 'Chat is rate limited due to high activity.'
});

app.use('/', publicRoutes);
app.use('/', authLimiter, authRoutes);
app.use('/', bookingRoutes);
app.use('/', amenityRoutes);
app.use('/', paymentLimiter, paymentRoutes);
app.use('/', dashboardRoutes);
app.use('/', chatLimiter, chatRoutes);
app.use('/', adminRoutes);
app.use('/', diningRoutes);
app.use('/', adminDiningRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
