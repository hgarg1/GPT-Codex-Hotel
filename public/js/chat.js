(() => {
  const container = document.querySelector('.chat-layout');
  if (!container) return;

  const currentUserId = container.getAttribute('data-current-user');
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  const roomList = document.querySelector('[data-room-list]');
  const dmList = document.querySelector('[data-dm-list]');
  const messagesContainer = document.querySelector('[data-messages]');
  const form = document.querySelector('[data-chat-form]');
  const activeChannelHeading = document.querySelector('[data-active-channel]');
  const typingIndicator = document.querySelector('[data-typing]');
  const statusIndicator = document.querySelector('[data-chat-status]');

  const socket = window.io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true,
    reconnectionAttempts: 6
  });

  let activeRoom = 'lobby';
  let activeDm = null;
  let typingTimeout;

  const formatTimestamp = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const setStatus = (state, label) => {
    if (!statusIndicator) return;
    statusIndicator.textContent = label;
    statusIndicator.classList.toggle('is-online', state === 'online');
    statusIndicator.classList.toggle('is-offline', state !== 'online');
  };

  setStatus('offline', 'Connecting…');

  const renderMessage = (message) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('chat-message');
    if (message.fromUserId === currentUserId) {
      wrapper.classList.add('is-self');
    }
    const meta = document.createElement('div');
    meta.classList.add('meta');
    meta.textContent = `${message.sender?.name || message.fromUserId} · ${formatTimestamp(message.createdAt)}`;
    const body = document.createElement('p');
    body.textContent = message.body;
    wrapper.append(meta, body);
    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const clearMessages = () => {
    messagesContainer.innerHTML = '';
  };

  const loadRoomHistory = async (room) => {
    const response = await fetch(`/chat/history?room=${encodeURIComponent(room)}`, {
      headers: { 'CSRF-Token': csrfToken }
    });
    const data = await response.json();
    clearMessages();
    data.messages.forEach(renderMessage);
  };

  const loadDmHistory = async (userId) => {
    const response = await fetch(`/chat/dm/${encodeURIComponent(userId)}`, {
      headers: { 'CSRF-Token': csrfToken }
    });
    const data = await response.json();
    clearMessages();
    data.messages.forEach(renderMessage);
  };

  roomList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-room]');
    if (!button) return;
    roomList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    activeRoom = button.getAttribute('data-room');
    activeDm = null;
    activeChannelHeading.textContent = button.textContent.trim();
    loadRoomHistory(activeRoom);
  });

  dmList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-dm]');
    if (!button) return;
    dmList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    activeDm = button.getAttribute('data-dm');
    activeRoom = `dm-${[currentUserId, activeDm].sort().join(':')}`;
    activeChannelHeading.textContent = `DM · ${button.textContent.trim()}`;
    socket.emit('join:dm', activeDm);
    loadDmHistory(activeDm);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const body = form.message.value.trim();
    if (!body) return;
    socket.emit(
      'chat:message',
      {
        room: activeDm ? activeRoom : activeRoom,
        toUserId: activeDm,
        body
      },
      (response) => {
        if (response?.error) {
          alert(response.error);
        }
      }
    );
    form.reset();
  });

  form?.message.addEventListener('input', () => {
    socket.emit('typing', { room: activeRoom });
  });

  socket.on('chat:message', (message) => {
    renderMessage(message);
  });

  socket.on('connect', () => {
    setStatus('online', 'Live');
  });

  socket.on('disconnect', () => {
    setStatus('offline', 'Reconnecting…');
  });

  socket.on('connect_error', () => {
    setStatus('offline', 'Connection issue');
  });

  socket.io.on('reconnect_attempt', () => {
    setStatus('offline', 'Reconnecting…');
  });

  socket.io.on('reconnect_failed', () => {
    setStatus('offline', 'Offline');
  });

  socket.io.on('error', () => {
    setStatus('offline', 'Connection issue');
  });

  socket.on('typing', ({ userId, room }) => {
    if (room !== activeRoom || userId === currentUserId) return;
    typingIndicator.textContent = 'Someone is typing…';
    typingIndicator.hidden = false;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.hidden = true;
    }, 1200);
  });

  socket.on('presence:init', (onlineIds) => {
    document.querySelectorAll('[data-presence-indicator]').forEach((indicator) => {
      const id = indicator.getAttribute('data-presence-indicator');
      indicator.classList.toggle('is-online', onlineIds.includes(id));
    });
  });

  socket.on('presence', ({ userId, status }) => {
    const indicator = document.querySelector(`[data-presence-indicator="${userId}"]`);
    if (indicator) {
      indicator.classList.toggle('is-online', status === 'online');
    }
  });

  // Initial load
  loadRoomHistory('lobby');
})();
