const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serialiseBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    roomTypeId: row.roomTypeId,
    roomName: row.roomName,
    roomSlug: row.roomSlug,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    guests: row.guests,
    addOns: row.addOns ? JSON.parse(row.addOns) : [],
    total: row.total,
    taxes: row.taxes,
    fees: row.fees,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function listBookings() {
  const rows = db
    .prepare(
      `SELECT b.*, r.name as roomName, r.slug as roomSlug
       FROM bookings b
       JOIN room_types r ON b.roomTypeId = r.id
       ORDER BY b.createdAt DESC`
    )
    .all();
  return rows.map(serialiseBooking);
}

function listBookingsByUser(userId) {
  const rows = db
    .prepare(
      `SELECT b.*, r.name as roomName, r.slug as roomSlug
       FROM bookings b
       JOIN room_types r ON b.roomTypeId = r.id
       WHERE b.userId = ?
       ORDER BY b.createdAt DESC`
    )
    .all(userId);
  return rows.map(serialiseBooking);
}

function getBookingById(id) {
  const row = db
    .prepare(
      `SELECT b.*, r.name as roomName, r.slug as roomSlug
       FROM bookings b
       JOIN room_types r ON b.roomTypeId = r.id
       WHERE b.id = ?`
    )
    .get(id);
  return serialiseBooking(row);
}

function createBooking({ userId, roomTypeId, checkIn, checkOut, guests, addOns, total, taxes, fees, status }) {
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, userId, roomTypeId, checkIn, checkOut, guests, addOns, total, taxes, fees, status, createdAt, updatedAt)
    VALUES (@id, @userId, @roomTypeId, @checkIn, @checkOut, @guests, @addOns, @total, @taxes, @fees, @status, @createdAt, @updatedAt)
  `).run({
    id,
    userId,
    roomTypeId,
    checkIn,
    checkOut,
    guests,
    addOns: JSON.stringify(addOns || []),
    total,
    taxes,
    fees,
    status,
    createdAt: now,
    updatedAt: now
  });
  return getBookingById(id);
}

function updateBookingStatus(id, status) {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE bookings SET status = ?, updatedAt = ? WHERE id = ?')
    .run(status, now, id);
  if (result.changes === 0) {
    return null;
  }
  return getBookingById(id);
}

function cancelBooking(id) {
  return updateBookingStatus(id, 'Canceled');
}

function updateBookingTotals(id, { total, taxes, fees }) {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE bookings SET total = ?, taxes = ?, fees = ?, updatedAt = ? WHERE id = ?'
  ).run(total, taxes, fees, now, id);
  return getBookingById(id);
}

module.exports = {
  listBookings,
  listBookingsByUser,
  getBookingById,
  createBooking,
  updateBookingStatus,
  cancelBooking,
  updateBookingTotals
};
