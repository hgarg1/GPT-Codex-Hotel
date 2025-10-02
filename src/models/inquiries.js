const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serialiseInquiry(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status || 'open',
    receivedAt: row.receivedAt,
    resolvedAt: row.resolvedAt || null
  };
}

function addInquiry({ name, email, message }) {
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    name,
    email,
    message,
    status: 'open',
    receivedAt: now,
    resolvedAt: null
  };
  db.prepare(
    `INSERT INTO guest_inquiries (id, name, email, message, status, receivedAt, resolvedAt)
     VALUES (@id, @name, @email, @message, @status, @receivedAt, @resolvedAt)`
  ).run(record);
  return getInquiryById(record.id);
}

function getAllInquiries() {
  const rows = db.prepare('SELECT * FROM guest_inquiries ORDER BY receivedAt DESC').all();
  return rows.map(serialiseInquiry);
}

function getInquiryById(id) {
  const row = db.prepare('SELECT * FROM guest_inquiries WHERE id = ?').get(id);
  return serialiseInquiry(row);
}

function updateInquiryStatus(id, status) {
  const now = new Date().toISOString();
  const resolvedAt = status === 'resolved' ? now : null;
  const result = db
    .prepare('UPDATE guest_inquiries SET status = ?, resolvedAt = ? WHERE id = ?')
    .run(status, resolvedAt, id);
  if (result.changes === 0) {
    return null;
  }
  return getInquiryById(id);
}

module.exports = {
  addInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus
};
