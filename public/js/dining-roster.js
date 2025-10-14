(function () {
  const root = document.querySelector('[data-dining-roster]');
  if (!root) return;

  const searchInput = root.querySelector('[data-roster-search]');
  const roleButtons = Array.from(root.querySelectorAll('[data-role-filter]'));
  const sortToggle = root.querySelector('[data-roster-sort]');
  const sortLabel = root.querySelector('[data-sort-label]');
  const clearPinsButton = root.querySelector('[data-clear-pins]');
  const countEl = root.querySelector('[data-roster-count]');
  const list = root.querySelector('[data-roster-list]');
  if (!list) return;

  const cards = Array.from(list.querySelectorAll('[data-roster-card]'));
  const storageKey = 'dining-roster:pins';
  let pinnedSet = new Set();

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey));
    if (Array.isArray(stored)) {
      pinnedSet = new Set(stored);
    }
  } catch (error) {
    pinnedSet = new Set();
  }

  const state = {
    role: 'all',
    query: '',
    sort: 'alpha'
  };

  const relativeFormatter =
    typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined'
      ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
      : null;

  function savePins() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(pinnedSet)));
    } catch (error) {
      // Ignore storage issues (private mode, quota, etc.).
    }
  }

  function updateCount(visible) {
    if (!countEl) return;
    const total = cards.length;
    const descriptor = total === 1 ? 'culinary artist' : 'culinary artists';
    countEl.textContent = `${visible} of ${total} ${descriptor} visible`;
  }

  function applyFilters() {
    const query = state.query.trim();
    let visible = 0;

    cards.forEach((card) => {
      const role = card.dataset.role || '';
      const haystack = `${card.dataset.name || ''} ${role} ${card.dataset.badges || ''}`;
      const matchesRole = state.role === 'all' || role === state.role;
      const matchesQuery = !query || haystack.includes(query);
      const shouldShow = matchesRole && matchesQuery;

      card.classList.toggle('is-hidden', !shouldShow);
      card.setAttribute('aria-hidden', String(!shouldShow));
      if (shouldShow) {
        visible += 1;
      }
    });

    updateCount(visible);
  }

  function sortCards() {
    const sorted = cards.slice().sort((a, b) => {
      const aPinned = pinnedSet.has(a.dataset.id);
      const bPinned = pinnedSet.has(b.dataset.id);
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }

      if (state.sort === 'shift') {
        const aShift = Date.parse(a.dataset.shift || '');
        const bShift = Date.parse(b.dataset.shift || '');
        if (!Number.isNaN(aShift) && !Number.isNaN(bShift) && aShift !== bShift) {
          return aShift - bShift;
        }
      }

      const aName = a.dataset.name || '';
      const bName = b.dataset.name || '';
      return aName.localeCompare(bName);
    });

    sorted.forEach((card) => {
      list.appendChild(card);
    });
  }

  function updateCountdown() {
    const now = Date.now();

    cards.forEach((card) => {
      const countdownEl = card.querySelector('[data-countdown]');
      if (!countdownEl) return;

      const shift = Date.parse(card.dataset.shift || '');
      if (Number.isNaN(shift)) {
        countdownEl.textContent = 'Shift timing pending';
        return;
      }

      const diff = shift - now;
      if (Math.abs(diff) < 60000) {
        countdownEl.textContent = 'In service now';
        return;
      }

      if (relativeFormatter) {
        const thresholds = [
          { unit: 'day', value: 86400000 },
          { unit: 'hour', value: 3600000 },
          { unit: 'minute', value: 60000 }
        ];
        for (const threshold of thresholds) {
          if (Math.abs(diff) >= threshold.value || threshold.unit === 'minute') {
            const value = Math.round(diff / threshold.value);
            countdownEl.textContent = relativeFormatter.format(value, threshold.unit);
            return;
          }
        }
      }

      const minutes = Math.round(Math.abs(diff) / 60000);
      if (minutes >= 60) {
        const hours = Math.round(minutes / 60);
        countdownEl.textContent = diff > 0 ? `in ${hours}h` : `${hours}h ago`;
      } else {
        countdownEl.textContent = diff > 0 ? `in ${minutes}m` : `${minutes}m ago`;
      }
    });
  }

  function togglePin(card, button) {
    const id = card.dataset.id;
    if (!id) return;

    const wasPinned = pinnedSet.has(id);
    if (wasPinned) {
      pinnedSet.delete(id);
    } else {
      pinnedSet.add(id);
    }

    card.classList.toggle('is-pinned', !wasPinned);
    if (button) {
      button.setAttribute('aria-pressed', String(!wasPinned));
      button.textContent = !wasPinned ? '★' : '☆';
    }

    savePins();
    sortCards();
  }

  cards.forEach((card) => {
    const pinButton = card.querySelector('[data-pin]');
    const id = card.dataset.id;
    if (pinButton) {
      const isPinned = pinnedSet.has(id);
      card.classList.toggle('is-pinned', isPinned);
      pinButton.setAttribute('aria-pressed', String(isPinned));
      pinButton.textContent = isPinned ? '★' : '☆';
      pinButton.addEventListener('click', () => togglePin(card, pinButton));
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      state.query = event.target.value.toLowerCase();
      applyFilters();
    });
  }

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.roleFilter || 'all';
      state.role = value;
      roleButtons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
      applyFilters();
      sortCards();
    });
  });

  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      state.sort = sortToggle.checked ? 'shift' : 'alpha';
      if (sortLabel) {
        sortLabel.textContent = sortToggle.checked ? 'Upcoming shifts' : 'Alphabetical order';
      }
      sortCards();
    });
  }

  if (clearPinsButton) {
    clearPinsButton.addEventListener('click', () => {
      pinnedSet.clear();
      cards.forEach((card) => {
        card.classList.remove('is-pinned');
        const button = card.querySelector('[data-pin]');
        if (button) {
          button.setAttribute('aria-pressed', 'false');
          button.textContent = '☆';
        }
      });
      savePins();
      sortCards();
    });
  }

  applyFilters();
  sortCards();
  updateCountdown();
  window.setInterval(updateCountdown, 60000);
})();
