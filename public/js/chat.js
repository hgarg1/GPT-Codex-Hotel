(() => {
  const container = document.querySelector('.chat-layout');
  if (!container) return;

  const currentUserId = container.getAttribute('data-current-user');
  const encryptionKeyBase64 = container.getAttribute('data-encryption-key') || '';
  const supportsWebCrypto = typeof window.crypto !== 'undefined' && !!window.crypto.subtle;
  let transitKeyPromise = null;
  const reactionSetAttr = container.getAttribute('data-reaction-set') || '[]';
  let allowedReactions;
  try {
    const parsed = JSON.parse(reactionSetAttr);
    allowedReactions = Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (error) {
    allowedReactions = null;
  }
  const REACTIONS = allowedReactions || ['😀', '😍', '😮', '😢', '😡', '👍'];

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
  const fileInput = form?.querySelector('[data-file-input]');
  const fileIndicator = form?.querySelector('[data-file-indicator]');

  let socket = window.skyhavenSocket;
  if (!socket) {
    socket = window.io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnectionAttempts: 6
    });
    window.skyhavenSocket = socket;
  }

  let activeRoom = 'lobby';
  let activeDm = null;
  let typingTimeout;
  let suggestionAbortController = null;
  let onlineUsers = new Set();
  const messageNodes = new Map();
  const STORAGE_KEY = 'skyhaven.chat.context';

  const formatTimestamp = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  };

  const setStatus = (state, label) => {
    if (!statusIndicator) return;
    statusIndicator.textContent = label;
    statusIndicator.classList.toggle('is-online', state === 'online');
    statusIndicator.classList.toggle('is-offline', state !== 'online');
  };

  const base64ToArrayBuffer = (base64) => {
    const normalized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    const binary = atob(normalized);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  };

  const getTransitKey = () => {
    if (!supportsWebCrypto || !encryptionKeyBase64) {
      return null;
    }
    if (!transitKeyPromise) {
      const raw = base64ToArrayBuffer(encryptionKeyBase64);
      transitKeyPromise = window.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    }
    return transitKeyPromise;
  };

  const encryptForTransit = async (buffer) => {
    try {
      const key = await getTransitKey();
      if (!key) {
        return { data: arrayBufferToBase64(buffer), encrypted: false };
      }
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
      const encryptedBytes = new Uint8Array(encrypted);
      const tag = encryptedBytes.slice(-16);
      const ciphertext = encryptedBytes.slice(0, -16);
      const combined = new Uint8Array(iv.length + tag.length + ciphertext.length);
      combined.set(iv, 0);
      combined.set(tag, iv.length);
      combined.set(ciphertext, iv.length + tag.length);
      return { data: arrayBufferToBase64(combined.buffer), encrypted: true };
    } catch (error) {
      return { data: arrayBufferToBase64(buffer), encrypted: false };
    }
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

  const fileState = {
    clear() {
      if (fileInput) {
        fileInput.value = '';
      }
      if (fileIndicator) {
        fileIndicator.hidden = true;
        fileIndicator.textContent = 'No file selected';
      }
    },
    update() {
      if (!fileIndicator || !fileInput) return;
      if (!fileInput.files || fileInput.files.length === 0) {
        fileIndicator.hidden = true;
        fileIndicator.textContent = 'No file selected';
        return;
      }
      const file = fileInput.files[0];
      fileIndicator.hidden = false;
      fileIndicator.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    }
  };

  fileState.clear();

  const createAttachmentNode = (attachment) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('chat-attachment');
    const url = `/chat/attachments/${attachment.id}`;
    if (attachment.mimeType?.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = attachment.filename;
      img.loading = 'lazy';
      wrapper.appendChild(img);
    } else if (attachment.mimeType === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = attachment.filename;
      frame.setAttribute('loading', 'lazy');
      wrapper.appendChild(frame);
    } else {
      const link = document.createElement('a');
      link.href = `${url}?download=1`;
      link.classList.add('chat-attachment-link');
      const sizeLabel = formatFileSize(Number(attachment.size));
      link.textContent = sizeLabel ? `${attachment.filename} · ${sizeLabel}` : attachment.filename;
      link.setAttribute('download', attachment.filename);
      wrapper.appendChild(link);
    }
    return wrapper;
  };

  const updateReactionSummary = (messageId, reactions) => {
    const messageNode = messageNodes.get(messageId);
    if (!messageNode) return;
    const totalsContainer = messageNode.querySelector('[data-reaction-totals]');
    if (!totalsContainer) return;
    totalsContainer.innerHTML = '';
    reactions
      .filter((entry) => Number(entry.count) > 0)
      .forEach((entry) => {
        const pill = document.createElement('span');
        pill.classList.add('chat-reaction-pill');
        pill.dataset.emoji = entry.emoji;
        pill.textContent = `${entry.emoji} ${entry.count}`;
        totalsContainer.appendChild(pill);
      });
    totalsContainer.hidden = totalsContainer.childElementCount === 0;
  };

  const setViewerReaction = (messageId, emoji) => {
    const messageNode = messageNodes.get(messageId);
    if (!messageNode) return;
    messageNode.dataset.viewerReaction = emoji || '';
    messageNode
      .querySelectorAll('button[data-reaction-emoji]')
      .forEach((button) => {
        button.classList.toggle('is-active', button.dataset.reactionEmoji === emoji);
      });
  };

  const buildReactionControls = (messageId) => {
    const bar = document.createElement('div');
    bar.classList.add('chat-reaction-bar');
    const options = document.createElement('div');
    options.classList.add('chat-reaction-options');
    REACTIONS.forEach((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.reactionEmoji = emoji;
      button.textContent = emoji;
      options.appendChild(button);
    });
    const totals = document.createElement('div');
    totals.classList.add('chat-reaction-totals');
    totals.dataset.reactionTotals = '';
    totals.hidden = true;
    bar.append(options, totals);
    return bar;
  };

  const renderMessage = (message, { requestSuggestions: shouldRequest = true } = {}) => {
    if (!message || !message.id) return;
    if (messageNodes.has(message.id)) {
      updateReactionSummary(message.id, message.reactions || []);
      setViewerReaction(message.id, message.viewerReaction || '');
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.classList.add('chat-message');
    wrapper.dataset.messageId = message.id;
    wrapper.dataset.createdAt = message.createdAt;
    wrapper.dataset.viewerReaction = message.viewerReaction || '';
    if (message.fromUserId === currentUserId) {
      wrapper.classList.add('is-self');
    }
    const meta = document.createElement('div');
    meta.classList.add('meta');
    meta.textContent = `${message.sender?.name || message.fromUserId} · ${formatTimestamp(message.createdAt)}`;
    const body = document.createElement('div');
    body.classList.add('body');
    const text = document.createElement('p');
    text.textContent = message.body || '';
    body.appendChild(text);
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const attachmentsWrapper = document.createElement('div');
      attachmentsWrapper.classList.add('chat-attachments');
      message.attachments.forEach((attachment) => {
        attachmentsWrapper.appendChild(createAttachmentNode(attachment));
      });
      body.appendChild(attachmentsWrapper);
    }
    const reactionsBar = buildReactionControls(message.id);
    wrapper.append(meta, body, reactionsBar);
    messageNodes.set(message.id, wrapper);
    messagesContainer.appendChild(wrapper);
    updateReactionSummary(message.id, message.reactions || []);
    setViewerReaction(message.id, message.viewerReaction || '');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (shouldRequest && message.body) {
      requestSuggestions(message);
    }
  };

  const clearMessages = () => {
    messageNodes.clear();
    messagesContainer.innerHTML = '';
  };

  const sendSeenUpdate = () => {
    const lastMessage = messagesContainer.querySelector('[data-message-id]:last-child');
    if (!lastMessage) return;
    const createdAt = lastMessage.getAttribute('data-created-at');
    socket.emit('chat:seen', { room: activeRoom, lastSeenAt: createdAt });
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
      if (data.messages.length > 0) {
        sendSeenUpdate();
      }
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
      if (data.messages.length > 0) {
        sendSeenUpdate();
      }
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

  const setActiveRoom = (roomId, dmId = null, labelText = null) => {
    activeRoom = roomId;
    activeDm = dmId;
    container.setAttribute('data-active-room', roomId);
    container.setAttribute('data-active-dm', dmId || '');
    if (labelText && activeChannelHeading) {
      activeChannelHeading.textContent = labelText;
    }
    persistContext();
  };

  const selectDm = (userId, displayName) => {
    if (!dmList) return;
    dmList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    const button = ensureDmButton({ id: userId, name: displayName });
    if (button) {
      button.classList.add('active');
    }
    const roomId = `dm-${[currentUserId, userId].sort().join(':')}`;
    setActiveRoom(roomId, userId, `DM · ${displayName}`);
    socket.emit('join:dm', userId);
    loadDmHistory(userId);
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

  const encodeFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const payload = await encryptForTransit(buffer);
    return {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      data: payload.data,
      encrypted: payload.encrypted
    };
  };

  roomList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-room]');
    if (!button) return;
    roomList.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    const room = button.getAttribute('data-room');
    setActiveRoom(room, null, button.textContent.trim());
    loadRoomHistory(room);
    clearSuggestions();
  });

  dmList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-dm]');
    if (!button) return;
    const name = button.dataset.displayName || button.textContent.trim();
    selectDm(button.dataset.dm, name);
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.pending === 'true') return;
    const text = form.message.value.trim();
    const file = fileInput?.files?.[0];
    if (!text && !file) return;
    form.dataset.pending = 'true';
    try {
      const payload = {
        room: activeRoom,
        toUserId: activeDm,
        body: text
      };
      if (file) {
        payload.attachment = await encodeFile(file);
      }
      socket.emit('chat:message', payload, (response) => {
        form.dataset.pending = 'false';
        if (response?.error) {
          alert(response.error);
          return;
        }
        form.reset();
        fileState.clear();
        clearSuggestions();
      });
    } catch (error) {
      form.dataset.pending = 'false';
      alert('Unable to send attachment.');
    }
  });

  form?.message.addEventListener('input', () => {
    socket.emit('typing', { room: activeRoom });
  });

  fileInput?.addEventListener('change', () => fileState.update());

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

  messagesContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-reaction-emoji]');
    if (!button) return;
    const messageNode = button.closest('[data-message-id]');
    if (!messageNode) return;
    const messageId = messageNode.getAttribute('data-message-id');
    const emoji = button.dataset.reactionEmoji;
    socket.emit('chat:react', { messageId, emoji }, (response) => {
      if (response?.error) {
        alert(response.error);
      }
    });
  });

  const handleIncomingMessage = (message) => {
    if (!message || !message.room) return;
    if (message.room !== activeRoom) {
      if (message.toUserId === currentUserId) {
        ensureDmButton({ id: message.fromUserId, name: message.sender?.name || message.fromUserId });
      }
      return;
    }
    renderMessage(message);
    if (message.fromUserId !== currentUserId) {
      sendSeenUpdate();
    }
  };

  const handleReactionUpdate = ({ messageId, reactions, userId, emoji }) => {
    if (!messageId) return;
    updateReactionSummary(messageId, reactions || []);
    if (userId === currentUserId) {
      setViewerReaction(messageId, emoji || '');
    }
  };

  const handleTyping = ({ userId, room }) => {
    if (room !== activeRoom || userId === currentUserId) return;
    typingIndicator.textContent = 'Someone is typing…';
    typingIndicator.hidden = false;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.hidden = true;
    }, 1200);
  };

  socket.off('chat:message', handleIncomingMessage);
  socket.on('chat:message', handleIncomingMessage);

  socket.off('chat:reaction', handleReactionUpdate);
  socket.on('chat:reaction', handleReactionUpdate);

  socket.off('typing', handleTyping);
  socket.on('typing', handleTyping);

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

  loadRoomHistory('lobby').then(() => {
    restoreContext();
  });
})();
