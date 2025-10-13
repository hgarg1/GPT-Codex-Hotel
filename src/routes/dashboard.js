const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { ensureAuthenticated } = require('../middleware/auth');
const { listBookingsByUser, getBookingById, updateBookingStatus } = require('../models/bookings');
const { adjustRoomAvailability } = require('../models/rooms');
const { listReservationsByUser } = require('../models/amenities');
const {
  updateUserProfile,
  updateUserPassword,
  getUserPasswordHash
} = require('../models/users');
const { getPaymentByBookingId } = require('../models/payments');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const profileSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  bio: Joi.string().allow('').max(400),
  phone: Joi.string().allow('').max(40)
});

const passwordComplexity = Joi.string()
  .min(8)
  .max(64)
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/\d/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special character')
  .required();

const passwordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordComplexity
});

router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const bookings = listBookingsByUser(req.user.id).map((booking) => ({
    ...booking,
    payment: getPaymentByBookingId(booking.id)
  }));
  const reservations = listReservationsByUser(req.user.id);
  res.render('dashboard/index', {
    pageTitle: 'Your Dashboard',
    bookings,
    reservations
  });
});

router.post('/me', ensureAuthenticated, (req, res) => {
  const payload = {
    name: sanitizeString(req.body.name),
    bio: sanitizeString(req.body.bio),
    phone: sanitizeString(req.body.phone)
  };
  const { error, value } = profileSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Profile update failed. Please review the fields.');
    return res.redirect('/dashboard');
  }
  updateUserProfile(req.user.id, value);
  req.pushAlert('success', 'Profile updated. Your preferences are synced across Skyhaven.');
  return res.redirect('/dashboard');
});

router.post('/me/password', ensureAuthenticated, (req, res) => {
  const payload = {
    currentPassword: sanitizeString(req.body.currentPassword),
    newPassword: sanitizeString(req.body.newPassword)
  };
  const { error, value } = passwordSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Password update failed.');
    return res.redirect('/dashboard');
  }
  const currentHash = getUserPasswordHash(req.user.id);
  if (!currentHash || !bcrypt.compareSync(value.currentPassword, currentHash)) {
    req.pushAlert('danger', 'Current password is incorrect.');
    return res.redirect('/dashboard');
  }
  updateUserPassword(req.user.id, value.newPassword);
  req.pushAlert('success', 'Password updated successfully.');
  return res.redirect('/dashboard');
});

router.post('/bookings/:id/cancel', ensureAuthenticated, (req, res) => {
  const bookingId = sanitizeString(req.params.id);
  const booking = getBookingById(bookingId);
  if (!booking || booking.userId !== req.user.id) {
    req.pushAlert('danger', 'We were unable to locate that booking.');
    return res.redirect('/dashboard');
  }
  if (booking.status === 'Paid') {
    const checkInDate = new Date(booking.checkIn);
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() + 48);
    if (checkInDate <= cutoff) {
      req.pushAlert('danger', 'Paid bookings can only be cancelled 48 hours before check-in.');
      return res.redirect('/dashboard');
    }
  }
  updateBookingStatus(booking.id, 'Canceled');
  adjustRoomAvailability(booking.roomTypeId, 1);
  req.pushAlert('info', 'Your booking has been cancelled. Availability restored for fellow travellers.');
  return res.redirect('/dashboard');
});

module.exports = router;
