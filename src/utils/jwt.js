const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { DEFAULT_JWT_SECRET } = require('./jwtDefaults');
const { normalizeRole, Roles } = require('./rbac');

function parseCookies(req) {
  const header = req.headers?.cookie || req.request?.headers?.cookie;
  if (!header) return {};
  try {
    return cookie.parse(header);
  } catch (error) {
    return {};
  }
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies.session_token || null;
}

function getSigningConfig() {
  if (process.env.HOTEL_JWT_PRIVATE_KEY) {
    return { key: process.env.HOTEL_JWT_PRIVATE_KEY, algorithm: process.env.HOTEL_JWT_ALGORITHM || 'RS256' };
  }
  if (process.env.HOTEL_JWT_SECRET) {
    return { key: process.env.HOTEL_JWT_SECRET, algorithm: process.env.HOTEL_JWT_ALGORITHM || 'HS256' };
  }
  return { key: DEFAULT_JWT_SECRET, algorithm: 'HS256' };
}

function verifyHotelToken(token) {
  if (!token) return null;
  const { HOTEL_JWT_PUBLIC_KEY, HOTEL_JWT_ALGORITHMS } = process.env;
  const algorithms = HOTEL_JWT_ALGORITHMS ? HOTEL_JWT_ALGORITHMS.split(',') : ['RS256', 'HS256'];
  const verifyOptions = { algorithms };

  try {
    if (HOTEL_JWT_PUBLIC_KEY) {
      return jwt.verify(token, HOTEL_JWT_PUBLIC_KEY, verifyOptions);
    }
    // Without public key fallback to shared secret env for local dev
    if (process.env.HOTEL_JWT_SECRET) {
      return jwt.verify(token, process.env.HOTEL_JWT_SECRET, verifyOptions);
    }
    return jwt.verify(token, DEFAULT_JWT_SECRET, verifyOptions);
  } catch (error) {
    return null;
  }
}

function formatUserLike(userLike) {
  if (!userLike) return null;
  const { id, email, name, role } = userLike;
  if (!id) {
    return null;
  }
  return {
    id,
    email: email || null,
    name: name || null,
    role: normalizeRole(role || Roles.EMPLOYEE)
  };
}

function getUserFromRequest(req) {
  if (req?.user) {
    const normalized = formatUserLike(req.user);
    if (normalized) {
      return normalized;
    }
  }

  const token = getSessionToken(req);
  const payload = verifyHotelToken(token);
  if (!payload) return null;
  if (payload.user) {
    const normalized = formatUserLike(payload.user);
    return normalized;
  }
  const { sub, email, name, role } = payload;
  return formatUserLike({ id: sub, email, name, role });
}

function ensureDiningAuthenticated(req, res, next) {
  const user = getUserFromRequest(req);
  if (user) {
    req.diningUser = user;
    res.locals.diningUser = user;
    return next();
  }
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }
  const redirectTarget = `/login?redirect=${encodeURIComponent(req.originalUrl)}`;
  return res.redirect(redirectTarget);
}

function issueSessionToken(res, user) {
  const signing = getSigningConfig();
  if (!signing || !user || !user.id || !user.email) {
    return null;
  }
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || null,
    role: normalizeRole(user.role || Roles.EMPLOYEE),
  };
  const token = jwt.sign(payload, signing.key, {
    algorithm: signing.algorithm,
    expiresIn: '12h',
    audience: 'skyhaven:dining',
    issuer: 'skyhaven-hotel',
  });
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    domain: cookieDomain,
    maxAge: 1000 * 60 * 60 * 12,
  });
  return token;
}

function clearSessionToken(res) {
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('session_token', {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    domain: cookieDomain,
  });
}

module.exports = {
  parseCookies,
  getSessionToken,
  verifyHotelToken,
  getUserFromRequest,
  ensureDiningAuthenticated,
  issueSessionToken,
  clearSessionToken
};
