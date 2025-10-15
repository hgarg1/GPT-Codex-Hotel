(function () {
  const csrfToken = window.AdminTime?.csrfToken || document.querySelector('meta[name="csrf-token"]').content;
  const tableBody = document.querySelector('#time-entries-table tbody');
  const filterEmployee = document.getElementById('time-filter-employee');
  const filterSearch = document.getElementById('time-filter-search');
  const filterStart = document.getElementById('time-filter-start');
  const filterEnd = document.getElementById('time-filter-end');
  const filterStatus = document.getElementById('time-filter-status');
  const filterLocation = document.getElementById('time-filter-location');
  const filterApply = document.getElementById('time-filter-apply');
  const filterClear = document.getElementById('time-filter-clear');
  const rangeButtons = document.querySelectorAll('#time-range-chips .chip');
  const refreshButton = document.getElementById('time-refresh');
  const exportButton = document.getElementById('time-export');
  const detailPanel = document.getElementById('time-detail');
  const adjustForm = document.getElementById('time-adjust-form');
  const entryIdInput = document.getElementById('time-entry-id');
  const clockInInput = document.getElementById('time-clock-in');
  const clockOutInput = document.getElementById('time-clock-out');
  const roleInput = document.getElementById('time-role');
  const departmentInput = document.getElementById('time-department');
  const locationInput = document.getElementById('time-location');
  const notesInput = document.getElementById('time-notes');
  const clockoutNowButton = document.getElementById('time-clockout-now');
  const activeList = document.getElementById('time-active-list');
  const flaggedList = document.getElementById('time-flagged-list');
  const coverageList = document.getElementById('time-coverage-list');
  const trendList = document.getElementById('time-trend-list');
  const totalHoursEl = document.getElementById('time-total-hours');
  const totalHoursMeta = document.getElementById('time-total-hours-meta');
  const averageDurationEl = document.getElementById('time-average-duration');
  const longestEl = document.getElementById('time-longest');
  const activeCountEl = document.getElementById('time-active-count');
  const reviewCountEl = document.getElementById('time-review-count');
  const activeSubEl = document.getElementById('time-active-sub');
  let entries = [];
  let currentView = [];
  let activeEntry = null;

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return '';
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatDuration(minutes) {
    if (!minutes && minutes !== 0) return '—';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs && mins) return `${hrs}h ${mins}m`;
    if (hrs) return `${hrs}h`;
    return `${mins}m`;
  }

  function calculateOpenMinutes(entry) {
    if (!entry.clockInAt || entry.clockOutAt) return null;
    const clockInDate = new Date(entry.clockInAt);
    if (Number.isNaN(clockInDate.valueOf())) return null;
    return Math.max(0, Math.round((Date.now() - clockInDate.getTime()) / 60000));
  }

  function getEntryStatus(entry) {
    const open = !entry.clockOutAt;
    const durationMinutes = entry.durationMinutes ?? calculateOpenMinutes(entry) ?? 0;
    const overtime = entry.durationMinutes && entry.durationMinutes >= 10 * 60;
    const extendedOpen = open && durationMinutes >= 8 * 60;
    const needsReview = overtime || extendedOpen || (entry.clockOutAt && !entry.durationMinutes);
    if (open) return 'open';
    if (overtime) return 'overtime';
    if (needsReview) return 'needs-review';
    return 'completed';
  }

  function enrichEntry(entry) {
    if (!entry) return null;
    const existing = entries.find((item) => item.id === entry.id);
    const mergedEmployee = entry.employee || existing?.employee || null;
    const displayMinutes = entry.durationMinutes ?? calculateOpenMinutes(entry);
    const clockInLabel = entry.clockInAt ? new Date(entry.clockInAt).toLocaleString() : '—';
    const clockOutLabel = entry.clockOutAt ? new Date(entry.clockOutAt).toLocaleString() : '—';
    return {
      ...existing,
      ...entry,
      employee: mergedEmployee,
      displayMinutes,
      clockInLabel,
      clockOutLabel,
      durationLabel: displayMinutes ? formatDuration(displayMinutes) : (entry.clockOutAt ? 'Needs review' : 'Open')
    };
  }

  function populateLocationFilter(list) {
    if (!filterLocation) return;
    const currentValue = filterLocation.value;
    const options = ['<option value="">All locations</option>'];
    const seen = new Set();
    list.forEach((entry) => {
      if (!entry.location) return;
      const key = entry.location.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push(`<option value="${key}">${entry.location}</option>`);
    });
    filterLocation.innerHTML = options.join('');
    if (currentValue && seen.has(currentValue)) {
      filterLocation.value = currentValue;
    }
  }

  function applyClientFilters(list) {
    const status = filterStatus?.value || '';
    const location = filterLocation?.value || '';
    const search = filterSearch?.value.trim().toLowerCase() || '';
    return list.filter((entry) => {
      const entryStatus = getEntryStatus(entry);
      if (status) {
        if (status === 'needs-review') {
          if (!['needs-review', 'overtime'].includes(entryStatus)) return false;
        } else if (entryStatus !== status) {
          return false;
        }
      }
      if (location) {
        if ((entry.location || '').toLowerCase() !== location) return false;
      }
      if (search) {
        const haystack = [
          entry.employeeId,
          entry.employee?.name,
          entry.employee?.email,
          entry.department,
          entry.role
        ]
          .map((value) => (value || '').toString().toLowerCase())
          .join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function renderTable(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!list.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8" class="muted">No entries match the current filters.</td>';
      tableBody.appendChild(row);
      return;
    }

    list.forEach((entry) => {
      const row = document.createElement('tr');
      row.dataset.entryId = entry.id;
      row.dataset.entry = JSON.stringify(entry);
      const status = getEntryStatus(entry);
      row.dataset.status = status;
      row.dataset.location = (entry.location || '').toLowerCase();
      row.dataset.employeeName = (entry.employee?.name || '').toLowerCase();
      row.dataset.employeeEmail = (entry.employee?.email || '').toLowerCase();
      row.dataset.employeeId = entry.employeeId.toLowerCase();

      const statusLabelMap = {
        open: { label: 'Open', className: 'status-chip--open' },
        overtime: { label: 'Overtime', className: 'status-chip--alert' },
        'needs-review': { label: 'Needs review', className: 'status-chip--review' },
        completed: { label: 'Complete', className: 'status-chip--ok' }
      };
      const statusMeta = statusLabelMap[status] || statusLabelMap.completed;
      row.classList.toggle('is-open', status === 'open');
      row.classList.toggle('is-flagged', ['overtime', 'needs-review'].includes(status));

      row.innerHTML = `
        <td>
          <strong>${entry.employee?.name || entry.employeeId}</strong>
          <div class="muted">ID: ${entry.employeeId}</div>
          ${entry.employee?.email ? `<div class="muted">${entry.employee.email}</div>` : ''}
        </td>
        <td>
          <span>${entry.role || entry.department || entry.employee?.department || '—'}</span>
          ${entry.department || entry.employee?.department ? `<div class="muted">Dept: ${entry.department || entry.employee?.department}</div>` : ''}
        </td>
        <td>${entry.clockInLabel || '—'}</td>
        <td>${entry.clockOutLabel || '—'}</td>
        <td>${entry.durationLabel || '—'}</td>
        <td>${entry.location || '—'}</td>
        <td>
          <span class="status-chip ${statusMeta.className}">${statusMeta.label}</span>
          ${entry.notes ? `<div class="muted status-note">${entry.notes}</div>` : ''}
        </td>
        <td><button type="button" class="btn btn-outline time-adjust">Adjust</button></td>
      `;
      tableBody.appendChild(row);
    });
  }

  function updateInsights(list) {
    const totalMinutes = list.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
    const completedCount = list.filter((entry) => entry.durationMinutes).length;
    if (totalHoursEl) {
      totalHoursEl.textContent = `${(totalMinutes / 60).toFixed(1)}h`;
    }
    if (totalHoursMeta) {
      totalHoursMeta.innerHTML = `Across <strong>${completedCount}</strong> completed shifts`;
    }

    const averageHours = completedCount ? totalMinutes / 60 / completedCount : 0;
    if (averageDurationEl) {
      averageDurationEl.textContent = `${averageHours.toFixed(2)}h`;
    }

    const openEntries = list.filter((entry) => !entry.clockOutAt);
    if (activeCountEl) {
      activeCountEl.textContent = openEntries.length;
    }
    if (activeSubEl) {
      activeSubEl.textContent = openEntries.length ? 'Live coverage overview' : 'All team members are clocked out';
    }

    const flagged = list.filter((entry) => ['overtime', 'needs-review'].includes(getEntryStatus(entry)));
    if (reviewCountEl) {
      reviewCountEl.textContent = flagged.length;
    }

    const longest = list.reduce((acc, entry) => {
      const duration = entry.durationMinutes || 0;
      if (duration > (acc?.durationMinutes || 0)) return entry;
      return acc;
    }, null);
    if (longestEl) {
      if (longest) {
        longestEl.textContent = `${longest.employee?.name || longest.employeeId} • ${formatDuration(longest.durationMinutes)}`;
      } else {
        longestEl.textContent = '—';
      }
    }

    function renderList(target, items, emptyLabel, builder) {
      if (!target) return;
      target.innerHTML = '';
      if (!items.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'muted';
        emptyItem.textContent = emptyLabel;
        target.appendChild(emptyItem);
        return;
      }
      items.forEach((item) => {
        const element = document.createElement('li');
        element.innerHTML = builder(item);
        if (item.id) {
          element.dataset.entryId = item.id;
        }
        target.appendChild(element);
      });
    }

    renderList(
      activeList,
      openEntries.slice(0, 6),
      'No active shifts right now.',
      (entry) => `
        <div>
          <strong>${entry.employee?.name || entry.employeeId}</strong>
          <div class="muted">Clocked in ${entry.clockInLabel}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-compact" data-action="clockout" data-entry-id="${entry.id}">Clock out</button>
      `
    );

    renderList(
      flaggedList,
      flagged.slice(0, 8),
      'All clear. No anomalies detected.',
      (entry) => `
        <div>
          <strong>${entry.employee?.name || entry.employeeId}</strong>
          <div class="muted">${entry.durationLabel} • ${entry.clockInLabel}</div>
        </div>
      `
    );

    const coverageMap = list.reduce((map, entry) => {
      const label = entry.department || entry.employee?.department || 'Unassigned';
      const key = label.toLowerCase();
      const bucket = map.get(key) || { label, minutes: 0, count: 0 };
      const effectiveMinutes = entry.durationMinutes ?? calculateOpenMinutes(entry) ?? 0;
      bucket.minutes += effectiveMinutes;
      bucket.count += 1;
      map.set(key, bucket);
      return map;
    }, new Map());
    const coverage = Array.from(coverageMap.values()).sort((a, b) => b.minutes - a.minutes).slice(0, 6);
    renderList(
      coverageList,
      coverage,
      'No recent coverage data.',
      (row) => `
        <div>
          <strong>${row.label}</strong>
          <div class="muted">${Math.round(row.minutes / 60)}h • ${row.count} shifts</div>
        </div>
      `
    );

    const dailyBuckets = list.reduce((map, entry) => {
      if (!entry.clockInAt) return map;
      const key = entry.clockInAt.slice(0, 10);
      const bucket = map.get(key) || { date: key, minutes: 0, count: 0 };
      const effectiveMinutes = entry.durationMinutes ?? calculateOpenMinutes(entry) ?? 0;
      bucket.minutes += effectiveMinutes;
      bucket.count += 1;
      map.set(key, bucket);
      return map;
    }, new Map());
    const trend = Array.from(dailyBuckets.values())
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 7);
    renderList(
      trendList,
      trend,
      'No recent daily totals.',
      (row) => `
        <div>
          <strong>${new Date(row.date).toLocaleDateString()}</strong>
          <div class="muted">${Math.round(row.minutes / 60)}h • ${row.count} shifts</div>
        </div>
      `
    );
  }

  function refreshView() {
    currentView = applyClientFilters(entries);
    renderTable(currentView);
    updateInsights(currentView);
  }

  function parseInitialEntries() {
    if (!tableBody) return;
    entries = Array.from(tableBody.querySelectorAll('tr[data-entry]'))
      .map((row) => {
        try {
          return JSON.parse(row.dataset.entry);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .map(enrichEntry)
      .filter(Boolean);
    populateLocationFilter(entries);
    refreshView();
  }

  function showDetail(entry) {
    if (!detailPanel) return;
    activeEntry = entry;
    detailPanel.hidden = false;
    detailPanel.classList.add('is-visible');
    entryIdInput.value = entry.id;
    clockInInput.value = toLocalInput(entry.clockInAt);
    clockOutInput.value = toLocalInput(entry.clockOutAt);
    roleInput.value = entry.role || '';
    departmentInput.value = entry.department || entry.employee?.department || '';
    locationInput.value = entry.location || '';
    notesInput.value = entry.notes || '';
    if (clockoutNowButton) {
      clockoutNowButton.dataset.entryId = entry.id;
      clockoutNowButton.disabled = Boolean(entry.clockOutAt);
    }
    Array.from(tableBody?.querySelectorAll('tr') || []).forEach((row) => {
      row.classList.toggle('is-active', row.dataset.entryId === entry.id);
    });
  }

  async function fetchEntries() {
    const params = new URLSearchParams();
    if (filterEmployee?.value.trim()) {
      params.set('employeeId', filterEmployee.value.trim());
    }
    if (filterStart?.value) {
      params.set('start', filterStart.value);
    }
    if (filterEnd?.value) {
      params.set('end', filterEnd.value);
    }
    const query = params.toString();
    const url = query ? `/api/admin/time-entries?${query}` : '/api/admin/time-entries';
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error('Unable to load time entries');
      }
      const data = await response.json();
      entries = (data.entries || []).map(enrichEntry).filter(Boolean);
      populateLocationFilter(entries);
      refreshView();
    } catch (error) {
      alert(error.message || 'Failed to retrieve entries');
    }
  }

  async function clockOutEntry(entryId, button) {
    if (!entryId) return;
    if (button) {
      button.disabled = true;
      button.textContent = 'Clocking…';
    }
    try {
      const response = await fetch(`/api/admin/time-entries/${entryId}/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ clockOutAt: new Date().toISOString() })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to clock out entry');
      }
      const updated = enrichEntry(data.entry);
      entries = entries.map((entry) => (entry.id === updated.id ? updated : entry));
      if (activeEntry && activeEntry.id === updated.id) {
        activeEntry = updated;
        showDetail(updated);
      }
      refreshView();
      alert('Shift clocked out.');
    } catch (error) {
      alert(error.message || 'Failed to clock out entry');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Clock out';
      }
    }
  }

  function exportCsv() {
    if (!currentView.length) {
      alert('No entries to export.');
      return;
    }
    const header = [
      'Employee Name',
      'Employee ID',
      'Email',
      'Clock In',
      'Clock Out',
      'Duration (minutes)',
      'Location',
      'Department',
      'Role',
      'Notes',
      'Status'
    ];
    const rows = currentView.map((entry) => {
      const status = getEntryStatus(entry);
      return [
        entry.employee?.name || '',
        entry.employeeId,
        entry.employee?.email || '',
        entry.clockInAt || '',
        entry.clockOutAt || '',
        entry.durationMinutes ?? calculateOpenMinutes(entry) ?? '',
        entry.location || '',
        entry.department || entry.employee?.department || '',
        entry.role || '',
        (entry.notes || '').replace(/\r?\n/g, ' '),
        status
      ];
    });
    const csv = [header, ...rows]
      .map((line) => line.map((field) => {
        const value = field == null ? '' : String(field);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `time-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    if (filterEmployee) filterEmployee.value = '';
    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterLocation) filterLocation.value = '';
    if (filterStart) filterStart.value = '';
    if (filterEnd) filterEnd.value = '';
    rangeButtons.forEach((button) => button.classList.remove('chip--active'));
    const defaultChip = document.querySelector('#time-range-chips .chip[data-range="7"]');
    if (defaultChip) {
      defaultChip.classList.add('chip--active');
    }
    refreshView();
  }

  function setDateRange(days) {
    if (!filterStart || !filterEnd) return;
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(end.getDate() - (Number(days) - 1));
    const toInputDate = (date) => date.toISOString().slice(0, 10);
    filterStart.value = toInputDate(start);
    filterEnd.value = toInputDate(end);
  }

  function handleRangeClick(event) {
    const button = event.target.closest('.chip');
    if (!button) return;
    const range = button.dataset.range;
    rangeButtons.forEach((chip) => chip.classList.toggle('chip--active', chip === button));
    if (range) {
      setDateRange(range);
      fetchEntries();
    }
  }

  function handleTableClick(event) {
    const adjustButton = event.target.closest('.time-adjust');
    if (!adjustButton) return;
    const row = adjustButton.closest('tr');
    if (!row) return;
    try {
      const entry = JSON.parse(row.dataset.entry);
      showDetail(entry);
    } catch (error) {
      console.error('Failed to parse entry', error);
    }
  }

  function handleActiveListClick(event) {
    const button = event.target.closest('[data-action="clockout"]');
    if (!button) return;
    const entryId = button.dataset.entryId;
    clockOutEntry(entryId, button);
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
      role: roleInput.value,
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
      const updated = enrichEntry(data.entry);
      entries = entries.map((entry) => (entry.id === updated.id ? updated : entry));
      activeEntry = updated;
      refreshView();
      showDetail(updated);
      alert('Time entry updated.');
    } catch (error) {
      alert(error.message || 'Failed to submit adjustment');
    }
  }

  parseInitialEntries();
  if (detailPanel) {
    detailPanel.hidden = true;
  }

  tableBody?.addEventListener('click', handleTableClick);
  activeList?.addEventListener('click', handleActiveListClick);
  filterApply?.addEventListener('click', fetchEntries);
  refreshButton?.addEventListener('click', fetchEntries);
  exportButton?.addEventListener('click', exportCsv);
  filterClear?.addEventListener('click', clearFilters);
  filterSearch?.addEventListener('input', refreshView);
  filterStatus?.addEventListener('change', refreshView);
  filterLocation?.addEventListener('change', refreshView);
  rangeButtons.forEach((button) => button.addEventListener('click', handleRangeClick));
  adjustForm?.addEventListener('submit', submitAdjustment);
  clockoutNowButton?.addEventListener('click', () => {
    if (!activeEntry || activeEntry.clockOutAt) return;
    clockOutEntry(activeEntry.id, clockoutNowButton);
  });
})();
