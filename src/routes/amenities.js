const express = require('express');
const Joi = require('joi');
const { ensureAuthenticated } = require('../middleware/auth');
const {
  listAmenities,
  getAmenityBySlug,
  createAmenityReservation,
  listReservationsByAmenityAndSlot
} = require('../models/amenities');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const reservationSchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  durationMinutes: Joi.number().integer().min(30).max(240).default(60)
});

function parseTimeslot(date, startTime, durationMinutes) {
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

router.get('/amenities', (req, res) => {
  const amenities = listAmenities();
  res.render('amenities/index', {
    pageTitle: 'Futuristic Amenities',
    amenities
  });
});

router.get('/amenities/:slug', (req, res, next) => {
  const amenity = getAmenityBySlug(sanitizeString(req.params.slug));
  if (!amenity) {
    return next();
  }
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 1);
  res.render('amenities/detail', {
    pageTitle: amenity.name,
    amenity,
    defaultDate: defaultDate.toISOString().slice(0, 10)
  });
});

router.post('/amenities/:slug/reserve', ensureAuthenticated, (req, res) => {
  const slug = sanitizeString(req.params.slug);
  const amenity = getAmenityBySlug(slug);
  if (!amenity) {
    req.pushAlert('danger', 'Amenity not found.');
    return res.redirect('/amenities');
  }
  const payload = {
    date: sanitizeString(req.body.date),
    startTime: sanitizeString(req.body.startTime),
    durationMinutes: Number.parseInt(req.body.durationMinutes, 10) || 60
  };
  const { error, value } = reservationSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Please verify the requested timeslot.');
    return res.redirect(`/amenities/${slug}`);
  }

  const { start, end } = parseTimeslot(value.date, value.startTime, value.durationMinutes);
  const existing = listReservationsByAmenityAndSlot(amenity.id, start, end);
  const status = amenity.capacity && existing.length >= amenity.capacity ? 'waitlist' : 'reserved';
  createAmenityReservation({
    amenityId: amenity.id,
    userId: req.user.id,
    timeslotStart: start,
    timeslotEnd: end,
    status
  });
  const message =
    status === 'reserved'
      ? 'Your timeslot has been reserved. See you soon in the future wing.'
      : 'Capacity reached—added to the waitlist. We will notify you upon availability.';
  req.pushAlert('success', message);
  return res.redirect(`/amenities/${slug}`);
});

module.exports = router;
