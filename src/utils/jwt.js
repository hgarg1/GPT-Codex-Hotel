const jwt = require('jsonwebtoken');
const cookie = require('cookie');

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
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

function getUserFromRequest(req) {
  const token = getSessionToken(req);
  const payload = verifyHotelToken(token);
  if (!payload) return null;
  if (payload.user) {
    return payload.user;
  }
  const { sub, email, name, role } = payload;
  return {
    id: sub,
    email,
    name,
    role: role || 'guest'
  };
}

function ensureDiningAuthenticated(req, res, next) {
  const user = getUserFromRequest(req);
  if (user) {
    req.diningUser = user;
    res.locals.diningUser = user;
    return next();
  }
  const redirectTarget = `/login?redirect=${encodeURIComponent(req.originalUrl)}`;
  return res.redirect(redirectTarget);
}

module.exports = {
  parseCookies,
  getSessionToken,
  verifyHotelToken,
  getUserFromRequest,
  ensureDiningAuthenticated
};
