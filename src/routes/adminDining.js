const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const { listStaff } = require('../services/diningService');
const { getCurrentSeats } = require('../services/diningSeatLocks');

const router = express.Router();

router.use('/admin/dining', ensureAdmin);

router.get('/admin/dining', (req, res) => {
  res.render('dining/admin/dashboard', {
    title: 'Dining Control Center',
    seats: getCurrentSeats(),
    staff: listStaff()
  });
});

router.get('/admin/dining/menu', (req, res) => {
  res.render('dining/admin/menu', {
    title: 'Menu Manager'
  });
});

router.get('/admin/dining/reports', (req, res) => {
  res.render('dining/admin/reports', {
    title: 'Dining Reports'
  });
});

module.exports = router;
