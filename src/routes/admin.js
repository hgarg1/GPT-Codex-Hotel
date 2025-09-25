const express = require('express');
const Joi = require('joi');
const { ensureAdmin } = require('../middleware/auth');
const { getAllBookings } = require('../models/bookings');
const { getAllRooms, setRoomAvailability } = require('../models/rooms');
const { getAllInquiries } = require('../models/inquiries');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const availabilitySchema = Joi.object({
  availableUnits: Joi.number().integer().min(0).max(20).required()
});

// Admin-only overview for curators to monitor the Skyhaven ecosystem.
router.get('/admin', ensureAdmin, (req, res) => {
  res.render('admin/index', {
    pageTitle: 'Admin Control Deck',
    rooms: getAllRooms(),
    bookings: getAllBookings(),
    inquiries: getAllInquiries()
  });
});

router.post('/admin/rooms/:id', ensureAdmin, (req, res) => {
  const payload = {
    availableUnits: Number.parseInt(sanitizeString(req.body.availableUnits), 10)
  };
  const { error, value } = availabilitySchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid availability value supplied.');
    return res.redirect('/admin');
  }
  const room = setRoomAvailability(sanitizeString(req.params.id), value.availableUnits);
  if (!room) {
    req.pushAlert('danger', 'Room not found.');
    return res.redirect('/admin');
  }
  req.pushAlert('success', `Availability for ${room.name} updated to ${room.availableUnits}.`);
  return res.redirect('/admin');
});

module.exports = router;
