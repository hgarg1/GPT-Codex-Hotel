const express = require('express');
const Joi = require('joi');
const { listRoomTypes } = require('../models/rooms');
const { listAmenities } = require('../models/amenities');
const { addInquiry } = require('../models/inquiries');
const { sanitizeString } = require('../utils/sanitize');
const { boardMembers, executiveTeam, advisoryCouncil } = require('../data/leadership');

const router = express.Router();

const contactSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  message: Joi.string().min(10).max(1000).required()
});

function mapContactErrors(details = []) {
  return details.reduce((acc, detail) => {
    const field = detail.path?.[0];
    if (!field || acc[field]) {
      return acc;
    }

    const type = detail.type;
    let message;

    if (field === 'name') {
      if (type === 'string.empty' || type === 'any.required') {
        message = 'Please share your name so our concierge knows who to reach.';
      } else if (type === 'string.min') {
        message = 'Name must include at least 2 characters.';
      } else if (type === 'string.max') {
        message = 'Name cannot exceed 80 characters.';
      }
    } else if (field === 'email') {
      if (type === 'string.empty' || type === 'any.required') {
        message = 'An email address is required for a response.';
      } else if (type === 'string.email') {
        message = 'Please provide a valid email address.';
      }
    } else if (field === 'message') {
      if (type === 'string.empty' || type === 'any.required') {
        message = 'Let us know how we can assist you.';
      } else if (type === 'string.min') {
        message = 'Message must contain at least 10 characters.';
      } else if (type === 'string.max') {
        message = 'Message cannot exceed 1000 characters.';
      }
    }

    acc[field] = message || detail.message;
    return acc;
  }, {});
}

// Futuristic landing sequence showcasing hero highlights.
router.get('/', (req, res) => {
  const rooms = listRoomTypes();
  const amenities = listAmenities();
  res.render('home', {
    pageTitle: 'Experience the Future of Hospitality',
    featuredRooms: rooms.slice(0, 3),
    featuredAmenities: amenities.slice(0, 4),
    testimonials: [
      {
        name: 'Nova Lin',
        quote: 'The Sky Spa felt like floating through the aurora. Every detail was predictive and personal.'
      },
      {
        name: 'Juno Aki',
        quote: 'From booking to payment, every interaction was seamless. The lobby chat concierge responded instantly.'
      },
      {
        name: 'Mira Sol',
        quote: 'Our Gravity Well Villa was a dreamscape. The VR lounge reservation completed the stay.'
      }
    ]
  });
});

router.get('/about', (req, res) => {
  res.render('about', {
    pageTitle: 'Our Story',
    innovations: [
      'Zero-lag concierge AI harmonising with your biometrics',
      'Sustainable orbital energy grid powering the resort',
      'Immersive suites with holo-sculpted panoramas',
      'Personalised dining curated by flavour algorithms'
    ]
  });
});

router.get('/rooms', (req, res) => {
  const rooms = listRoomTypes();
  res.render('rooms', {
    pageTitle: 'Suites & Pods',
    rooms
  });
});

router.get('/contact', (req, res) => {
  const formState = req.session.contactForm || {};
  const formValues = formState.values || {};
  const formErrors = formState.errors || {};
  delete req.session.contactForm;

  res.render('contact', {
    pageTitle: 'Contact Aurora Nexus Skyhaven',
    formValues,
    formErrors
  });
});

router.get('/leadership', (req, res) => {
  res.render('leadership', {
    pageTitle: 'Leadership & Visionaries',
    boardMembers,
    executiveTeam,
    advisoryCouncil
  });
});

// Securely capture contact transmissions for the concierge team.
router.post('/contact', (req, res) => {
  const payload = {
    name: sanitizeString(req.body.name),
    email: sanitizeString(req.body.email),
    message: sanitizeString(req.body.message)
  };
  const { error, value } = contactSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.session.contactForm = {
      values: payload,
      errors: mapContactErrors(error.details)
    };
    req.pushAlert('danger', 'We could not send your transmission. Please verify the highlighted fields.');
    return res.redirect('/contact');
  }
  delete req.session.contactForm;
  const inquiry = addInquiry(value);
  const io = req.app.get('io');
  if (io) {
    io.to('admin:inquiries').emit('inquiry:new', inquiry);
  }
  req.pushAlert('success', 'Your message has entered the Skyhaven relay. Our curators will respond shortly.');
  return res.redirect('/contact');
});

// Persist theme toggle in the visitor session for dark/light mode.
router.post('/toggle-theme', (req, res) => {
  const current = req.session.darkMode ?? true;
  req.session.darkMode = !current;
  return res.json({
    ok: true,
    darkMode: req.session.darkMode
  });
});

module.exports = router;
