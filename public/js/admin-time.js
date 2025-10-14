(function () {
  const csrfToken = window.AdminTime?.csrfToken || document.querySelector('meta[name="csrf-token"]').content;
  const tableBody = document.querySelector('#time-entries-table tbody');
  const filterEmployee = document.getElementById('time-filter-employee');
  const filterStart = document.getElementById('time-filter-start');
  const filterEnd = document.getElementById('time-filter-end');
  const filterApply = document.getElementById('time-filter-apply');
  const detailPanel = document.getElementById('time-detail');
  const adjustForm = document.getElementById('time-adjust-form');
  const entryIdInput = document.getElementById('time-entry-id');
  const clockInInput = document.getElementById('time-clock-in');
  const clockOutInput = document.getElementById('time-clock-out');
  const departmentInput = document.getElementById('time-department');
  const locationInput = document.getElementById('time-location');
  const notesInput = document.getElementById('time-notes');
  let entries = [];
  let activeEntry = null;

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatDuration(minutes) {
    if (!minutes && minutes !== 0) return '—';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hrs) return `${mins}m`;
    if (!mins) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }

  function renderEntries(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!list || !list.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" class="muted">No entries match the filter.</td>';
      tableBody.appendChild(row);
      return;
    }
    list.forEach((entry) => {
      const row = document.createElement('tr');
      row.dataset.entryId = entry.id;
      row.dataset.entry = JSON.stringify(entry);
      const clockIn = entry.clockInAt ? new Date(entry.clockInAt).toLocaleString() : '—';
      const clockOut = entry.clockOutAt ? new Date(entry.clockOutAt).toLocaleString() : '—';
      const durationLabel = entry.clockOutAt ? formatDuration(entry.durationMinutes) : 'Open';
      row.innerHTML = `
        <td><strong>${entry.employee?.name || entry.employeeId}</strong><br /><span class="muted">${entry.employee?.email || entry.employeeId}</span></td>
        <td>${clockIn}</td>
        <td>${clockOut}</td>
        <td>${durationLabel}</td>
        <td>${entry.location || '—'}</td>
        <td>${entry.notes || '—'}</td>
        <td><button type="button" class="btn btn-outline time-adjust">Adjust</button></td>
      `;
      tableBody.appendChild(row);
    });
  }

  function parseInitialEntries() {
    if (!tableBody) return;
    entries = Array.from(tableBody.querySelectorAll('tr[data-entry]')).map((row) => {
      try {
        return JSON.parse(row.dataset.entry);
      } catch (error) {
        return null;
      }
    }).filter(Boolean);
  }

  function showDetail(entry) {
    if (!detailPanel) return;
    activeEntry = entry;
    detailPanel.hidden = false;
    entryIdInput.value = entry.id;
    clockInInput.value = toLocalInput(entry.clockInAt);
    clockOutInput.value = toLocalInput(entry.clockOutAt);
    departmentInput.value = entry.department || '';
    locationInput.value = entry.location || '';
    notesInput.value = entry.notes || '';
  }

  async function fetchEntries() {
    const params = new URLSearchParams();
    if (filterEmployee.value.trim()) {
      params.set('employeeId', filterEmployee.value.trim());
    }
    if (filterStart.value) {
      params.set('start', filterStart.value);
    }
    if (filterEnd.value) {
      params.set('end', filterEnd.value);
    }
    const url = `/api/admin/time-entries?${params.toString()}`;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error('Unable to load time entries');
      }
      const data = await response.json();
      entries = data.entries || [];
      renderEntries(entries);
    } catch (error) {
      alert(error.message || 'Failed to retrieve entries');
    }
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    if (!activeEntry) {
      alert('Select an entry to adjust.');
      return;
    }
    const payload = {
      clockInAt: clockInInput.value ? new Date(clockInInput.value).toISOString() : undefined,
      clockOutAt: clockOutInput.value ? new Date(clockOutInput.value).toISOString() : '',
      department: departmentInput.value,
      location: locationInput.value,
      notes: notesInput.value
    };
    try {
      const response = await fetch(`/api/admin/time-entries/${activeEntry.id}/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to adjust time entry');
      }
      alert('Time entry updated.');
      activeEntry = data.entry;
      const index = entries.findIndex((entry) => entry.id === data.entry.id);
      if (index >= 0) {
        entries[index] = data.entry;
      } else {
        entries.unshift(data.entry);
      }
      renderEntries(entries);
      showDetail(data.entry);
    } catch (error) {
      alert(error.message || 'Failed to submit adjustment');
    }
  }

  parseInitialEntries();

  tableBody?.addEventListener('click', (event) => {
    const button = event.target.closest('.time-adjust');
    if (!button) return;
    const row = button.closest('tr');
    if (!row) return;
    try {
      const entry = JSON.parse(row.dataset.entry);
      showDetail(entry);
    } catch (error) {
      console.error('Failed to parse entry', error);
    }
  });

  filterApply?.addEventListener('click', fetchEntries);
  adjustForm?.addEventListener('submit', submitAdjustment);
})();
