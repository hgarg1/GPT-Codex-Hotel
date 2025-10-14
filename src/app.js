const path = require('path');
const express = require('express');
const csrf = require('csurf');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
let createProxyMiddleware;
try {
  ({ createProxyMiddleware } = require('http-proxy-middleware'));
} catch (error) {
  createProxyMiddleware = () => (req, res, next) => next();
}
const { hydrateUser } = require('./middleware/auth');
const { sessionMiddleware } = require('./middleware/session');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { HOTEL_NAME } = require('./utils/constants');
const { normalizeRole, Roles } = require('./utils/rbac');

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
const adminApiRoutes = require('./routes/adminApi');
const employeeRoutes = require('./routes/employee');
const employeeApiRoutes = require('./routes/employeeApi');
const employeeBadgeRoutes = require('./routes/employeeBadge');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Ensure Express respects proxy headers so rate limiting can accurately
// identify clients when the app is behind a reverse proxy.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

const connectSrc = new Set(["'self'", 'https:', 'wss:', 'ws:', `ws://localhost:${process.env.PORT || 3000}`, `ws://127.0.0.1:${process.env.PORT || 3000}`]);

const diningApiOrigin = (() => {
  const explicitOrigin = process.env.DINING_API_URL || process.env.DINING_API_ORIGIN;
  if (explicitOrigin) {
    return explicitOrigin;
  }
  const port = process.env.DINING_PORT || 4000;
  return `http://127.0.0.1:${port}`;
})();

const diningApiTarget = diningApiOrigin.replace(/\/$/, '') + '/api/dining';

try {
  const parsedDiningOrigin = new URL(diningApiOrigin);
  connectSrc.add(`${parsedDiningOrigin.protocol}//${parsedDiningOrigin.host}`);
} catch (error) {
  console.warn('Invalid dining API origin provided, falling back to default.', error);
}

function registerOrigin(origin) {
  if (!origin) return;
  origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      try {
        const url = new URL(value);
        connectSrc.add(`${url.protocol}//${url.host}`);
      } catch (error) {
        connectSrc.add(value);
      }
    });
}

registerOrigin(process.env.SOCKET_ORIGIN);
registerOrigin(process.env.SOCKET_ORIGINS);
registerOrigin(process.env.PUBLIC_BASE_URL);

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: Array.from(connectSrc),
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:']
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...cspDirectives,
        ...(isProd ? { 'upgrade-insecure-requests': [] } : {})
      }
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    crossOriginEmbedderPolicy: false
  })
);

if (isProd) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}
app.use(helmet.noSniff());
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Serve immersive assets and parse request payloads.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  '/api/dining',
  createProxyMiddleware({
    target: diningApiTarget,
    changeOrigin: true,
    ws: true,
    proxyTimeout: 15000,
    onError: (error, req, res) => {
      console.error('Dining API proxy error', error);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Dining service is currently unavailable. Please try again shortly.' });
      }
    },
  }),
);

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
  res.locals.extraStyles = [];
  next();
});

app.use(hydrateUser);

app.use((req, res, next) => {
  if (!req.user || normalizeRole(req.user.role) !== Roles.EMPLOYEE) {
    return next();
  }
  const originalUrl = req.originalUrl || '';
  const allowList = [/^\/employee(\/|$)/, /^\/api\/employee(\/|$)/, /^\/auth\//, /^\/logout$/, /^\/socket\.io/];
  if (allowList.some((pattern) => pattern.test(originalUrl))) {
    return next();
  }
  if (originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: 'Employee access limited to crew portal endpoints.' });
  }
  if (req.method === 'GET' && req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.redirect('/employee');
  }
  return res.redirect('/employee');
});

const csrfProtection = csrf();
app.use(csrfProtection);
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.alerts = req.session.alerts || [];
  req.session.alerts = [];
  next();
});

app.use('/api/admin', adminApiRoutes);
app.use('/api/employee', employeeApiRoutes);
app.use('/api/employee/badge', employeeBadgeRoutes);

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

        res.status(429);
        return res.render('429', {
          pageTitle: 'Transmission Overload',
          retryAfter: retryAfterSeconds,
          friendlyMessage
        });
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
app.use('/employee', employeeRoutes);
app.use('/', adminRoutes);
app.use('/', diningRoutes);
app.use('/', adminDiningRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
