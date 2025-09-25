const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { getUserByEmail, createUser } = require('../models/users');
const { bookingSchema, finaliseBooking } = require('../utils/booking');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const signupSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(64).pattern(/[A-Za-z]/).pattern(/\d|[!@#$%^&*]/).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required()
});

// After successful authentication, recover any booking intent captured pre-login.
function handlePendingBooking(req, userId) {
  if (!req.session.pendingBooking) {
    return;
  }
  const pending = req.session.pendingBooking;
  const { error, value } = bookingSchema.validate(pending, { abortEarly: false });
  if (!error) {
    value.startDate = new Date(value.startDate).toISOString();
    value.endDate = new Date(value.endDate).toISOString();
    try {
      finaliseBooking(value, userId);
      req.pushAlert('success', 'Your reserved suite is now confirmed. Welcome to Aurora Nexus Skyhaven.');
    } catch (bookingError) {
      req.pushAlert('danger', bookingError.message);
    }
  }
  delete req.session.pendingBooking;
}

router.get('/signup', (req, res) => {
  res.render('auth/signup', {
    pageTitle: 'Create Account'
  });
});

router.post('/signup', (req, res, next) => {
  const payload = {
    name: sanitizeString(req.body.name),
    email: sanitizeString(req.body.email),
    password: sanitizeString(req.body.password)
  };
  const { error, value } = signupSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Please review the sign up form and try again.');
    return res.redirect('/signup');
  }
  try {
    const user = createUser(value);
    req.session.userId = user.id;
    req.pushAlert('success', `Welcome aboard, ${user.name}. Your Skyhaven profile is ready.`);
    handlePendingBooking(req, user.id);
    const redirectPath = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    return res.redirect(redirectPath);
  } catch (creationError) {
    req.pushAlert('danger', creationError.message || 'We were unable to create your account.');
    return res.redirect('/signup');
  }
});

router.get('/login', (req, res) => {
  res.render('auth/login', {
    pageTitle: 'Log In'
  });
});

router.post('/login', (req, res) => {
  const payload = {
    email: sanitizeString(req.body.email),
    password: sanitizeString(req.body.password)
  };
  const { error, value } = loginSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid login credentials.');
    return res.redirect('/login');
  }
  const user = getUserByEmail(value.email);
  if (!user) {
    req.pushAlert('danger', 'We could not locate an account with that transmission ID.');
    return res.redirect('/login');
  }
  const isMatch = bcrypt.compareSync(value.password, user.passwordHash);
  if (!isMatch) {
    req.pushAlert('danger', 'Authentication failed. Please check your credentials.');
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  req.pushAlert('success', `Welcome back, ${user.name}.`);
  handlePendingBooking(req, user.id);
  const redirectPath = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  return res.redirect(redirectPath);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
