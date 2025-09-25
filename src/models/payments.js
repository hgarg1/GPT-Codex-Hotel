const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serialisePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.bookingId,
    method: row.method,
    last4: row.last4,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    providerRef: row.providerRef,
    receiptNumber: row.receiptNumber,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getPaymentByBookingId(bookingId) {
  const row = db.prepare('SELECT * FROM payments WHERE bookingId = ?').get(bookingId);
  return serialisePayment(row);
}

function createPayment({ bookingId, method, last4, amount, currency, status, providerRef, receiptNumber }) {
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO payments (id, bookingId, method, last4, amount, currency, status, providerRef, receiptNumber, createdAt, updatedAt)
    VALUES (@id, @bookingId, @method, @last4, @amount, @currency, @status, @providerRef, @receiptNumber, @createdAt, @updatedAt)
  `).run({
    id,
    bookingId,
    method,
    last4,
    amount,
    currency,
    status,
    providerRef,
    receiptNumber,
    createdAt: now,
    updatedAt: now
  });
  return getPaymentById(id);
}

function getPaymentById(id) {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  return serialisePayment(row);
}

function updatePaymentStatus(id, status) {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE payments SET status = ?, updatedAt = ? WHERE id = ?').run(status, now, id);
  if (result.changes === 0) {
    return null;
  }
  return getPaymentById(id);
}

function recordPaymentCapture(id, receiptNumber) {
  const now = new Date().toISOString();
  db.prepare('UPDATE payments SET status = ?, receiptNumber = ?, updatedAt = ? WHERE id = ?').run(
    'captured',
    receiptNumber,
    now,
    id
  );
  return getPaymentById(id);
}

function createPaymentAndCapture({ bookingId, amount, last4, currency }) {
  const providerRef = `AUTH-${Math.floor(Math.random() * 900000) + 100000}`;
  const receiptNumber = `RCP-${Math.floor(Math.random() * 900000) + 100000}`;
  const payment = createPayment({
    bookingId,
    method: 'card',
    last4,
    amount,
    currency,
    status: 'captured',
    providerRef,
    receiptNumber
  });
  return payment;
}

function createReversal(paymentId, amount) {
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO payment_reversals (id, paymentId, amount, createdAt) VALUES (?, ?, ?, ?)'
  ).run(id, paymentId, amount, now);
  return { id, paymentId, amount, createdAt: now };
}

module.exports = {
  getPaymentByBookingId,
  getPaymentById,
  createPayment,
  updatePaymentStatus,
  recordPaymentCapture,
  createPaymentAndCapture,
  createReversal
};
