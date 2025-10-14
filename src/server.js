const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { sessionMiddleware } = require('./middleware/session');
const { getUserById } = require('./models/users');
const { listBookingsByUser } = require('./models/bookings');
const { decryptBuffer } = require('./utils/crypto');
const {
  saveMessage,
  saveAttachmentForMessage,
  isBlocked,
  toggleReaction,
  markChannelSeen,
  countUnreadMessages,
  getMessageById,
  getMessageRowById,
  userCanAccessMessage,
  REACTION_EMOJIS
} = require('./models/chat');

const PORT = process.env.PORT || 3000;
const {
  seatEmitter,
  getCurrentSeats,
  lockSeat: socketLockSeat,
  releaseSeat: socketReleaseSeat
} = require('./services/diningSeatLocks');
const { getUserFromRequest } = require('./utils/jwt');
const { roleAtLeast, Roles } = require('./utils/rbac');

const server = http.createServer(app);
function normalizeOrigin(origin) {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return origin;
  }
}

function addOriginVariants(origin, set) {
  if (!origin) return;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return;
  set.add(normalized);
  if (normalized.startsWith('http://')) {
    set.add(normalized.replace('http://', 'https://'));
  }
  if (normalized.startsWith('https://')) {
    set.add(normalized.replace('https://', 'http://'));
  }
}

const allowedOrigins = new Set();
addOriginVariants(`http://localhost:${PORT}`, allowedOrigins);
addOriginVariants(`http://127.0.0.1:${PORT}`, allowedOrigins);

if (process.env.SOCKET_ORIGIN) {
  addOriginVariants(process.env.SOCKET_ORIGIN, allowedOrigins);
}

if (process.env.SOCKET_ORIGINS) {
  process.env.SOCKET_ORIGINS.split(',').forEach((origin) => {
    addOriginVariants(origin.trim(), allowedOrigins);
  });
}

if (process.env.RENDER_EXTERNAL_URL) {
  addOriginVariants(process.env.RENDER_EXTERNAL_URL, allowedOrigins);
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Socket origin not allowed.'));
    },
    credentials: true
  }
});

app.set('io', io);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const onlineUsers = new Map();
const recentMessageTimestamps = new Map();
const bannedWords = ['damn', 'hell', 'shit'];
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

function emitToUser(userId, event, payload) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

function emitUnreadUpdate(userId) {
  const total = countUnreadMessages(userId);
  emitToUser(userId, 'chat:unread', { total });
}

function buildStayLabel(room) {
  const match = /^stay-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.exec(room || '');
  if (!match) return room;
  const [, start, end] = match;
  const startLabel = new Date(start).toLocaleDateString();
  const endLabel = new Date(end).toLocaleDateString();
  return `Stay · ${startLabel} → ${endLabel}`;
}

function buildChannelLabel(message, viewerId) {
  if (message.toUserId) {
    const partnerId = message.fromUserId === viewerId ? message.toUserId : message.fromUserId;
    const partner = partnerId ? getUserById(partnerId) : null;
    return partner ? `DM · ${partner.name}` : 'Direct message';
  }
  if (message.room === 'lobby') {
    return 'Lobby';
  }
  if (message.room && message.room.startsWith('stay-')) {
    return buildStayLabel(message.room);
  }
  return message.room;
}

function buildMessagePreview(message) {
  const text = message.body?.trim();
  if (text) {
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  if (message.attachments?.length) {
    const first = message.attachments[0];
    if (first?.mimeType?.startsWith('image/')) {
      return 'Sent a photo';
    }
    if (first?.mimeType === 'application/pdf') {
      return 'Shared a PDF';
    }
    return `Shared ${first?.filename || 'a file'}`;
  }
  return 'New chat activity';
}

function notifyUserOfMessage(userId, message) {
  emitToUser(userId, 'chat:notification', {
    room: message.room,
    channelLabel: buildChannelLabel(message, userId),
    from: {
      id: message.fromUserId,
      name: getUserById(message.fromUserId)?.name || 'Guest'
    },
    preview: buildMessagePreview(message)
  });
}

function trackPresence(userId, socketId) {
  const sockets = onlineUsers.get(userId) || new Set();
  sockets.add(socketId);
  onlineUsers.set(userId, sockets);
  io.emit('presence', { userId, status: 'online' });
}

function clearPresence(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    io.emit('presence', { userId, status: 'offline' });
  } else {
    onlineUsers.set(userId, sockets);
  }
}

function isProfane(message) {
  const lower = message.toLowerCase();
  return bannedWords.some((word) => lower.includes(word));
}

