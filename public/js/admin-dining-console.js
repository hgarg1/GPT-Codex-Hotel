(function () {
  const root = document.querySelector('[data-dining-console]');
  if (!root) return;

  const seatBoard = root.querySelector('[data-seat-board]');
  const seatButtons = Array.from(root.querySelectorAll('[data-seat-id]'));
  const filterButtons = Array.from(root.querySelectorAll('[data-seat-filter]'));
  const clusterToggle = root.querySelector('[data-seat-cluster]');
  const refreshButton = root.querySelector('[data-seat-refresh]');
  const simulateButton = root.querySelector('[data-seat-randomize]');
  const seatCountEl = root.querySelector('[data-seat-count]');
  const summaryItems = Array.from(root.querySelectorAll('[data-status-count]'));
  const roleToggles = Array.from(root.querySelectorAll('[data-role-toggle]'));
  const coverageCards = Array.from(root.querySelectorAll('[data-coverage-card]'));
  const shiftButtons = Array.from(root.querySelectorAll('[data-toggle-shift]'));

  if (!seatBoard || !seatButtons.length) return;

  const defaultOrder = seatButtons.slice();
  const initialStatuses = new Map();
  seatButtons.forEach((button) => {
    initialStatuses.set(button.dataset.seatId, button.dataset.seatStatus || 'available');
  });

  let activeFilter = 'all';

  function updateSeatCount() {
    if (!seatCountEl) return;
    const visible = seatButtons.filter((btn) => !btn.classList.contains('is-hidden')).length;
    seatCountEl.textContent = `${visible} / ${seatButtons.length}`;
  }

  function updateSeatSummary() {
    const counts = seatButtons.reduce((acc, button) => {
      if (button.classList.contains('is-hidden')) {
        return acc;
      }
      const status = button.dataset.seatStatus || 'available';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    summaryItems.forEach((item) => {
      const status = item.dataset.statusCount;
      if (!status) return;
      item.textContent = counts[status] || 0;
    });
  }

  function setSeatStatus(button, status) {
    const previous = button.dataset.seatStatus;
    button.classList.remove(`status-${previous}`);
    button.dataset.seatStatus = status;
    button.classList.add(`status-${status}`);
  }

  function flash(button) {
    button.classList.remove('is-updated');
    // trigger reflow for restart animation
    void button.offsetWidth;
    button.classList.add('is-updated');
  }

  function cycleSeat(button) {
    const statuses = ['available', 'held', 'reserved'];
    const current = button.dataset.seatStatus || 'available';
    const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
    setSeatStatus(button, next);
    flash(button);
    applyFilter(activeFilter);
  }

  function applyFilter(filter) {
    activeFilter = filter;
    seatButtons.forEach((button) => {
      const matches = filter === 'all' || button.dataset.seatStatus === filter;
      button.classList.toggle('is-hidden', !matches);
    });
    updateSeatCount();
    updateSeatSummary();
  }

  function sortSeats(comparator) {
    const sorted = seatButtons.slice().sort(comparator);
    sorted.forEach((button) => seatBoard.appendChild(button));
  }

  function alphabetComparator(a, b) {
    const aLabel = a.dataset.seatLabel || '';
    const bLabel = b.dataset.seatLabel || '';
    return aLabel.localeCompare(bLabel);
  }

  function zoneComparator(a, b) {
    const aZone = (a.dataset.seatZone || '').toLowerCase();
    const bZone = (b.dataset.seatZone || '').toLowerCase();
    if (aZone !== bZone) {
      return aZone.localeCompare(bZone);
    }
    return alphabetComparator(a, b);
  }

  function resetSnapshot() {
    defaultOrder.forEach((button) => {
      const status = initialStatuses.get(button.dataset.seatId) || 'available';
      setSeatStatus(button, status);
      button.classList.remove('is-hidden', 'is-updated');
      seatBoard.appendChild(button);
    });

    filterButtons.forEach((btn) => {
      const isActive = btn.dataset.seatFilter === 'all';
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    activeFilter = 'all';

    if (clusterToggle) {
      clusterToggle.checked = false;
    }

    updateSeatCount();
    updateSeatSummary();
  }

  function simulateRush() {
    const statuses = ['available', 'held', 'reserved'];
    seatButtons.forEach((button) => {
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      setSeatStatus(button, randomStatus);
      flash(button);
    });
    applyFilter(activeFilter);
  }

  function updateCoverageCountdown() {
    const now = Date.now();
    coverageCards.forEach((card) => {
      const countdown = card.querySelector('[data-coverage-countdown]');
      if (!countdown) return;
      const shift = Date.parse(card.dataset.shift || '');
      if (Number.isNaN(shift)) {
        countdown.textContent = 'Shift timing pending';
        return;
      }
      const diff = shift - now;
      if (Math.abs(diff) < 60000) {
        countdown.textContent = 'On deck';
        return;
      }
      const minutes = Math.round(Math.abs(diff) / 60000);
      if (minutes >= 60) {
        const hours = Math.round(minutes / 60);
        countdown.textContent = diff > 0 ? `in ${hours}h` : `${hours}h ago`;
      } else {
        countdown.textContent = diff > 0 ? `in ${minutes}m` : `${minutes}m ago`;
      }
    });
  }

  seatButtons.forEach((button) => {
    button.addEventListener('click', () => cycleSeat(button));
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.seatFilter || 'all';
      filterButtons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
      applyFilter(filter);
    });
  });

  if (clusterToggle) {
    clusterToggle.addEventListener('change', () => {
      sortSeats(clusterToggle.checked ? zoneComparator : alphabetComparator);
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      resetSnapshot();
      sortSeats(alphabetComparator);
    });
  }

  if (simulateButton) {
    simulateButton.addEventListener('click', () => {
      simulateRush();
    });
  }

  roleToggles.forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const role = (toggle.value || '').toLowerCase();
      coverageCards.forEach((card) => {
        if (card.dataset.role === role) {
          card.classList.toggle('is-muted', !toggle.checked);
        }
      });
    });
  });

  shiftButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const card = event.currentTarget.closest('[data-coverage-card]');
      if (!card) return;
      card.classList.toggle('is-pulsing');
    });
  });

  applyFilter('all');
  sortSeats(alphabetComparator);
  updateCoverageCountdown();
  window.setInterval(updateCoverageCountdown, 60000);
})();
