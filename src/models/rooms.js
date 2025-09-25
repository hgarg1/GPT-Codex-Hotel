const { getDb } = require('../db');

const db = getDb();

function serialiseRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    pricePerNight: row.pricePerNight,
    capacity: row.capacity,
    squareFeet: row.squareFeet,
    bedConfig: row.bedConfig,
    view: row.view,
    description: row.description,
    features: row.features ? JSON.parse(row.features) : [],
    images: row.images ? JSON.parse(row.images) : [],
    addOns: row.addOns ? JSON.parse(row.addOns) : [],
    availability: row.availability,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function listRoomTypes() {
  const rows = db.prepare('SELECT * FROM room_types ORDER BY pricePerNight DESC').all();
  return rows.map(serialiseRoom);
}

function getRoomById(id) {
  const row = db.prepare('SELECT * FROM room_types WHERE id = ?').get(id);
  return serialiseRoom(row);
}

function getRoomBySlug(slug) {
  const row = db.prepare('SELECT * FROM room_types WHERE slug = ?').get(slug);
  return serialiseRoom(row);
}

function adjustRoomAvailability(id, delta) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      'UPDATE room_types SET availability = MAX(availability + ?, 0), updatedAt = ? WHERE id = ?'
    )
    .run(delta, now, id);
  if (result.changes === 0) {
    return null;
  }
  return getRoomById(id);
}

function setRoomAvailability(id, availability) {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE room_types SET availability = ?, updatedAt = ? WHERE id = ?')
    .run(availability, now, id);
  if (result.changes === 0) {
    return null;
  }
  return getRoomById(id);
}

module.exports = {
  listRoomTypes,
  getRoomById,
  getRoomBySlug,
  adjustRoomAvailability,
  setRoomAvailability
};
