const express = require('express');
const Joi = require('joi');
const { ensureAuthenticated } = require('../middleware/auth');
const { getBookingsByUser, cancelBooking } = require('../models/bookings');
const { adjustRoomAvailability } = require('../models/rooms');
const { updateUserProfile } = require('../models/users');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const profileSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  bio: Joi.string().allow('').max(400),
  phone: Joi.string().allow('').max(40)
});

// Personalised control centre for confirmed guests.
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const bookings = getBookingsByUser(req.user.id);
  res.render('dashboard/index', {
    pageTitle: 'Your Dashboard',
    bookings
  });
});

router.post('/profile', ensureAuthenticated, (req, res) => {
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

router.post('/bookings/:id/cancel', ensureAuthenticated, (req, res) => {
  const bookingId = sanitizeString(req.params.id);
  const { booking, wasUpdated } = cancelBooking(bookingId, req.user.id);
  if (!booking) {
    req.pushAlert('danger', 'We were unable to locate that booking.');
    return res.redirect('/dashboard');
  }
  if (wasUpdated) {
    adjustRoomAvailability(booking.roomId, 1);
    req.pushAlert('info', 'Your booking has been cancelled. Availability restored for fellow travellers.');
  }
  return res.redirect('/dashboard');
});

module.exports = router;
