const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { sessionMiddleware } = require('./middleware/session');
const { getUserById } = require('./models/users');
const { listBookingsByUser } = require('./models/bookings');
const { saveMessage, isBlocked } = require('./models/chat');

const PORT = process.env.PORT || 3000;

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

  socket.on('admin:subscribe', (channel) => {
    if (user.role !== 'admin') {
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

  socket.on('chat:message', (payload, callback) => {
    const { room, body, toUserId } = payload || {};
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return callback?.({ error: 'Message cannot be empty.' });
    }
    if (body.length > 400) {
      return callback?.({ error: 'Message exceeds maximum length.' });
    }
    if (isProfane(body)) {
      return callback?.({ error: 'Please keep the conversation respectful.' });
    }
    if (!withinRateLimit(user.id)) {
      return callback?.({ error: 'You are sending messages too quickly.' });
    }
    let targetRoom = room;
    if (toUserId) {
      const safeTarget = String(toUserId);
      if (isBlocked(user.id, safeTarget) || isBlocked(safeTarget, user.id)) {
        return callback?.({ error: 'Direct messages are blocked.' });
      }
      targetRoom = `dm-${[user.id, safeTarget].sort().join(':')}`;
    }
    if (!targetRoom) {
      return callback?.({ error: 'Chat room missing.' });
    }
    const message = saveMessage({
      room: toUserId ? targetRoom : targetRoom,
      fromUserId: user.id,
      toUserId: toUserId || null,
      body: body.trim()
    });
    io.to(targetRoom).emit('chat:message', {
      ...message,
      sender: { id: user.id, name: user.name }
    });
    callback?.({ ok: true, message });
  });

  socket.on('disconnect', () => {
    clearPresence(user.id, socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
