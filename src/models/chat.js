const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { encryptText, decryptText, encryptBuffer, decryptBuffer } = require('../utils/crypto');
const { getUserById } = require('./users');
const { listBookingsByUser } = require('./bookings');

const db = getDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_files (
    id TEXT PRIMARY KEY,
    messageId TEXT NOT NULL,
    filename TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (messageId) REFERENCES chat_messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_reactions (
    messageId TEXT NOT NULL,
    userId TEXT NOT NULL,
    emoji TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (messageId, userId),
    FOREIGN KEY (messageId) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_receipts (
    userId TEXT NOT NULL,
    channel TEXT NOT NULL,
    lastSeenAt TEXT NOT NULL,
    PRIMARY KEY (userId, channel),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const REACTION_EMOJIS = ['😀', '😍', '😮', '😢', '😡', '👍'];

const attachmentsByMessageStmt = db.prepare(
  `SELECT id, messageId, filename, mimeType, size, createdAt
   FROM chat_files
   WHERE messageId = ?
   ORDER BY createdAt ASC`
);

const reactionsByMessageStmt = db.prepare(
  `SELECT emoji, COUNT(*) AS count
   FROM chat_reactions
   WHERE messageId = ?
   GROUP BY emoji`
);

const reactionByUserStmt = db.prepare(
  'SELECT emoji FROM chat_reactions WHERE messageId = ? AND userId = ?'
);

function getAccessibleRooms(userId) {
  const rooms = new Set(['lobby']);
  if (!userId) {
    return rooms;
  }
  const bookings = listBookingsByUser(userId) || [];
  bookings.forEach((booking) => {
    if (!booking?.checkIn || !booking?.checkOut) return;
    const stayId = `stay-${booking.checkIn.slice(0, 10)}-${booking.checkOut.slice(0, 10)}`;
    rooms.add(stayId);
  });
  return rooms;
}

function serialiseMessage(row, viewerId) {
  if (!row) return null;
  const base = {
    id: row.id,
    room: row.room,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    body: decryptText(row.body),
    createdAt: row.createdAt
  };
  const attachments = attachmentsByMessageStmt.all(row.id).map((attachment) => ({
    id: attachment.id,
    messageId: attachment.messageId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt
  }));
  const reactions = reactionsByMessageStmt.all(row.id).map((reaction) => ({
    emoji: reaction.emoji,
    count: Number(reaction.count) || 0
  }));
  let viewerReaction = null;
  if (viewerId) {
    const existing = reactionByUserStmt.get(row.id, viewerId);
    viewerReaction = existing?.emoji || null;
  }
  return { ...base, attachments, reactions, viewerReaction };
}

function saveMessage({ room, fromUserId, toUserId = null, body }) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const encryptedBody = encryptText(body || '');
  db.prepare(
    'INSERT INTO chat_messages (id, room, fromUserId, toUserId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, room, fromUserId, toUserId, encryptedBody, createdAt);
  return getMessageById(id, fromUserId);
}

function getMessageRowById(id) {
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
}

function getMessageById(id, viewerId) {
  const row = getMessageRowById(id);
  return serialiseMessage(row, viewerId);
}

function listMessagesByRoom(room, limit = 50, before, viewerId) {
  let query = 'SELECT * FROM chat_messages WHERE room = ?';
  const params = [room];
  if (before) {
    query += ' AND createdAt < ?';
    params.push(before);
  }
  query += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(query).all(...params);
  return rows.map((row) => serialiseMessage(row, viewerId)).reverse();
}

function listDmMessages(userA, userB, limit = 50, before, viewerId) {
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
  return rows.map((row) => serialiseMessage(row, viewerId)).reverse();
}

function listRecentContacts(userId, limit = 12) {
  const rows = db
    .prepare(
      `SELECT partnerId, MAX(createdAt) AS lastMessageAt
       FROM (
         SELECT CASE WHEN fromUserId = ? THEN toUserId ELSE fromUserId END AS partnerId,
                createdAt
         FROM chat_messages
         WHERE (fromUserId = ? OR toUserId = ?) AND toUserId IS NOT NULL
       ) AS conversations
       WHERE partnerId IS NOT NULL
       GROUP BY partnerId
       ORDER BY lastMessageAt DESC
       LIMIT ?`
    )
    .all(userId, userId, userId, limit);

  return rows
    .map((row) => {
      const partner = getUserById(row.partnerId);
      if (!partner) return null;
      return {
        user: partner,
        lastMessageAt: row.lastMessageAt
      };
    })
    .filter(Boolean);
}

function saveAttachmentForMessage(messageId, { filename, mimeType, buffer }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Attachment payload is empty.');
  }
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const encryptedBuffer = encryptBuffer(buffer);
  db.prepare(
    `INSERT INTO chat_files (id, messageId, filename, mimeType, size, data, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, messageId, filename, mimeType, buffer.length, encryptedBuffer, createdAt);
  return {
    id,
    messageId,
    filename,
    mimeType,
    size: buffer.length,
    createdAt
  };
}

function listAttachmentsByMessage(messageId) {
  return attachmentsByMessageStmt.all(messageId).map((attachment) => ({
    id: attachment.id,
    messageId: attachment.messageId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt
  }));
}

function getAttachmentById(id) {
  const row = db.prepare('SELECT * FROM chat_files WHERE id = ?').get(id);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    messageId: row.messageId,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt,
    data: decryptBuffer(row.data)
  };
}

function getReactionSummary(messageId) {
  return reactionsByMessageStmt.all(messageId).map((entry) => ({
    emoji: entry.emoji,
    count: Number(entry.count) || 0
  }));
}

function getUserReaction(messageId, userId) {
  const row = reactionByUserStmt.get(messageId, userId);
  return row?.emoji || null;
}

function toggleReaction({ messageId, userId, emoji }) {
  if (!REACTION_EMOJIS.includes(emoji)) {
    throw new Error('Unsupported reaction emoji.');
  }
  const now = new Date().toISOString();
  const existing = reactionByUserStmt.get(messageId, userId);
  if (existing?.emoji === emoji) {
    db.prepare('DELETE FROM chat_reactions WHERE messageId = ? AND userId = ?').run(messageId, userId);
    return { emoji: null, reactions: getReactionSummary(messageId) };
  }
  db.prepare(
    `INSERT INTO chat_reactions (messageId, userId, emoji, createdAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(messageId, userId) DO UPDATE SET emoji = excluded.emoji, createdAt = excluded.createdAt`
  ).run(messageId, userId, emoji, now);
  return { emoji, reactions: getReactionSummary(messageId) };
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

function markChannelSeen(userId, channel, lastSeenAt) {
  if (!userId || !channel) {
    return;
  }
  const timestamp = lastSeenAt || new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_receipts (userId, channel, lastSeenAt)
     VALUES (?, ?, ?)
     ON CONFLICT(userId, channel) DO UPDATE SET lastSeenAt = excluded.lastSeenAt`
  ).run(userId, channel, timestamp);
}

function countUnreadMessages(userId) {
  if (!userId) {
    return 0;
  }
  const accessibleRooms = Array.from(getAccessibleRooms(userId));
  if (accessibleRooms.length === 0) {
    accessibleRooms.push('lobby');
  }
  const placeholders = accessibleRooms.map(() => '?').join(', ');
  const query = `
    SELECT COUNT(*) AS count
    FROM chat_messages m
    LEFT JOIN chat_receipts r ON r.userId = ? AND r.channel = m.room
    WHERE m.fromUserId != ?
      AND (
        (m.toUserId IS NULL AND m.room IN (${placeholders}))
        OR m.toUserId = ?
      )
      AND m.createdAt > COALESCE(r.lastSeenAt, '1970-01-01T00:00:00.000Z')
  `;
  const params = [userId, userId, ...accessibleRooms, userId];
  const row = db.prepare(query).get(...params);
  return row?.count || 0;
}

function userCanAccessMessage(userId, message) {
  if (!message) return false;
  if (message.toUserId) {
    return message.toUserId === userId || message.fromUserId === userId;
  }
  if (message.room === 'lobby') {
    return true;
  }
  if (message.room && message.room.startsWith('stay-')) {
    const rooms = getAccessibleRooms(userId);
    return rooms.has(message.room);
  }
  return true;
}

module.exports = {
  saveMessage,
  getMessageById,
  getMessageRowById,
  listMessagesByRoom,
  listDmMessages,
  listRecentContacts,
  saveAttachmentForMessage,
  listAttachmentsByMessage,
  getAttachmentById,
  getReactionSummary,
  getUserReaction,
  toggleReaction,
  blockUser,
  isBlocked,
  reportUser,
  markChannelSeen,
  countUnreadMessages,
  userCanAccessMessage,
  REACTION_EMOJIS
};
