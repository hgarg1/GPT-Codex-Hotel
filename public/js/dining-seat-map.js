(function () {
  const seatStage = document.querySelector('.seat-stage');
  if (!seatStage) return;
  const mapEl = seatStage.querySelector('#seat-map');
  if (!mapEl) return;

  const initialSeats = (() => {
    try {
      return JSON.parse(seatStage.dataset.seats || '[]');
    } catch (error) {
      return [];
    }
  })();

  const statusEl = seatStage.querySelector('[data-role="status"]');
  const lockedSeatInput = document.getElementById('locked-seat');
  let lockId = null;
  let lockedSeatId = null;

  function renderSeats(seats) {
    mapEl.innerHTML = '';
    seats.forEach((seat) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `seat seat--${seat.status}`;
      button.dataset.seatId = seat.id;
      button.textContent = seat.label;
      button.disabled = seat.status !== 'available' && seat.id !== lockedSeatId;
      button.addEventListener('click', () => handleSeatClick(seat.id));
      mapEl.appendChild(button);
    });
  }

  function updateStatus(message, tone = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  const csrfHeader = window.__CSRF_TOKEN__ ? { 'CSRF-Token': window.__CSRF_TOKEN__ } : {};

  async function handleSeatClick(seatId) {
    if (lockedSeatId === seatId) {
      if (!lockId) return;
      const releaseResponse = await fetch('/dining/reserve/seat-release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeader
        },
        body: JSON.stringify({ seatId, lockId })
      });
      if (!releaseResponse.ok) {
        updateStatus('Unable to release seat at this time.', 'warning');
      }
      lockId = null;
      lockedSeatId = null;
      if (lockedSeatInput) lockedSeatInput.value = '';
      updateStatus('Seat released. Choose another or continue.');
      return;
    }

    const response = await fetch('/dining/reserve/seat-lock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeader
      },
      body: JSON.stringify({ seatId })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      updateStatus(data.error || 'Unable to hold seat.', 'danger');
      return;
    }
    const data = await response.json();
    lockId = data.lockId;
    lockedSeatId = seatId;
    if (lockedSeatInput) lockedSeatInput.value = seatId;
    updateStatus(`Seat ${seatId} held for five minutes.`, 'success');
  }

  renderSeats(initialSeats);

  if (typeof window.io !== 'function') {
    updateStatus('Live updates unavailable in this browser.', 'warning');
    return;
  }

  const socket = window.io('/dining', { transports: ['websocket', 'polling'] });

  socket.on('connect_error', (err) => {
    updateStatus('Live updates unavailable. Please refresh for latest seats.', 'warning');
  });

  socket.on('seats:snapshot', (seats) => {
    renderSeats(seats);
  });

  socket.on('seats:update', () => {
    fetch('/dining/map', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then((response) => response.json())
      .then((data) => {
        if (!data || !Array.isArray(data.seats)) return;
        renderSeats(data.seats);
      })
      .catch(() => updateStatus('Unable to refresh seats from server.', 'warning'));
  });
})();
