const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const { ensureAuthenticated } = require('../middleware/auth');
const { sanitizeString } = require('../utils/sanitize');
const {
  listMessagesByRoom,
  listDmMessages,
  listRecentContacts,
  blockUser,
  isBlocked,
  reportUser,
  getAttachmentById,
  getMessageRowById,
  userCanAccessMessage,
  REACTION_EMOJIS
} = require('../models/chat');
const { listBookingsByUser } = require('../models/bookings');
const { getAllUsers, getUserById, searchUsers } = require('../models/users');
const { buildSuggestions } = require('../utils/sentiment');

const router = express.Router();

const reportSchema = Joi.object({
  targetUserId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  messageId: Joi.string().uuid({ version: 'uuidv4' }).allow(null, ''),
  reason: Joi.string().min(10).max(500).required()
});

router.get('/chat', ensureAuthenticated, (req, res) => {
  const users = getAllUsers().filter((user) => user.id !== req.user.id);
  const recentContacts = listRecentContacts(req.user.id);
  const stayRooms = listBookingsByUser(req.user.id).map((booking) => ({
    id: `stay-${booking.checkIn.slice(0, 10)}-${booking.checkOut.slice(0, 10)}`,
    label: `${new Date(booking.checkIn).toLocaleDateString()} → ${new Date(booking.checkOut).toLocaleDateString()}`
  }));
  if (!req.session.chatEncryptionKey) {
    req.session.chatEncryptionKey = crypto.randomBytes(32).toString('base64');
  }
  res.render('chat/index', {
    pageTitle: 'Live Concierge Chat',
    users,
    stayRooms,
    recentContacts,
    reactions: REACTION_EMOJIS,
    encryptionKey: req.session.chatEncryptionKey
  });
});

router.get('/chat/history', ensureAuthenticated, (req, res) => {
  const room = sanitizeString(req.query.room || 'lobby');
  const before = req.query.before ? sanitizeString(req.query.before) : undefined;
  const messages = listMessagesByRoom(room, 50, before, req.user.id).map((message) => ({
    ...message,
    sender: getUserById(message.fromUserId)
  }));
  res.json({ messages });
});

router.get('/chat/dm/:userId', ensureAuthenticated, (req, res) => {
  const targetId = sanitizeString(req.params.userId);
  const targetUser = getUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (isBlocked(targetId, req.user.id) || isBlocked(req.user.id, targetId)) {
    return res.status(403).json({ error: 'Direct messages are blocked.' });
  }
  const before = req.query.before ? sanitizeString(req.query.before) : undefined;
  const messages = listDmMessages(req.user.id, targetId, 50, before, req.user.id).map((message) => ({
    ...message,
    sender: getUserById(message.fromUserId)
  }));
  res.json({ messages, targetUser: { id: targetUser.id, name: targetUser.name } });
});

router.get('/chat/attachments/:id', ensureAuthenticated, (req, res) => {
  const attachmentId = sanitizeString(req.params.id);
  if (!attachmentId) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }
  const message = getMessageRowById(attachment.messageId);
  if (!userCanAccessMessage(req.user.id, message)) {
    return res.status(403).json({ error: 'You do not have access to this file.' });
  }
  const mimeType = attachment.mimeType || 'application/octet-stream';
  const shouldInline =
    (!req.query.download || req.query.download !== '1') &&
    (mimeType.startsWith('image/') || mimeType === 'application/pdf');
  const disposition = shouldInline ? 'inline' : 'attachment';
  const safeName = (attachment.filename || 'file').replace(/"/g, '');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', attachment.data.length);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  return res.send(attachment.data);
});

router.get('/chat/users', ensureAuthenticated, (req, res) => {
  const query = sanitizeString(req.query.query || '');
  if (!query || query.length < 2 || query.length > 60) {
    return res.json({ users: [] });
  }
  const results = searchUsers(query, 12).filter((user) => user.id !== req.user.id);
  res.json({ users: results });
});

router.post('/chat/block/:userId', ensureAuthenticated, (req, res) => {
  const targetId = sanitizeString(req.params.userId);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Cannot block yourself.' });
  }
  blockUser(req.user.id, targetId);
  res.json({ ok: true });
});

router.post('/chat/report', ensureAuthenticated, (req, res) => {
  const payload = {
    targetUserId: sanitizeString(req.body.targetUserId),
    messageId: req.body.messageId ? sanitizeString(req.body.messageId) : null,
    reason: sanitizeString(req.body.reason)
  };
  const { error, value } = reportSchema.validate(payload, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: 'Invalid report payload.' });
  }
  const report = reportUser({
    reporterId: req.user.id,
    targetUserId: value.targetUserId,
    messageId: value.messageId || null,
    reason: value.reason
  });
  res.json({ ok: true, report });
});

router.post('/chat/suggestions', ensureAuthenticated, (req, res) => {
  const message = sanitizeString(req.body.message || '');
  if (!message) {
    return res.status(400).json({ error: 'Message text required.' });
  }
  const data = buildSuggestions(
    message,
    req.body.partnerName ? sanitizeString(req.body.partnerName) : undefined
  );
  res.json(data);
});

module.exports = router;
