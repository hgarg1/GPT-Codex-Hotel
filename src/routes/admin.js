const express = require('express');
const Joi = require('joi');
const { ensureAdmin } = require('../middleware/auth');
const { Roles, normalizeRole } = require('../utils/rbac');
const { listBookings, updateBookingStatus, getBookingById } = require('../models/bookings');
const { listRoomTypes, setRoomAvailability } = require('../models/rooms');
const {
  listAmenities,
  listAllAmenityReservations,
  updateAmenityReservationStatus
} = require('../models/amenities');
const { getPaymentByBookingId } = require('../models/payments');
const { getAllInquiries, getInquiryById, updateInquiryStatus } = require('../models/inquiries');
const { sanitizeString } = require('../utils/sanitize');
const { listStaff: listDiningStaff } = require('../services/diningService');
const { getCurrentSeats } = require('../services/diningSeatLocks');
const { listEntries } = require('../models/timeEntries');
const { listAllRequests } = require('../models/employeeRequests');
const { getUserById } = require('../models/users');

const router = express.Router();

const availabilitySchema = Joi.object({
  availability: Joi.number().integer().min(0).max(50).required()
});

const bookingStatusSchema = Joi.object({
  status: Joi.string().valid('Reserved', 'PendingPayment', 'Paid', 'Canceled').required()
});

const reservationStatusSchema = Joi.object({
  status: Joi.string().valid('reserved', 'waitlist', 'cancelled').required()
});

const inquiryStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'resolved').required()
});

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDuration(start, end) {
  const diffMinutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelativeTime(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '—';
  }
  const diffMs = date.getTime() - now.getTime();
  const units = [
    { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
    { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
    { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
    { unit: 'day', ms: 1000 * 60 * 60 * 24 },
    { unit: 'hour', ms: 1000 * 60 * 60 },
    { unit: 'minute', ms: 1000 * 60 },
    { unit: 'second', ms: 1000 }
  ];
  for (const { unit, ms } of units) {
    if (Math.abs(diffMs) >= ms || unit === 'second') {
      return relativeTimeFormatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return '—';
}

router.get('/admin', ensureAdmin, (req, res) => {
  const actorRole = normalizeRole(req.user?.role);
  const allowedSubAdminRoles =
    actorRole === Roles.GLOBAL_ADMIN
      ? [Roles.SUPER_ADMIN, Roles.ADMIN]
      : actorRole === Roles.SUPER_ADMIN
        ? [Roles.ADMIN]
        : [];

  const rooms = listRoomTypes();
  const amenities = listAmenities();
  const inquiriesRaw = getAllInquiries();
  const inquiries = inquiriesRaw.map((inquiry) => ({
    ...inquiry,
    status: inquiry.status || 'open'
  }));
  const bookings = listBookings().map((booking) => {
    const payment = getPaymentByBookingId(booking.id);
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);
    const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / DAY_MS));
    const leadTime = Math.max(0, Math.round((checkInDate - new Date(booking.createdAt)) / DAY_MS));
    return {
      ...booking,
      payment,
      nights,
      leadTime,
      checkInLabel: checkInDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      checkOutLabel: checkOutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  });

  const activeBookings = bookings.filter((booking) => booking.status !== 'Canceled');
  const paidBookings = bookings.filter((booking) => booking.status === 'Paid');
  const pendingPayments = bookings.filter((booking) => booking.status === 'PendingPayment').length;
  const totalRevenue = paidBookings.reduce((sum, booking) => sum + booking.total, 0);

  const availabilitySnapshot = rooms.reduce((sum, room) => sum + room.availability, 0);
  const utilisationRate =
    availabilitySnapshot + activeBookings.length > 0
      ? Math.round((activeBookings.length / (availabilitySnapshot + activeBookings.length)) * 100)
      : 0;
  const averageStayLength =
    activeBookings.length > 0
      ? activeBookings.reduce((sum, booking) => sum + booking.nights, 0) / activeBookings.length
      : 0;
  const averageLeadTime =
    activeBookings.length > 0
      ? activeBookings.reduce((sum, booking) => sum + booking.leadTime, 0) / activeBookings.length
      : 0;
  const lowInventoryRooms = rooms.filter((room) => room.availability <= 3);
  const openInquiries = inquiries.filter((inquiry) => inquiry.status !== 'resolved').length;

  const metrics = [
    {
      label: 'Total captured revenue',
      value: formatCurrency(totalRevenue),
      detail: `${paidBookings.length} paid bookings`
    },
    {
      label: 'Inventory utilisation',
      value: `${utilisationRate}%`,
      detail: `${lowInventoryRooms.length} suites below threshold`
    },
    {
      label: 'Average stay length',
      value: `${averageStayLength > 0 ? averageStayLength.toFixed(1) : '0.0'} nights`,
      detail: `Lead time avg ${Math.round(averageLeadTime)} days`
    },
    {
      label: 'Attention queue',
      value: `${pendingPayments} pending`,
      detail: `${openInquiries} open inquiries`
    }
  ];

  const statusBreakdown = ['Reserved', 'PendingPayment', 'Paid', 'Canceled'].map((status) => ({
    status,
    count: bookings.filter((booking) => booking.status === status).length
  }));

  const now = new Date();
  const upcomingWindow = new Date(now.getTime() + 7 * DAY_MS);

  const upcomingCheckIns = bookings
    .filter((booking) => booking.status !== 'Canceled')
    .filter((booking) => {
      const checkInDate = new Date(booking.checkIn);
      return checkInDate >= now && checkInDate <= upcomingWindow;
    })
    .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))
    .slice(0, 5)
    .map((booking) => ({
      ...booking,
      windowLabel: `${booking.checkInLabel} → ${booking.checkOutLabel}`,
      daysUntil: Math.max(0, Math.round((new Date(booking.checkIn) - now) / DAY_MS))
    }));

  const upcomingCheckOuts = bookings
    .filter((booking) => booking.status === 'Paid' || booking.status === 'Reserved')
    .filter((booking) => {
      const checkOutDate = new Date(booking.checkOut);
      return checkOutDate >= now && checkOutDate <= upcomingWindow;
    })
    .sort((a, b) => new Date(a.checkOut) - new Date(b.checkOut))
    .slice(0, 5)
    .map((booking) => ({
      ...booking,
      windowLabel: `${booking.checkInLabel} → ${booking.checkOutLabel}`,
      daysUntil: Math.max(0, Math.round((new Date(booking.checkOut) - now) / DAY_MS))
    }));

  const amenityReservations = listAllAmenityReservations().map((reservation) => {
    const start = new Date(reservation.timeslotStart);
    const end = new Date(reservation.timeslotEnd);
    return {
      ...reservation,
      startLabel: start.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      endLabel: end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      durationLabel: formatDuration(start, end)
    };
  });

  const diningSeats = getCurrentSeats();
  const seatStatusCounts = diningSeats.reduce((acc, seat) => {
    const status = (seat.status || 'available').toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const baselineStatuses = ['available', 'held', 'reserved'];
  const diningSeatSummary = Array.from(
    new Set([...baselineStatuses, ...Object.keys(seatStatusCounts)])
  )
    .sort((a, b) => a.localeCompare(b))
    .map((status) => ({ status, count: seatStatusCounts[status] || 0 }));

  const diningStaff = listDiningStaff();
  const diningCoverageMap = diningStaff.reduce((map, member) => {
    const role = (member.role || 'Team').trim();
    const key = role.toLowerCase();
    const current = map.get(key) || { role, count: 0 };
    current.count += 1;
    map.set(key, current);
    return map;
  }, new Map());
  const diningCoverage = Array.from(diningCoverageMap.values()).sort((a, b) => a.role.localeCompare(b.role));

  res.render('admin/index', {
    pageTitle: 'Admin Control Deck',
    rooms,
    bookings,
    amenities,
    inquiries: inquiries
      .slice()
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)),
    metrics,
    statusBreakdown,
    upcomingCheckIns,
    upcomingCheckOuts,
    amenityReservations,
    lowInventoryRooms,
    bookingStatuses: ['Reserved', 'PendingPayment', 'Paid', 'Canceled'],
    reservationStatuses: ['reserved', 'waitlist', 'cancelled'],
    openInquiriesCount: openInquiries,
    diningSeats,
    diningSeatSummary,
    diningStaff,
    diningCoverage,
    adminAccess: {
      actorRole,
      allowedSubAdminRoles
    }
  });
});

router.get('/admin/time', ensureAdmin, (req, res) => {
  const start = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rawEntries = listEntries({ start }).slice(0, 160);
  const now = Date.now();
  const entries = rawEntries.map((entry) => {
    const clockIn = entry.clockInAt ? new Date(entry.clockInAt) : null;
    const clockOut = entry.clockOutAt ? new Date(entry.clockOutAt) : null;
    const employee = getUserById(entry.employeeId);
    const baseMinutes = entry.durationMinutes ?? null;
    const openDurationMinutes = !entry.clockOutAt && clockIn
      ? Math.max(0, Math.round((now - clockIn.getTime()) / 60000))
      : null;
    const displayMinutes = baseMinutes ?? openDurationMinutes;
    const durationLabel = displayMinutes
      ? `${Math.floor(displayMinutes / 60)}h ${displayMinutes % 60}m`
      : entry.clockOutAt
        ? 'Needs review'
        : 'Open';
    return {
      ...entry,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            department: employee.department || null
          }
        : null,
      clockInLabel: clockIn ? clockIn.toLocaleString() : '—',
      clockOutLabel: clockOut ? clockOut.toLocaleString() : '—',
      displayMinutes,
      durationLabel
    };
  });

  const totals = entries.reduce(
    (acc, entry) => {
      if (entry.durationMinutes) {
        acc.completedMinutes += entry.durationMinutes;
        acc.completedCount += 1;
      }
      if (!entry.clockOutAt) {
        acc.open.push(entry);
      }
      const effectiveMinutes = entry.durationMinutes
        ?? (entry.displayMinutes ?? 0);
      if (effectiveMinutes > acc.maxMinutes) {
        acc.maxMinutes = effectiveMinutes;
        acc.longest = entry;
      }
      const departmentKey = (entry.department || entry.employee?.department || 'Unassigned').toLowerCase();
      const currentDepartment = acc.departments.get(departmentKey) || {
        label: entry.department || entry.employee?.department || 'Unassigned',
        minutes: 0,
        count: 0
      };
      currentDepartment.minutes += effectiveMinutes;
      currentDepartment.count += 1;
      acc.departments.set(departmentKey, currentDepartment);

      if (entry.clockInAt) {
        const dayKey = entry.clockInAt.slice(0, 10);
        const existingDay = acc.daily.get(dayKey) || {
          date: dayKey,
          minutes: 0,
          count: 0
        };
        existingDay.minutes += effectiveMinutes;
        existingDay.count += 1;
        acc.daily.set(dayKey, existingDay);
      }

      const longShift = entry.durationMinutes && entry.durationMinutes >= 10 * 60;
      const extendedOpen = !entry.clockOutAt && entry.displayMinutes && entry.displayMinutes >= 8 * 60;
      if (longShift || extendedOpen) {
        acc.flagged.push(entry);
      }

      return acc;
    },
    {
      completedMinutes: 0,
      completedCount: 0,
      open: [],
      maxMinutes: 0,
      longest: null,
      departments: new Map(),
      daily: new Map(),
      flagged: []
    }
  );

  const coverage = Array.from(totals.departments.values()).sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  const dailySummaries = Array.from(totals.daily.values())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 7);

  const stats = {
    totalHours: totals.completedMinutes / 60,
    averageHours: totals.completedCount ? totals.completedMinutes / 60 / totals.completedCount : 0,
    openCount: totals.open.length,
    flaggedCount: totals.flagged.length,
    completedCount: totals.completedCount,
    coverage,
    dailySummaries,
    longest: totals.longest,
    flagged: totals.flagged.slice(0, 8),
    openEntries: totals.open
  };

  res.render('admin/time', {
    pageTitle: 'Timekeeping Console',
    entries,
    stats
  });
});

