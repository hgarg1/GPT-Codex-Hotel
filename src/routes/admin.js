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
