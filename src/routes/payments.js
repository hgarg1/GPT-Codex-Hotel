const express = require('express');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const { sanitizeString } = require('../utils/sanitize');
const { sanitizeBookingStep, validateBookingStep, luhnCheck } = require('../utils/booking');
const { getBookingById, updateBookingStatus } = require('../models/bookings');
const { getRoomById } = require('../models/rooms');
const {
  getPaymentByBookingId,
  createPaymentAndCapture,
  updatePaymentStatus,
  createReversal
} = require('../models/payments');
const { roleAtLeast, Roles } = require('../utils/rbac');

const router = express.Router();

function assertOwnership(req, booking) {
  if (!booking) return false;
  if (req.user && roleAtLeast(req.user.role, Roles.ADMIN)) return true;
  return booking.userId === req.user.id;
}

router.get('/pay/:bookingId', ensureAuthenticated, (req, res, next) => {
  const bookingId = sanitizeString(req.params.bookingId);
  const booking = getBookingById(bookingId);
  if (!booking) {
    return next();
  }
  if (!assertOwnership(req, booking)) {
    req.pushAlert('danger', 'You do not have access to this booking.');
    return res.redirect('/dashboard');
  }
  if (booking.status === 'Paid') {
    req.pushAlert('info', 'This booking is already paid.');
    return res.redirect(`/invoices/${booking.id}`);
  }
  const room = getRoomById(booking.roomTypeId);
  res.render('payments/pay', {
    pageTitle: 'Secure Payment',
    booking,
    room,
    errors: []
  });
});

router.post('/pay/:bookingId', ensureAuthenticated, (req, res, next) => {
  const bookingId = sanitizeString(req.params.bookingId);
  const booking = getBookingById(bookingId);
  if (!booking) {
    return next();
  }
  if (!assertOwnership(req, booking)) {
    req.pushAlert('danger', 'You do not have access to this booking.');
    return res.redirect('/dashboard');
  }
  if (booking.status === 'Paid') {
    req.pushAlert('info', 'This booking is already paid.');
    return res.redirect(`/invoices/${booking.id}`);
  }

  const sanitized = sanitizeBookingStep('payment', req.body);
  const { error, value } = validateBookingStep('payment', sanitized);
  const payload = value || sanitized;
  const errors = [];
  if (error) {
    error.details.forEach((detail) => errors.push(detail.message));
  }

  if (!luhnCheck(payload.cardNumber)) {
    errors.push('Card number failed validation.');
  }
  const [month, year] = payload.expiry.split('/').map((part) => Number.parseInt(part, 10));
  const expiryDate = new Date(2000 + year, month);
  if (expiryDate < new Date()) {
    errors.push('Card expiry date has passed.');
  }

  if (errors.length > 0) {
    const room = getRoomById(booking.roomTypeId);
    return res.status(400).render('payments/pay', {
      pageTitle: 'Secure Payment',
      booking,
      room,
      errors
    });
  }

  const last4 = payload.cardNumber.slice(-4);
  const payment = createPaymentAndCapture({
    bookingId: booking.id,
    amount: booking.total,
    last4,
    currency: 'USD'
  });
  updateBookingStatus(booking.id, 'Paid');
  req.session.lastPaidBookingId = booking.id;
  req.pushAlert('success', 'Payment authorised and captured. Welcome to Skyhaven.');
  return res.redirect(`/pay/${booking.id}/confirmation`);
});

router.get('/pay/:bookingId/confirmation', ensureAuthenticated, (req, res, next) => {
  const bookingId = sanitizeString(req.params.bookingId);
  const booking = getBookingById(bookingId);
  if (!booking) {
    return next();
  }
  if (!assertOwnership(req, booking)) {
    req.pushAlert('danger', 'You do not have access to this booking.');
    return res.redirect('/dashboard');
  }
  const payment = getPaymentByBookingId(booking.id);
  const room = getRoomById(booking.roomTypeId);
  res.render('payments/confirmation', {
    pageTitle: 'Payment Confirmed',
    booking,
    payment,
    room
  });
});

router.get('/invoices/:bookingId', ensureAuthenticated, (req, res, next) => {
  const booking = getBookingById(sanitizeString(req.params.bookingId));
  if (!booking) {
    return next();
  }
  if (!assertOwnership(req, booking)) {
    req.pushAlert('danger', 'You do not have permission to view that invoice.');
    return res.redirect('/dashboard');
  }
  const payment = getPaymentByBookingId(booking.id);
  const room = getRoomById(booking.roomTypeId);
  res.render('payments/invoice', {
    layout: false,
    booking,
    payment,
    room,
    generatedAt: new Date().toISOString()
  });
});

router.post('/payments/mock-webhook', (req, res) => {
  const payload = {
    bookingId: sanitizeString(req.body.bookingId),
    status: sanitizeString(req.body.status || '').toLowerCase()
  };
  if (!payload.bookingId || !payload.status) {
    return res.status(400).json({ error: 'bookingId and status are required' });
  }
  const booking = getBookingById(payload.bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  const payment = getPaymentByBookingId(booking.id);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not initiated' });
  }
  if (!['authorized', 'captured', 'failed', 'refunded'].includes(payload.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  updatePaymentStatus(payment.id, payload.status);
  if (payload.status === 'captured') {
    updateBookingStatus(booking.id, 'Paid');
  }
  if (payload.status === 'failed') {
    updateBookingStatus(booking.id, 'PendingPayment');
  }
  return res.json({ ok: true });
});

router.post('/admin/bookings/:id/refund', ensureAdmin, (req, res) => {
  const bookingId = sanitizeString(req.params.id);
  const booking = getBookingById(bookingId);
  if (!booking) {
    req.pushAlert('danger', 'Booking not found.');
    return res.redirect('/admin');
  }
  const payment = getPaymentByBookingId(booking.id);
  if (!payment || payment.status !== 'captured') {
    req.pushAlert('danger', 'No captured payment available for refund.');
    return res.redirect('/admin');
  }
  updatePaymentStatus(payment.id, 'refunded');
  createReversal(payment.id, payment.amount);
  updateBookingStatus(booking.id, 'Canceled');
  req.pushAlert('success', 'Booking refunded and status updated.');
  return res.redirect('/admin');
});

module.exports = router;
