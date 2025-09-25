const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serialiseAmenity(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    longDescription: row.longDescription,
    hours: row.hours,
    location: row.location,
    capacity: row.capacity,
    images: row.images ? JSON.parse(row.images) : [],
    cta: row.cta,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function listAmenities() {
  const rows = db.prepare('SELECT * FROM amenities ORDER BY name ASC').all();
  return rows.map(serialiseAmenity);
}

function getAmenityBySlug(slug) {
  const row = db.prepare('SELECT * FROM amenities WHERE slug = ?').get(slug);
  return serialiseAmenity(row);
}

function getAmenityById(id) {
  const row = db.prepare('SELECT * FROM amenities WHERE id = ?').get(id);
  return serialiseAmenity(row);
}

function createAmenityReservation({ amenityId, userId, timeslotStart, timeslotEnd, status }) {
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO amenity_reservations (id, amenityId, userId, timeslotStart, timeslotEnd, status, createdAt, updatedAt)
    VALUES (@id, @amenityId, @userId, @timeslotStart, @timeslotEnd, @status, @createdAt, @updatedAt)
  `).run({
    id,
    amenityId,
    userId,
    timeslotStart,
    timeslotEnd,
    status,
    createdAt: now,
    updatedAt: now
  });
  return getAmenityReservationById(id);
}

function listReservationsByAmenityAndSlot(amenityId, start, end) {
  const rows = db
    .prepare(
      `SELECT * FROM amenity_reservations
       WHERE amenityId = ?
       AND status = 'reserved'
       AND NOT (timeslotEnd <= ? OR timeslotStart >= ?)`
    )
    .all(amenityId, start, end);
  return rows.map(getReservationSerializer());
}

function getReservationSerializer() {
  return (row) => {
    if (!row) return null;
    return {
      id: row.id,
      amenityId: row.amenityId,
      userId: row.userId,
      timeslotStart: row.timeslotStart,
      timeslotEnd: row.timeslotEnd,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  };
}

function getAmenityReservationById(id) {
  const row = db.prepare('SELECT * FROM amenity_reservations WHERE id = ?').get(id);
  return getReservationSerializer()(row);
}

function listAllAmenityReservations() {
  const rows = db
    .prepare(
      `SELECT ar.*, a.name AS amenityName, a.slug AS amenitySlug, u.name AS guestName, u.email AS guestEmail
       FROM amenity_reservations ar
       JOIN amenities a ON ar.amenityId = a.id
       JOIN users u ON ar.userId = u.id
       ORDER BY ar.timeslotStart ASC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    amenityId: row.amenityId,
    amenityName: row.amenityName,
    amenitySlug: row.amenitySlug,
    userId: row.userId,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    timeslotStart: row.timeslotStart,
    timeslotEnd: row.timeslotEnd,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function listReservationsByUser(userId) {
  const rows = db
    .prepare(
      `SELECT ar.*, a.name as amenityName, a.slug as amenitySlug
       FROM amenity_reservations ar
       JOIN amenities a ON ar.amenityId = a.id
       WHERE ar.userId = ?
       ORDER BY ar.timeslotStart DESC`
    )
    .all(userId);
  return rows.map((row) => ({
    id: row.id,
    amenityId: row.amenityId,
    amenityName: row.amenityName,
    amenitySlug: row.amenitySlug,
    timeslotStart: row.timeslotStart,
    timeslotEnd: row.timeslotEnd,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function updateAmenityReservationStatus(id, status) {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE amenity_reservations SET status = ?, updatedAt = ? WHERE id = ?')
    .run(status, now, id);
  if (result.changes === 0) {
    return null;
  }
  return getAmenityReservationById(id);
}

module.exports = {
  listAmenities,
  getAmenityBySlug,
  getAmenityById,
  createAmenityReservation,
  listReservationsByAmenityAndSlot,
  listAllAmenityReservations,
  listReservationsByUser,
  getAmenityReservationById,
  updateAmenityReservationStatus
};
