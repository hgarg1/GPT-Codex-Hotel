const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function coerceDetails(details) {
  if (details == null) {
    return null;
  }
  if (typeof details === 'string') {
    return details;
  }
  try {
    return JSON.stringify(details);
  } catch (error) {
    return null;
  }
}

function recordAuditLog({ actorUserId, targetUserId, action, details }) {
  if (!action) {
    throw new Error('Audit action is required');
  }
  const entry = {
    id: uuidv4(),
    actorUserId: actorUserId || null,
    targetUserId: targetUserId || null,
    action,
    details: coerceDetails(details),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    `INSERT INTO audit_logs (id, actorUserId, targetUserId, action, details, createdAt)
     VALUES (@id, @actorUserId, @targetUserId, @action, @details, @createdAt)`
  ).run(entry);
  return entry;
}

module.exports = {
  recordAuditLog
};
