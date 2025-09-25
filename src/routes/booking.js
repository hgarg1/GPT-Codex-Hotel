const express = require('express');
const { bookingSchema, sanitizeBookingPayload, finaliseBooking } = require('../utils/booking');

const router = express.Router();

// Booking endpoint handles anonymous intent capture and authenticated confirmation.
router.post('/book', (req, res) => {
  const sanitized = sanitizeBookingPayload(req.body);
  const { error, value } = bookingSchema.validate(sanitized, { abortEarly: false, convert: true });
  if (error) {
    req.pushAlert('danger', 'We could not complete your booking. Please review your selections.');
    const fallback = req.get('referer') || '/rooms';
    return res.redirect(fallback);
  }

  const preparedBooking = {
    ...value,
    startDate: value.startDate.toISOString(),
    endDate: value.endDate.toISOString()
  };

  if (!req.user) {
    req.session.pendingBooking = preparedBooking;
    req.pushAlert('info', 'Log in or create an account to confirm your Aurora Nexus Skyhaven stay.');
    return res.redirect('/login');
  }

  try {
    const booking = finaliseBooking(preparedBooking, req.user.id);
    req.pushAlert('success', `Booking confirmed for ${booking.roomName}. We cannot wait to welcome you.`);
    return res.redirect('/dashboard');
  } catch (bookingError) {
    req.pushAlert('danger', bookingError.message);
    const fallback = req.get('referer') || '/rooms';
    return res.redirect(fallback);
  }
});

module.exports = router;
