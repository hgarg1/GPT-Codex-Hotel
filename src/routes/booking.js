const express = require('express');
const { sanitizeBookingStep, validateBookingStep, calculateStaySummary } = require('../utils/booking');
const { sanitizeString } = require('../utils/sanitize');
const { listRoomTypes, getRoomById, adjustRoomAvailability } = require('../models/rooms');
const { createBooking } = require('../models/bookings');

const router = express.Router();

const wizardSteps = ['dates', 'room', 'guests', 'review'];

function ensureWizard(req) {
  if (!req.session.bookingWizard) {
    req.session.bookingWizard = {};
  }
  return req.session.bookingWizard;
}

function resolveStep(step) {
  return wizardSteps.includes(step) ? step : 'dates';
}

function enforcePrerequisites(step, wizard) {
  switch (step) {
    case 'room':
      return wizard.checkIn && wizard.checkOut;
    case 'guests':
      return wizard.roomTypeId;
    case 'review':
      return wizard.guests && wizard.roomTypeId;
    default:
      return true;
  }
}

router.get('/book', (req, res) => {
  const wizard = ensureWizard(req);
  if (req.query.room) {
    const room = getRoomById(sanitizeString(req.query.room));
    if (room) {
      wizard.roomTypeId = room.id;
    }
  }
  const step = resolveStep(req.query.step);
  if (!enforcePrerequisites(step, wizard)) {
    return res.redirect('/book?step=dates');
  }

  if (step === 'review' && !req.user) {
    req.session.returnTo = '/book?step=review';
    req.pushAlert('info', 'Log in to complete your reservation.');
    return res.redirect('/login');
  }

  const rooms = listRoomTypes();
  const selectedRoom = wizard.roomTypeId ? getRoomById(wizard.roomTypeId) : null;
  let summary = null;
  if (step === 'review' && selectedRoom) {
    summary = calculateStaySummary(
      selectedRoom,
      wizard.checkIn,
      wizard.checkOut,
      wizard.addOns || []
    );
  }

  res.render('booking/wizard', {
    pageTitle: 'Book Your Stay',
    step,
    rooms,
    wizard,
    selectedRoom,
    summary
  });
});

router.post('/book', (req, res) => {
  const step = resolveStep(req.body.step);
  const wizard = ensureWizard(req);
  if (!enforcePrerequisites(step, wizard)) {
    req.pushAlert('warning', 'Please follow the booking steps in order.');
    return res.redirect('/book?step=dates');
  }

  const sanitized = sanitizeBookingStep(step, req.body);
  const { error, value } = validateBookingStep(step, sanitized);
  if (error) {
    req.pushAlert('danger', 'Please review the highlighted fields and try again.');
    return res.redirect(`/book?step=${step}`);
  }

  if (step === 'dates') {
    wizard.checkIn = value.checkIn;
    wizard.checkOut = value.checkOut;
    delete wizard.roomTypeId;
    delete wizard.guests;
    delete wizard.addOns;
    return res.redirect('/book?step=room');
  }

  if (step === 'room') {
    const room = getRoomById(value.roomTypeId);
    if (!room) {
      req.pushAlert('danger', 'Selected suite could not be located.');
      return res.redirect('/book?step=room');
    }
    wizard.roomTypeId = value.roomTypeId;
    return res.redirect('/book?step=guests');
  }

  if (step === 'guests') {
    const room = wizard.roomTypeId ? getRoomById(wizard.roomTypeId) : null;
    if (!room) {
      req.pushAlert('danger', 'Please choose a suite to continue.');
      return res.redirect('/book?step=room');
    }
    if (value.guests > room.capacity) {
      req.pushAlert('danger', 'Guest count exceeds the capacity for this suite.');
      return res.redirect('/book?step=guests');
    }
    wizard.guests = value.guests;
    wizard.addOns = value.addOns || [];
    return res.redirect('/book?step=review');
  }

  if (step === 'review') {
    const room = wizard.roomTypeId ? getRoomById(wizard.roomTypeId) : null;
    if (!room) {
      req.pushAlert('danger', 'Please choose a suite to continue.');
      return res.redirect('/book?step=room');
    }
    if (!req.user) {
      req.session.returnTo = '/book?step=review';
      req.pushAlert('info', 'Log in to finalise your booking.');
      return res.redirect('/login');
    }
    if (room.availability <= 0) {
      req.pushAlert('danger', 'This suite is no longer available for the selected dates.');
      return res.redirect('/book?step=room');
    }

    const summary = calculateStaySummary(
      room,
      wizard.checkIn,
      wizard.checkOut,
      wizard.addOns || []
    );
    const booking = createBooking({
      userId: req.user.id,
      roomTypeId: room.id,
      checkIn: new Date(wizard.checkIn).toISOString(),
      checkOut: new Date(wizard.checkOut).toISOString(),
      guests: wizard.guests,
      addOns: wizard.addOns || [],
      total: summary.total,
      taxes: summary.taxes,
      fees: summary.fees,
      status: 'PendingPayment'
    });
    adjustRoomAvailability(room.id, -1);
    req.session.bookingWizard = null;
    req.session.pendingPaymentBookingId = booking.id;
    return res.redirect(`/pay/${booking.id}`);
  }

  return res.redirect('/book');
});

module.exports = router;