function withinRateLimit(userId) {
  const now = Date.now();
  const windowMs = 10 * 1000;
  const limit = 20;
  const timestamps = recentMessageTimestamps.get(userId) || [];
  const filtered = timestamps.filter((ts) => now - ts < windowMs);
  if (filtered.length >= limit) {
    recentMessageTimestamps.set(userId, filtered);
    return false;
  }
  filtered.push(now);
  recentMessageTimestamps.set(userId, filtered);
  return true;
}

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session?.userId) {
    socket.disconnect(true);
    return;
  }
  const user = getUserById(session.userId);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  socket.data.user = user;
  trackPresence(user.id, socket.id);
  socket.join('lobby');
  socket.emit('presence:init', Array.from(onlineUsers.keys()));
  emitUnreadUpdate(user.id);

  socket.on('admin:subscribe', (channel) => {
    if (!roleAtLeast(user.role, Roles.ADMIN)) {
      return;
    }
    if (channel === 'inquiries') {
      socket.join('admin:inquiries');
    }
  });

  const bookings = listBookingsByUser(user.id);
  bookings.forEach((booking) => {
    const roomName = `stay-${booking.checkIn.slice(0, 10)}-${booking.checkOut.slice(0, 10)}`;
    socket.join(roomName);
  });

  socket.on('join:dm', (targetId) => {
    const safeTarget = String(targetId);
    if (isBlocked(user.id, safeTarget) || isBlocked(safeTarget, user.id)) {
      socket.emit('chat:error', 'Direct messages are blocked with this user.');
      return;
    }
    const roomId = [user.id, safeTarget].sort().join(':');
    socket.join(`dm-${roomId}`);
  });

  socket.on('typing', (payload) => {
    const { room } = payload;
    if (room) {
      socket.to(room).emit('typing', { room, userId: user.id });
    }
  });

  socket.on('chat:message', async (payload, callback) => {
    try {
      const { room, body, toUserId, attachment } = payload || {};
      const text = typeof body === 'string' ? body.trim() : '';
      if (!text && !attachment) {
        return callback?.({ error: 'Message cannot be empty.' });
      }
      if (text.length > 400) {
        return callback?.({ error: 'Message exceeds maximum length.' });
      }
      if (text && isProfane(text)) {
        return callback?.({ error: 'Please keep the conversation respectful.' });
      }
      if (!withinRateLimit(user.id)) {
        return callback?.({ error: 'You are sending messages too quickly.' });
      }
      let targetRoom = room;
      let safeTarget = null;
      if (toUserId) {
        safeTarget = String(toUserId);
        if (isBlocked(user.id, safeTarget) || isBlocked(safeTarget, user.id)) {
          return callback?.({ error: 'Direct messages are blocked.' });
        }
        targetRoom = `dm-${[user.id, safeTarget].sort().join(':')}`;
      }
      if (!targetRoom) {
        return callback?.({ error: 'Chat room missing.' });
      }

      let fileBuffer = null;
      let fileName = null;
      let fileType = null;
      if (attachment) {
        const { name, mimeType, data, encrypted } = attachment;
        try {
          fileBuffer = Buffer.from(String(data || ''), 'base64');
        } catch (error) {
          return callback?.({ error: 'Invalid attachment payload.' });
        }
        if (!fileBuffer || fileBuffer.length === 0) {
          return callback?.({ error: 'Attachment could not be processed.' });
        }
        if (fileBuffer.length > MAX_ATTACHMENT_SIZE) {
          return callback?.({ error: 'Attachment exceeds the 10 MB limit.' });
        }
        const encryptedForTransit = Boolean(encrypted);
        fileName = typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 160) : 'attachment';
        fileName = fileName.replace(/[\\/]/g, '_');
        fileType = typeof mimeType === 'string' && mimeType.trim().length > 0 ? mimeType : 'application/octet-stream';
        if (encryptedForTransit) {
          const sessionKey = socket.request?.session?.chatEncryptionKey;
          if (!sessionKey) {
            return callback?.({ error: 'Secure attachment key missing.' });
          }
          try {
            fileBuffer = decryptBuffer(fileBuffer, Buffer.from(sessionKey, 'base64'));
          } catch (error) {
            return callback?.({ error: 'Unable to decrypt attachment.' });
          }
        }
        const claimedSize = Number(attachment.size);
        if (Number.isFinite(claimedSize) && claimedSize > 0 && fileBuffer.length !== claimedSize) {
          return callback?.({ error: 'Attachment size mismatch.' });
        }
      }

      const saved = saveMessage({
        room: targetRoom,
        fromUserId: user.id,
        toUserId: safeTarget || null,
        body: text
      });

      if (fileBuffer) {
        saveAttachmentForMessage(saved.id, {
          filename: fileName,
          mimeType: fileType,
          buffer: fileBuffer
        });
      }

      const messageForBroadcast = getMessageById(saved.id);
      const messageForSender = getMessageById(saved.id, user.id);

      io.to(targetRoom).emit('chat:message', {
        ...messageForBroadcast,
        sender: { id: user.id, name: user.name }
      });

      markChannelSeen(user.id, targetRoom, messageForBroadcast.createdAt);
      emitUnreadUpdate(user.id);

      callback?.({ ok: true, message: messageForSender });

      const recipients = new Set();
      if (safeTarget) {
        recipients.add(safeTarget);
      } else {
        const socketsInRoom = await io.in(targetRoom).fetchSockets();
        socketsInRoom.forEach((participantSocket) => {
          const participantId = participantSocket.data?.user?.id;
          if (participantId && participantId !== user.id) {
            recipients.add(participantId);
          }
        });
      }

      recipients.forEach((recipientId) => {
        if (recipientId === user.id) return;
        emitUnreadUpdate(recipientId);
        notifyUserOfMessage(recipientId, messageForBroadcast);
      });
    } catch (error) {
      callback?.({ error: 'Unable to send message right now.' });
    }
  });

  socket.on('chat:react', (payload, callback) => {
    try {
      const messageId = String(payload?.messageId || '');
      const emoji = payload?.emoji;
      if (!messageId || typeof emoji !== 'string') {
        return callback?.({ error: 'Invalid reaction payload.' });
      }
      if (!REACTION_EMOJIS.includes(emoji)) {
        return callback?.({ error: 'Reaction not supported.' });
      }
      const message = getMessageRowById(messageId);
      if (!message) {
        return callback?.({ error: 'Message not found.' });
      }
      if (!userCanAccessMessage(user.id, message)) {
        return callback?.({ error: 'You cannot react to this message.' });
      }
      const result = toggleReaction({ messageId, userId: user.id, emoji });
      io.to(message.room).emit('chat:reaction', {
        messageId,
        reactions: result.reactions,
        userId: user.id,
        emoji: result.emoji
      });
      callback?.({ ok: true, emoji: result.emoji });
    } catch (error) {
      callback?.({ error: 'Unable to update reaction.' });
    }
  });

  socket.on('chat:seen', (payload = {}) => {
    const roomId = typeof payload.room === 'string' ? payload.room : null;
    if (!roomId) {
      return;
    }
    const lastSeenAt = typeof payload.lastSeenAt === 'string' ? payload.lastSeenAt : undefined;
    markChannelSeen(user.id, roomId, lastSeenAt);
    emitUnreadUpdate(user.id);
  });

  socket.on('chat:requestUnread', () => {
    emitUnreadUpdate(user.id);
  });

  socket.on('disconnect', () => {
    clearPresence(user.id, socket.id);
  });
});

