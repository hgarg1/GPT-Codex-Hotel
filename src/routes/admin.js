const express = require('express');
const Joi = require('joi');
const { ensureAdmin } = require('../middleware/auth');
const { listBookings } = require('../models/bookings');
const { listRoomTypes, setRoomAvailability } = require('../models/rooms');
const { listAmenities } = require('../models/amenities');
const { getPaymentByBookingId } = require('../models/payments');
const { getAllInquiries } = require('../models/inquiries');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const availabilitySchema = Joi.object({
  availability: Joi.number().integer().min(0).max(50).required()
});

router.get('/admin', ensureAdmin, (req, res) => {
  const rooms = listRoomTypes();
  const bookings = listBookings().map((booking) => ({
    ...booking,
    payment: getPaymentByBookingId(booking.id)
  }));
  res.render('admin/index', {
    pageTitle: 'Admin Control Deck',
    rooms,
    bookings,
    amenities: listAmenities(),
    inquiries: getAllInquiries()
  });
});

router.post('/admin/rooms/:id', ensureAdmin, (req, res) => {
  const payload = {
    availability: Number.parseInt(sanitizeString(req.body.availability), 10)
  };
  const { error, value } = availabilitySchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid availability value supplied.');
    return res.redirect('/admin');
  }
  const room = setRoomAvailability(sanitizeString(req.params.id), value.availability);
  if (!room) {
    req.pushAlert('danger', 'Room not found.');
    return res.redirect('/admin');
  }
  req.pushAlert('success', `Availability for ${room.name} updated to ${room.availability}.`);
  return res.redirect('/admin');
});

module.exports = router;
