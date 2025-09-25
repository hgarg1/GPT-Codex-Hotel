const Joi = require('joi');
const { createBooking } = require('../models/bookings');
const { getRoomById, adjustRoomAvailability } = require('../models/rooms');
const { sanitizeString } = require('./sanitize');

// Schema governing booking payload validation.
const bookingSchema = Joi.object({
  roomId: Joi.string().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
  guests: Joi.number().integer().min(1).max(8).required(),
  notes: Joi.string().allow('').max(500)
});

// Convert form submission to a predictable, sanitised shape.
function sanitizeBookingPayload(payload = {}) {
  return {
    roomId: sanitizeString(payload.roomId),
    startDate: sanitizeString(payload.startDate),
    endDate: sanitizeString(payload.endDate),
    guests: Number.parseInt(payload.guests, 10) || 1,
    notes: sanitizeString(payload.notes)
  };
}

// Persist a booking and adjust inventory, throwing on invalid state.
function finaliseBooking(validatedBooking, userId) {
  const room = getRoomById(validatedBooking.roomId);
  if (!room) {
    const error = new Error('Selected room could not be located.');
    error.status = 400;
    throw error;
  }

  if (room.availableUnits <= 0) {
    const error = new Error('The selected room is no longer available for the chosen dates.');
    error.status = 409;
    throw error;
  }

  if (validatedBooking.guests > room.capacity) {
    const error = new Error('Guest count exceeds the capacity of this suite.');
    error.status = 400;
    throw error;
  }

  const start = new Date(validatedBooking.startDate);
  const end = new Date(validatedBooking.endDate);
  const millisecondsPerNight = 1000 * 60 * 60 * 24;
  const nights = Math.max(1, Math.ceil((end - start) / millisecondsPerNight));
  const totalCost = nights * room.price;

  adjustRoomAvailability(room.id, -1);

  return createBooking({
    userId,
    roomId: room.id,
    roomName: room.name,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    guests: validatedBooking.guests,
    totalCost,
    nights,
    notes: validatedBooking.notes
  });
}

module.exports = {
  bookingSchema,
  sanitizeBookingPayload,
  finaliseBooking
};
