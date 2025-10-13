const express = require('express');
const { ensureDiningAuthenticated, getUserFromRequest } = require('../utils/jwt');
const {
  initModels,
  getMenuByCourse,
  listLeadership,
  listStaff,
  listReservationsForUser
} = require('../services/diningService');
const { lockSeat, releaseSeat, getCurrentSeats } = require('../services/diningSeatLocks');

const router = express.Router();

router.use(async (req, res, next) => {
  await initModels();
  res.locals.layout = 'dining';
  res.locals.diningBrand = {
    palette: {
      background: '#05070F',
      surface: '#101424',
      accent: '#CFA858'
    },
    name: 'Skyhaven Supper Club'
  };
  res.locals.diningUser = getUserFromRequest(req);
  next();
});

router.get('/dining', (req, res) => {
  res.render('dining/landing', {
    title: 'Skyhaven Supper Club',
    highlights: [
      {
        title: 'Chef\'s Tasting',
        body: 'A seven-course symphony with live plating theatrics.',
        background: 'linear-gradient(135deg, rgba(207,168,88,0.6), rgba(92,132,255,0.4))'
      },
      {
        title: 'Cellar Pairings',
        body: 'Rare allocations curated by our Master Sommelier.',
        background: 'linear-gradient(135deg, rgba(126,188,255,0.5), rgba(28,52,96,0.8))'
      },
      {
        title: 'Midnight Desserts',
        body: 'Progressive pastry showcase lit by aurora-inspired projections.',
        background: 'linear-gradient(135deg, rgba(212,36,78,0.4), rgba(12,20,40,0.95))'
      }
    ]
  });
});

router.get('/dining/menu', async (req, res) => {
  const { dietary, spice, priceRange } = req.query;
  const filters = { dietary, spice, priceRange };
  const menu = await getMenuByCourse(filters);
  res.render('dining/menu', {
    title: 'Supper Club Menu',
    menu,
    filters
  });
});

router.get('/dining/reserve', ensureDiningAuthenticated, (req, res) => {
  res.render('dining/reserve', {
    title: 'Reserve Your Evening',
    step: 'schedule'
  });
});

router.post('/dining/reserve/seat-lock', ensureDiningAuthenticated, async (req, res) => {
  const { seatId } = req.body;
  const user = req.diningUser;
  if (!seatId) {
    return res.status(400).json({ error: 'Seat selection missing.' });
  }
  const lock = await lockSeat(seatId, user.id);
  if (!lock.ok) {
    return res.status(409).json({ error: lock.error || 'Seat unavailable.' });
  }
  return res.json(lock);
});

router.post('/dining/reserve/seat-release', ensureDiningAuthenticated, async (req, res) => {
  const { seatId, lockId } = req.body;
  if (!seatId || !lockId) {
    return res.status(400).json({ error: 'Seat and lock required.' });
  }
  const result = await releaseSeat(seatId, lockId);
  if (!result.ok) {
    return res.status(404).json({ error: 'Seat lock not found.' });
  }
  return res.json({ ok: true });
});

router.get('/dining/map', ensureDiningAuthenticated, (req, res) => {
  const seats = getCurrentSeats();
  if (req.get('x-requested-with') === 'XMLHttpRequest') {
    return res.json({ seats });
  }
  res.render('dining/map', {
    title: 'Seat Map',
    seats
  });
});

router.get('/dining/leadership', (req, res) => {
  const leaders = listLeadership();
  res.render('dining/leadership', {
    title: 'Meet the Culinary Collective',
    leaders
  });
});

router.get('/dining/staff', (req, res) => {
  const staff = listStaff();
  res.render('dining/staff', {
    title: 'Our Team',
    staff
  });
});

router.get('/dining/account/reservations', ensureDiningAuthenticated, (req, res) => {
  const reservations = listReservationsForUser(req.diningUser?.id);
  res.render('dining/account', {
    title: 'Dining Reservations',
    reservations
  });
});

router.get('/dining/login', (req, res) => {
  const redirect = encodeURIComponent(req.query.redirect || '/dining');
  res.redirect(`/login?redirect=${redirect}`);
});

router.get('/dining/join', (req, res) => {
  const redirect = encodeURIComponent(req.query.redirect || '/dining');
  res.redirect(`/join?redirect=${redirect}`);
});

module.exports = router;
