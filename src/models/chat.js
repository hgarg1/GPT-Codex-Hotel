const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const db = getDb();

function serialiseMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    room: row.room,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    body: row.body,
    createdAt: row.createdAt
  };
}

function saveMessage({ room, fromUserId, toUserId = null, body }) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO chat_messages (id, room, fromUserId, toUserId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, room, fromUserId, toUserId, body, createdAt);
  return getMessageById(id);
}

function getMessageById(id) {
  const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
  return serialiseMessage(row);
}

function listMessagesByRoom(room, limit = 50, before) {
  let query = 'SELECT * FROM chat_messages WHERE room = ?';
  const params = [room];
  if (before) {
    query += ' AND createdAt < ?';
    params.push(before);
  }
  query += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(query).all(...params);
  return rows.map(serialiseMessage).reverse();
}

function listDmMessages(userA, userB, limit = 50, before) {
  let query = `SELECT * FROM chat_messages
    WHERE ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))`;
  const params = [userA, userB, userB, userA];
  if (before) {
    query += ' AND createdAt < ?';
    params.push(before);
  }
  query += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(query).all(...params);
  return rows.map(serialiseMessage).reverse();
}

function blockUser(blockerId, blockedId) {
  const existing = db
    .prepare('SELECT 1 FROM chat_blocks WHERE blockerId = ? AND blockedId = ?')
    .get(blockerId, blockedId);
  if (existing) {
    return true;
  }
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO chat_blocks (blockerId, blockedId, createdAt) VALUES (?, ?, ?)').run(
    blockerId,
    blockedId,
    createdAt
  );
  return true;
}

function isBlocked(blockerId, blockedId) {
  const row = db
    .prepare('SELECT 1 FROM chat_blocks WHERE blockerId = ? AND blockedId = ?')
    .get(blockerId, blockedId);
  return !!row;
}

function reportUser({ reporterId, targetUserId, messageId = null, reason }) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO chat_reports (id, reporterId, targetUserId, messageId, reason, resolved, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)' 
  ).run(id, reporterId, targetUserId, messageId, reason, createdAt);
  return { id, reporterId, targetUserId, messageId, reason, resolved: 0, createdAt };
}

module.exports = {
  saveMessage,
  listMessagesByRoom,
  listDmMessages,
  blockUser,
  isBlocked,
  reportUser
};
