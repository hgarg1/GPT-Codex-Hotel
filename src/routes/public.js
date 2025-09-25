const express = require('express');
const Joi = require('joi');
const { listRoomTypes } = require('../models/rooms');
const { listAmenities } = require('../models/amenities');
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
  res.render('contact', {
    pageTitle: 'Contact Aurora Nexus Skyhaven'
  });
});

router.get('/leadership', (req, res) => {
  res.render('leadership', {
    pageTitle: 'Leadership & Visionaries',
    boardMembers: [
      {
        name: 'Dr. Selene Kaori',
        role: 'Chair, Board of Directors',
        focus: 'Guiding interstellar expansion and ethical hospitality.',
        contact: 'selene.kaori@auroranexus.com'
      },
      {
        name: 'Adrian Volkov',
        role: 'Director of Galactic Partnerships',
        focus: 'Cultivating alliances with orbital authorities and ports of call.',
        contact: 'avolkov@auroranexus.com'
      },
      {
        name: 'Evelyn Singh',
        role: 'Director of Sustainability',
        focus: 'Ensuring zero-waste operations across every stratospheric hub.',
        contact: 'e.singh@auroranexus.com'
      }
    ],
    executiveTeam: [
      {
        name: 'Harshit Garg',
        role: 'Chief Experience Officer',
        focus: 'Architecting guest journeys that feel telepathic.',
        contact: 'hgarg@auroranexus.com'
      },
      {
        name: 'Nova Ortega',
        role: 'General Manager',
        focus: 'Operational excellence from lobby drones to orbit shuttles.',
        contact: 'nova.ortega@auroranexus.com'
      },
      {
        name: 'Ilya Rosenthal',
        role: 'Director of Concierge Intelligence',
        focus: 'Orchestrating the live chat concierges and predictive care.',
        contact: 'ilya.rosenthal@auroranexus.com'
      }
    ],
    advisoryCouncil: [
      {
        name: 'Professor Amara Qadir',
        role: 'Spatial Design Advisor',
        focus: 'Crafting biophilic suites with zero-gravity comfort.',
        contact: 'amara.qadir@auroranexus.com'
      },
      {
        name: 'Captain Idris Vale',
        role: 'Orbital Logistics Advisor',
        focus: 'Synchronising docking windows and arrival flotillas.',
        contact: 'idris.vale@auroranexus.com'
      }
    ]
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