const diningNamespace = io.of('/dining');

diningNamespace.use((socket, next) => {
  const requestLike = { headers: socket.handshake.headers };
  const user = getUserFromRequest(requestLike);
  if (!user) {
    return next(new Error('Authentication required'));
  }
  socket.data.user = user;
  return next();
});

diningNamespace.on('connection', (socket) => {
  const emitSnapshot = () => {
    socket.emit('seats:snapshot', getCurrentSeats());
  };
  const forwardUpdate = (payload) => {
    socket.emit('seats:update', payload);
  };
  emitSnapshot();
  seatEmitter.on('update', forwardUpdate);

  socket.on('seat:lock', async ({ seatId }) => {
    if (!seatId) {
      socket.emit('seat:error', { error: 'Seat ID required.' });
      return;
    }
    const result = await socketLockSeat(seatId, socket.data.user.id);
    if (!result.ok) {
      socket.emit('seat:error', { error: result.error || 'Seat unavailable.' });
    } else {
      socket.emit('seat:locked', { seatId, lockId: result.lockId, expiresAt: result.expiresAt });
    }
  });

  socket.on('seat:release', async ({ seatId, lockId }) => {
    if (!seatId || !lockId) {
      socket.emit('seat:error', { error: 'Seat and lock required.' });
      return;
    }
    const result = await socketReleaseSeat(seatId, lockId);
    if (!result.ok) {
      socket.emit('seat:error', { error: 'Unable to release seat.' });
    } else {
      socket.emit('seat:released', { seatId });
    }
  });

  socket.on('disconnect', () => {
    seatEmitter.off('update', forwardUpdate);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
