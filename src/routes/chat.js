const express = require('express');
const Joi = require('joi');
const { ensureAuthenticated } = require('../middleware/auth');
const { sanitizeString } = require('../utils/sanitize');
const {
  listMessagesByRoom,
  listDmMessages,
  blockUser,
  isBlocked,
  reportUser
} = require('../models/chat');
const { listBookingsByUser } = require('../models/bookings');
const { getAllUsers, getUserById } = require('../models/users');

const router = express.Router();

const reportSchema = Joi.object({
  targetUserId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  messageId: Joi.string().uuid({ version: 'uuidv4' }).allow(null, ''),
  reason: Joi.string().min(10).max(500).required()
});

router.get('/chat', ensureAuthenticated, (req, res) => {
  const users = getAllUsers().filter((user) => user.id !== req.user.id);
  const stayRooms = listBookingsByUser(req.user.id).map((booking) => ({
    id: `stay-${booking.checkIn.slice(0, 10)}-${booking.checkOut.slice(0, 10)}`,
    label: `${new Date(booking.checkIn).toLocaleDateString()} → ${new Date(booking.checkOut).toLocaleDateString()}`
  }));
  res.render('chat/index', {
    pageTitle: 'Live Concierge Chat',
    users,
    stayRooms
  });
});

router.get('/chat/history', ensureAuthenticated, (req, res) => {
  const room = sanitizeString(req.query.room || 'lobby');
  const before = req.query.before ? sanitizeString(req.query.before) : undefined;
  const messages = listMessagesByRoom(room, 50, before);
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
  const messages = listDmMessages(req.user.id, targetId, 50, before);
  res.json({ messages });
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

module.exports = router;
