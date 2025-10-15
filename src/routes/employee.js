const express = require('express');
const { ensureEmployeePortal } = require('../middleware/auth');
const { getProfile, listRequestsForEmployee } = require('../models/employeeRequests');
const { getOpenEntryForEmployee, listEntriesForEmployee } = require('../models/timeEntries');

const router = express.Router();

function formatDuration(minutes) {
  if (!minutes) {
    return '0m';
  }
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (!hours) {
    return `${mins}m`;
  }
  if (!mins) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

router.get('/', ensureEmployeePortal, (req, res) => {
  const profile = getProfile(req.user.id);
  const openShift = getOpenEntryForEmployee(req.user.id);
  const lookbackStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const recentEntries = listEntriesForEmployee(req.user.id, { start: lookbackStart });
  const requests = listRequestsForEmployee(req.user.id).slice(0, 5);
  const totalMinutes = recentEntries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
  const completedShifts = recentEntries.filter((entry) => entry.durationMinutes).length;
  const pendingRequests = requests.filter((item) => (item.status || '').toLowerCase() === 'pending').length;
  const hoursTarget = 14 * 8 * 60; // Two-week, eight-hour shifts
  const lastShift = recentEntries.find((entry) => entry.durationMinutes) || null;
  const lastShiftStart = recentEntries[0] || null;
  const profileFields = [
    'addressLine1',
    'city',
    'state',
    'postalCode',
    'emergencyContactName',
    'emergencyContactPhone',
    'emergencyContactRelationship'
  ];
  const filledProfileFields = profileFields.reduce((count, key) => {
    const value = profile?.[key];
    return value && String(value).trim().length ? count + 1 : count;
  }, 0);
  const profilePercent = profileFields.length
    ? Math.min(100, Math.round((filledProfileFields / profileFields.length) * 100))
    : 0;
  const profileMissing = Math.max(0, profileFields.length - filledProfileFields);
  const shiftMeta = openShift
    ? `Clocked in ${openShift.clockInAt ? new Date(openShift.clockInAt).toLocaleTimeString() : 'recently'}`
    : lastShiftStart
    ? `Last shift started ${new Date(lastShiftStart.clockInAt).toLocaleString()}`
    : 'No shifts logged during this window yet.';
  const insights = {
    shift: {
      label: openShift ? 'On duty' : 'Off duty',
      meta: shiftMeta,
      fallbackMeta: lastShiftStart
        ? `Last shift started ${new Date(lastShiftStart.clockInAt).toLocaleString()}`
        : 'Clock in to start tracking your hours.',
      cta: openShift ? 'Clock out when you wrap up to sync payroll.' : 'Clock in to start your next shift.'
    },
    hours: {
      minutes: totalMinutes,
      formatted: formatDuration(totalMinutes),
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      meta: completedShifts
        ? `${completedShifts} completed shift${completedShifts === 1 ? '' : 's'} this period`
        : 'No completed shifts yet this period.',
      progress: hoursTarget ? Math.min(100, Math.round((totalMinutes / hoursTarget) * 100)) : 0,
      targetMinutes: hoursTarget
    },
    requests: {
      pending: pendingRequests,
      total: requests.length,
      meta: pendingRequests
        ? `${pendingRequests} awaiting review`
        : requests.length
        ? 'All requests resolved'
        : 'No requests submitted'
    },
    profile: {
      percent: profilePercent,
      missing: profileMissing,
      meta: profileMissing
        ? `${profileMissing} detail${profileMissing === 1 ? '' : 's'} left for full coverage`
        : 'Profile complete'
    },
    lastCompletedShift: lastShift
      ? {
          endedAt: lastShift.clockOutAt ? new Date(lastShift.clockOutAt).toLocaleString() : null,
          durationLabel: lastShift.durationMinutes ? formatDuration(lastShift.durationMinutes) : null
        }
      : null
  };
  res.render('employee/index', {
    pageTitle: 'Employee Portal',
    profile,
    openShift,
    recentEntries,
    requests,
    insights
  });
});

module.exports = router;
