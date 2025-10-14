const express = require('express');
const { ensureEmployeePortal } = require('../middleware/auth');
const { getProfile, listRequestsForEmployee } = require('../models/employeeRequests');
const { getOpenEntryForEmployee, listEntriesForEmployee } = require('../models/timeEntries');

const router = express.Router();

router.get('/', ensureEmployeePortal, (req, res) => {
  const profile = getProfile(req.user.id);
  const openShift = getOpenEntryForEmployee(req.user.id);
  const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const recentEntries = listEntriesForEmployee(req.user.id, { start: lookbackStart });
  const requests = listRequestsForEmployee(req.user.id).slice(0, 5);
  res.render('employee/index', {
    pageTitle: 'Employee Portal',
    profile,
    openShift,
    recentEntries,
    requests
  });
});

module.exports = router;