router.get('/admin/requests', ensureAdmin, (req, res) => {
  const now = new Date();
  const requests = listAllRequests()
    .slice(0, 80)
    .map((request) => {
      const employee = request.employeeId ? getUserById(request.employeeId) : null;
      const submittedAt = request.createdAt ? new Date(request.createdAt) : null;
      const typeLabel = request.type
        ? request.type
            .split(/[-_]/)
            .filter((segment) => segment.length)
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' ')
        : '—';
      return {
        ...request,
        employeeName: employee?.name || '',
        employeeEmail: employee?.email || '',
        submittedLabel: submittedAt ? submittedAt.toLocaleString() : '—',
        submittedRelative: submittedAt ? formatRelativeTime(submittedAt, now) : '—',
        typeLabel,
        submittedAt
      };
    })
    .sort((a, b) => {
      if (a.submittedAt && b.submittedAt) {
        return b.submittedAt.getTime() - a.submittedAt.getTime();
      }
      if (a.submittedAt) {
        return -1;
      }
      if (b.submittedAt) {
        return 1;
      }
      return 0;
    });

  const totalRequests = requests.length;
  const statusSummary = ['pending', 'approved', 'denied', 'cancelled'].map((status) => ({
    status,
    count: requests.filter((request) => request.status === status).length
  }));
  const typeSummaryMap = requests.reduce((acc, request) => {
    if (!request.typeLabel || request.typeLabel === '—') {
      return acc;
    }
    const key = request.typeLabel;
    acc[key] = acc[key] || { type: key, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});
  const typeSummary = Object.values(typeSummaryMap)
    .map((entry) => ({
      ...entry,
      percentage: totalRequests ? Math.round((entry.count / totalRequests) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
  const latestSubmission = requests.find((request) => request.submittedAt) || null;
  const lastSubmissionLabel = latestSubmission?.submittedLabel || '—';
  const lastSubmissionRelative = latestSubmission?.submittedRelative || '—';
  const approvalRate = totalRequests
    ? Math.round(
        ((statusSummary.find((entry) => entry.status === 'approved')?.count || 0) / totalRequests) * 100
      )
    : 0;

  res.render('admin/requests', {
    pageTitle: 'Crew Requests',
    requests,
    totalRequests,
    statusSummary,
    typeSummary,
    lastSubmissionLabel,
    lastSubmissionRelative,
    approvalRate
  });
});

router.post('/admin/rooms/:id', ensureAdmin, (req, res) => {
  const payload = {
    availability: Number.parseInt(sanitizeString(req.body.availability), 10)
  };
  const { error, value } = availabilitySchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid availability value supplied.');
    return res.redirect('/admin');
  }
  const room = setRoomAvailability(sanitizeString(req.params.id), value.availability);
  if (!room) {
    req.pushAlert('danger', 'Room not found.');
    return res.redirect('/admin');
  }
  req.pushAlert('success', `Availability for ${room.name} updated to ${room.availability}.`);
  return res.redirect('/admin');
});

router.post('/admin/bookings/:id/status', ensureAdmin, (req, res) => {
  const bookingId = sanitizeString(req.params.id);
  const payload = {
    status: sanitizeString(req.body.status)
  };
  const { error, value } = bookingStatusSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Please choose a valid booking status.');
    return res.redirect('/admin');
  }
  const booking = getBookingById(bookingId);
  if (!booking) {
    req.pushAlert('danger', 'Booking not found.');
    return res.redirect('/admin');
  }
  const updated = updateBookingStatus(bookingId, value.status);
  if (!updated) {
    req.pushAlert('danger', 'Unable to update booking status.');
    return res.redirect('/admin');
  }
  req.pushAlert('success', `Status for ${booking.roomName} updated to ${value.status}.`);
  return res.redirect('/admin');
});

router.post('/admin/amenities/reservations/:id/status', ensureAdmin, (req, res) => {
  const reservationId = sanitizeString(req.params.id);
  const payload = {
    status: sanitizeString(req.body.status)
  };
  const { error, value } = reservationStatusSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid reservation status selected.');
    return res.redirect('/admin');
  }
  const context = listAllAmenityReservations().find((reservation) => reservation.id === reservationId);
  if (!context) {
    req.pushAlert('danger', 'Reservation not found.');
    return res.redirect('/admin');
  }
  const updated = updateAmenityReservationStatus(reservationId, value.status);
  if (!updated) {
    req.pushAlert('danger', 'Unable to update reservation status.');
    return res.redirect('/admin');
  }
  req.pushAlert('success', `${context.amenityName} reservation now ${value.status}.`);
  return res.redirect('/admin');
});

router.post('/admin/inquiries/:id/status', ensureAdmin, (req, res) => {
  const inquiryId = sanitizeString(req.params.id);
  const payload = {
    status: sanitizeString(req.body.status).toLowerCase()
  };
  const { error, value } = inquiryStatusSchema.validate(payload, { abortEarly: false });
  if (error) {
    req.pushAlert('danger', 'Invalid inquiry status provided.');
    return res.redirect('/admin');
  }
  const inquiry = getInquiryById(inquiryId);
  if (!inquiry) {
    req.pushAlert('danger', 'Inquiry not found.');
    return res.redirect('/admin');
  }
  updateInquiryStatus(inquiryId, value.status);
  req.pushAlert('success', `Inquiry from ${inquiry.name} marked as ${value.status}.`);
  return res.redirect('/admin');
});

router.get('/admin/requests', ensureAdmin, (req, res) => {
  res.render('admin/requests', {
    pageTitle: 'Employee Requests Queue'
  });
});

module.exports = router;
