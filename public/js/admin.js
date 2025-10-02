(() => {
  const inquiryList = document.querySelector('[data-inquiry-list]');
  if (!inquiryList || typeof window.io !== 'function') {
    return;
  }

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const badge = document.querySelector('[data-inquiry-badge]');
  const badgeValue = badge?.querySelector('[data-inquiry-count]');

  const parseCount = () => {
    if (!badge) return 0;
    const stored = badge.getAttribute('data-open-count');
    const fromText = badgeValue?.textContent?.trim();
    const candidate = Number.parseInt(stored ?? fromText ?? '0', 10);
    return Number.isNaN(candidate) ? 0 : candidate;
  };

  const updateBadge = (next) => {
    if (!badge || !badgeValue) return;
    const safe = Math.max(0, next);
    badge.setAttribute('data-open-count', String(safe));
    badgeValue.textContent = String(safe);
  };

  const formatTimestamp = (iso) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return iso;
    }
  };

  const createHiddenInput = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  };

  const renderInquiry = (inquiry) => {
    const card = document.createElement('li');
    card.className = 'inquiry-card';
    card.dataset.inquiryId = inquiry.id;
    if (inquiry.status === 'resolved') {
      card.classList.add('is-resolved');
    } else {
      card.classList.add('is-new');
    }

    const header = document.createElement('header');
    header.className = 'inquiry-header';

    const stack = document.createElement('div');
    stack.className = 'stacked';

    const nameEl = document.createElement('strong');
    nameEl.textContent = inquiry.name;
    const emailEl = document.createElement('span');
    emailEl.className = 'muted';
    emailEl.textContent = inquiry.email;

    stack.append(nameEl, emailEl);

    const statusChip = document.createElement('span');
    statusChip.className = `status-chip status-${inquiry.status}`;
    statusChip.textContent = inquiry.status;

    header.append(stack, statusChip);

    const message = document.createElement('p');
    message.textContent = inquiry.message;

    const footer = document.createElement('footer');
    footer.className = 'inquiry-footer';

    const meta = document.createElement('small');
    meta.className = 'muted';
    meta.textContent = `Received ${formatTimestamp(inquiry.receivedAt)}`;
    if (inquiry.status === 'resolved' && inquiry.resolvedAt) {
      meta.textContent += ` • Resolved ${formatTimestamp(inquiry.resolvedAt)}`;
    }

    const form = document.createElement('form');
    form.className = 'inline-form';
    form.method = 'post';
    form.action = `/admin/inquiries/${inquiry.id}/status`;
    form.append(createHiddenInput('_csrf', csrfToken));
    form.append(createHiddenInput('status', inquiry.status === 'resolved' ? 'open' : 'resolved'));

    const button = document.createElement('button');
    button.type = 'submit';
    button.className = `pill-link ${inquiry.status === 'resolved' ? 'secondary' : 'primary'}`;
    button.textContent = inquiry.status === 'resolved' ? 'Reopen' : 'Mark resolved';

    form.append(button);
    footer.append(meta, form);

    card.append(header, message, footer);
    return card;
  };

  const removeEmptyState = () => {
    const empty = inquiryList.querySelector('[data-empty]');
    if (empty) {
      empty.remove();
    }
  };

  const socket = window.io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    socket.emit('admin:subscribe', 'inquiries');
  });

  socket.on('inquiry:new', (inquiry) => {
    removeEmptyState();
    const card = renderInquiry(inquiry);
    inquiryList.prepend(card);
    const current = parseCount();
    if (inquiry.status !== 'resolved') {
      updateBadge(current + 1);
    }
    card.addEventListener(
      'animationend',
      () => {
        card.classList.remove('is-new');
      },
      { once: true }
    );
  });
})();
