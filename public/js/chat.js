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
  const suggestionContainer = document.querySelector('[data-suggestions]');
  const suggestionList = document.querySelector('[data-suggestion-list]');
  const sentimentLabel = document.querySelector('[data-sentiment-label]');
  const searchInput = document.querySelector('[data-user-search]');
  const searchResults = document.querySelector('[data-search-results]');
  const emptyDmMessage = document.querySelector('[data-empty-dm]');

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
  let suggestionAbortController = null;
  let onlineUsers = new Set();
  const STORAGE_KEY = 'skyhaven.chat.context';

  const formatTimestamp = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const setStatus = (state, label) => {
    if (!statusIndicator) return;
    statusIndicator.textContent = label;
    statusIndicator.classList.toggle('is-online', state === 'online');
    statusIndicator.classList.toggle('is-offline', state !== 'online');
  };

  setStatus('offline', 'Connecting…');

  const clearSuggestions = () => {
    if (!suggestionContainer) return;
    suggestionContainer.hidden = true;
    suggestionList.innerHTML = '';
    if (sentimentLabel) {
      sentimentLabel.textContent = '';
    }
  };

  const showSuggestions = (sentiment, suggestions) => {
    if (!suggestionContainer || !suggestionList) return;
    suggestionList.innerHTML = '';
    if (!suggestions || suggestions.length === 0) {
      clearSuggestions();
      return;
    }
    suggestions.forEach((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('data-suggestion', text);
      suggestionList.appendChild(button);
    });
    if (sentimentLabel) {
      sentimentLabel.textContent = sentiment === 'neutral' ? 'balanced tone' : `${sentiment} tone`;
    }
    suggestionContainer.hidden = false;
  };

  const requestSuggestions = async (message) => {
    if (!suggestionContainer || !message?.body) return;
    if (message.room !== activeRoom) return;
    if (message.fromUserId === currentUserId) return;
    suggestionAbortController?.abort();
    suggestionAbortController = new AbortController();
    try {
      const response = await fetch('/chat/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        signal: suggestionAbortController.signal,
        body: JSON.stringify({
          message: message.body,
          partnerName: message.sender?.name || ''
        })
      });
      if (!response.ok) {
        throw new Error('Unable to load suggestions');
      }
      const data = await response.json();
      showSuggestions(data.sentiment, data.suggestions);
    } catch (error) {
      if (error.name === 'AbortError') return;
      clearSuggestions();
    }
  };

  const renderMessage = (message, { requestSuggestions: shouldRequest = true } = {}) => {
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
    if (shouldRequest) {
      requestSuggestions(message);
    }
  };

  const clearMessages = () => {
    messagesContainer.innerHTML = '';
  };

  const loadRoomHistory = async (room) => {
    try {
      const response = await fetch(`/chat/history?room=${encodeURIComponent(room)}`, {
        headers: { 'CSRF-Token': csrfToken }
      });
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      clearMessages();
      clearSuggestions();
      data.messages.forEach((message, index) => {
        renderMessage(message, { requestSuggestions: index === data.messages.length - 1 });
      });
    } catch (error) {
      clearMessages();
      clearSuggestions();
    }
  };

  const loadDmHistory = async (userId) => {
    try {
      const response = await fetch(`/chat/dm/${encodeURIComponent(userId)}`, {
        headers: { 'CSRF-Token': csrfToken }
      });
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      clearMessages();
      clearSuggestions();
      data.messages.forEach((message, index) => {
        renderMessage(message, { requestSuggestions: index === data.messages.length - 1 });
      });
    } catch (error) {
      clearMessages();
      clearSuggestions();
    }
  };

  const persistContext = () => {
    if (!window.localStorage) return;
    const payload = {
      type: activeDm ? 'dm' : 'room',
      id: activeDm ? activeDm : activeRoom,
      label: activeChannelHeading?.textContent?.trim()
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // ignore quota errors
    }
  };

  const restoreContext = () => {
    if (!window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.type === 'dm' && payload.id) {
        const button = dmList?.querySelector(`button[data-dm="${payload.id}"]`);
        if (button) {
          button.click();
          return;
        }
      }
      if (payload.type === 'room' && payload.id) {
        const button = roomList?.querySelector(`button[data-room="${payload.id}"]`);
        if (button) {
          button.click();
        }
      }
    } catch (error) {
      // ignore invalid payloads
    }
  };

  const createPresenceIndicator = (userId) => {
    const span = document.createElement('span');
    span.classList.add('presence-indicator');
    span.setAttribute('data-presence-indicator', userId);
    span.classList.toggle('is-online', onlineUsers.has(userId));
    return span;
  };

  const ensureDmButton = (user) => {
    if (!dmList) return null;
    let button = dmList.querySelector(`button[data-dm="${user.id}"]`);
    if (button) {
      return button;
    }
    const li = document.createElement('li');
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.dm = user.id;
    button.dataset.displayName = user.name;
    button.appendChild(createPresenceIndicator(user.id));
    const label = document.createElement('span');
    label.textContent = user.name;
    button.appendChild(label);
    li.appendChild(button);
    dmList.appendChild(li);
    if (emptyDmMessage) {
      emptyDmMessage.hidden = true;
    }
    return button;
  };

  const selectDm = (userId, displayName) => {
    if (!dmList) return;
    dmList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    const button = ensureDmButton({ id: userId, name: displayName });
    if (button) {
      button.classList.add('active');
    }
    activeDm = userId;
    activeRoom = `dm-${[currentUserId, activeDm].sort().join(':')}`;
    activeChannelHeading.textContent = `DM · ${displayName}`;
    socket.emit('join:dm', activeDm);
    loadDmHistory(activeDm);
    persistContext();
  };

  const hideSearchResults = () => {
    if (!searchResults) return;
    searchResults.hidden = true;
    searchResults.innerHTML = '';
  };

  const performSearch = async (term) => {
    if (!searchResults) return;
    if (!term || term.length < 2) {
      hideSearchResults();
      return;
    }
    try {
      const response = await fetch(`/chat/users?query=${encodeURIComponent(term)}`, {
        headers: { 'CSRF-Token': csrfToken }
      });
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      searchResults.innerHTML = '';
      if (!data.users || data.users.length === 0) {
        const empty = document.createElement('li');
        empty.textContent = 'No matches found.';
        searchResults.appendChild(empty);
      } else {
        data.users.forEach((user) => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.userId = user.id;
          button.dataset.userName = user.name;
          button.appendChild(createPresenceIndicator(user.id));
          const nameSpan = document.createElement('span');
          nameSpan.textContent = user.name;
          button.appendChild(nameSpan);
          const role = document.createElement('small');
          role.textContent = user.role;
          role.style.marginLeft = 'auto';
          role.style.opacity = '0.65';
          button.appendChild(role);
          li.appendChild(button);
          searchResults.appendChild(li);
        });
      }
      searchResults.hidden = false;
    } catch (error) {
      hideSearchResults();
    }
  };

  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const debouncedSearch = debounce(performSearch, 220);

  roomList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-room]');
    if (!button) return;
    roomList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    activeRoom = button.getAttribute('data-room');
    activeDm = null;
    activeChannelHeading.textContent = button.textContent.trim();
    loadRoomHistory(activeRoom);
    clearSuggestions();
    persistContext();
  });

  dmList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-dm]');
    if (!button) return;
    const name = button.dataset.displayName || button.textContent.trim();
    selectDm(button.dataset.dm, name);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const body = form.message.value.trim();
    if (!body) return;
    socket.emit(
      'chat:message',
      {
        room: activeRoom,
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
    clearSuggestions();
  });

  form?.message.addEventListener('input', () => {
    socket.emit('typing', { room: activeRoom });
  });

  searchInput?.addEventListener('input', (event) => {
    const term = event.target.value.trim();
    debouncedSearch(term);
  });

  searchResults?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-user-id]');
    if (!button) return;
    const userId = button.dataset.userId;
    const name = button.dataset.userName;
    hideSearchResults();
    searchInput.value = '';
    selectDm(userId, name);
  });

  suggestionList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-suggestion]');
    if (!button || !form?.message) return;
    form.message.value = button.getAttribute('data-suggestion');
    form.message.focus();
  });

  document.addEventListener('click', (event) => {
    if (!searchResults || searchResults.hidden) return;
    if (searchInput && event.target === searchInput) return;
    if (searchResults.contains(event.target)) return;
    hideSearchResults();
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
    onlineUsers = new Set(onlineIds);
    document.querySelectorAll('[data-presence-indicator]').forEach((indicator) => {
      const id = indicator.getAttribute('data-presence-indicator');
      indicator.classList.toggle('is-online', onlineUsers.has(id));
    });
  });

  socket.on('presence', ({ userId, status }) => {
    if (status === 'online') {
      onlineUsers.add(userId);
    } else {
      onlineUsers.delete(userId);
    }
    const indicator = document.querySelector(`[data-presence-indicator="${userId}"]`);
    if (indicator) {
      indicator.classList.toggle('is-online', status === 'online');
    }
  });

  // Initial load
  loadRoomHistory('lobby').then(() => {
    restoreContext();
  });
})();
