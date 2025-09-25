const Joi = require('joi');
const { sanitizeString } = require('./sanitize');

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

const bookingStepSchemas = {
  dates: Joi.object({
    checkIn: Joi.string().pattern(DATE_FORMAT).required(),
    checkOut: Joi.string()
      .pattern(DATE_FORMAT)
      .required()
      .custom((value, helpers) => {
        if (value <= helpers.state.ancestors[0].checkIn) {
          return helpers.error('date.order');
        }
        return value;
      }, 'date order validation')
  }).messages({ 'date.order': 'Checkout must be after check-in.' }),
  room: Joi.object({
    roomTypeId: Joi.string().uuid({ version: 'uuidv4' }).required()
  }),
  guests: Joi.object({
    guests: Joi.number().integer().min(1).max(8).required(),
    addOns: Joi.array().items(Joi.string()).default([])
  }),
  confirm: Joi.object({
    agree: Joi.boolean().valid(true).required()
  }),
  payment: Joi.object({
    cardholder: Joi.string().min(2).max(80).required(),
    cardNumber: Joi.string().min(12).max(19).required(),
    expiry: Joi.string()
      .pattern(/^(0[1-9]|1[0-2])\/(\d{2})$/)
      .required(),
    cvc: Joi.string().pattern(/^\d{3,4}$/).required()
  })
};

function sanitizeBookingStep(step, payload = {}) {
  switch (step) {
    case 'dates':
      return {
        checkIn: sanitizeString(payload.checkIn),
        checkOut: sanitizeString(payload.checkOut)
      };
    case 'room':
      return {
        roomTypeId: sanitizeString(payload.roomTypeId)
      };
    case 'guests':
      return {
        guests: Number.parseInt(payload.guests, 10) || 1,
        addOns: Array.isArray(payload.addOns)
          ? payload.addOns.map((item) => sanitizeString(item))
          : payload.addOns
          ? [sanitizeString(payload.addOns)]
          : []
      };
    case 'confirm':
      return { agree: payload.agree === 'on' || payload.agree === true };
    case 'payment':
      return {
        cardholder: sanitizeString(payload.cardholder),
        cardNumber: sanitizeString(payload.cardNumber).replace(/\s+/g, ''),
        expiry: sanitizeString(payload.expiry),
        cvc: sanitizeString(payload.cvc)
      };
    default:
      return payload;
  }
}

function validateBookingStep(step, payload) {
  const schema = bookingStepSchemas[step];
  if (!schema) {
    return { value: payload };
  }
  return schema.validate(payload, { abortEarly: false, convert: true });
}

function calculateStaySummary(room, checkIn, checkOut, addOns = []) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const nights = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  const base = room.pricePerNight * nights;
  const addOnDetails = room.addOns.filter((addon) => addOns.includes(addon.id));
  const addOnTotal = addOnDetails.reduce((total, addon) => total + addon.price, 0);
  const subtotal = base + addOnTotal;
  const taxes = Math.round(subtotal * 0.12 * 100) / 100;
  const fees = Math.round(subtotal * 0.05 * 100) / 100;
  const total = Math.round((subtotal + taxes + fees) * 100) / 100;
  return {
    nights,
    base,
    addOnDetails,
    addOnTotal,
    subtotal,
    taxes,
    fees,
    total
  };
}

function luhnCheck(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

module.exports = {
  bookingStepSchemas,
  sanitizeBookingStep,
  validateBookingStep,
  calculateStaySummary,
  luhnCheck
};
