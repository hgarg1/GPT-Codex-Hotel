const express = require('express');
const Joi = require('joi');
const { getAllRooms } = require('../models/rooms');
const { addInquiry } = require('../models/inquiries');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

const contactSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  message: Joi.string().min(10).max(1000).required()
});

// Futuristic landing sequence showcasing hero highlights.
router.get('/', (req, res) => {
  const rooms = getAllRooms();
  const highlights = rooms.slice(0, 3);
  res.render('home', {
    pageTitle: 'Experience the Future of Hospitality',
    highlights,
    amenities: [
      'Neural concierge attuned to your preferences',
      'Levitation spa circuit and chrono recovery pools',
      'Quantum-secure workspace capsules',
      'Panoramic orbit lounges with adaptive climate control'
    ]
  });
});

router.get('/about', (req, res) => {
  res.render('about', {
    pageTitle: 'Our Story',
    innovations: [
      'Zero-lag concierge AI that harmonises with your biometrics',
      'Sustainable orbital energy grid powering the entire resort',
      'Immersive suites with holo-sculpted panoramas',
      'Personalised dining curated by flavour algorithms'
    ]
  });
});

router.get('/rooms', (req, res) => {
  const rooms = getAllRooms();
  const grouped = rooms.reduce((collection, room) => {
    const key = room.category;
    if (!collection[key]) {
      collection[key] = [];
    }
    collection[key].push(room);
    return collection;
  }, {});
  res.render('rooms', {
    pageTitle: 'Suites & Pods',
    groupedRooms: grouped
  });
});

router.get('/dining', (req, res) => {
  res.render('dining', {
    pageTitle: 'Dining & Facilities',
    culinaryJourneys: [
      {
        name: 'Nebula Tasting Lab',
        description: 'Multi-sensory tasting flights where cuisine harmonises with projected auroras and soundscapes.'
      },
      {
        name: 'Gravity Garden Atrium',
        description: 'Floating herb spheres infuse dishes tableside while you dine among levitating botanicals.'
      },
      {
        name: 'Quantum Mixology Vault',
        description: 'Signature cocktails crafted by AI sommeliers with luminescent infusions and aroma coding.'
      }
    ],
    facilities: [
      'Chrono spa with hydro-levitation therapy',
      'Skydeck infinity pool with anti-grav lounge',
      'Orbital theatre for immersive concerts',
      'Stellar gymnasium with holographic trainers'
    ]
  });
});

router.get('/contact', (req, res) => {
  res.render('contact', {
    pageTitle: 'Contact Aurora Nexus Skyhaven'
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
    req.pushAlert('danger', 'We could not send your transmission. Please verify the highlighted fields.');
    return res.redirect('/contact');
  }
  addInquiry(value);
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
