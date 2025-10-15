(function () {
  const portal = window.EmployeePortal || {};
  const csrfToken = portal.csrfToken || document.querySelector('meta[name="csrf-token"]').content;
  const tabControls = document.querySelectorAll('.tab-control');
  const panels = document.querySelectorAll('.panel');
  const clockInBtn = document.getElementById('clock-in-btn');
  const clockOutBtn = document.getElementById('clock-out-btn');
  const clockForm = document.getElementById('clock-form');
  const timesheetRange = document.getElementById('timesheet-range');
  const timesheetBody = document.getElementById('timesheet-body');
  const timesheetSummary = document.getElementById('timesheet-summary');
  const timesheetExport = document.getElementById('timesheet-export');
  const ptoForm = document.getElementById('pto-form');
  const workersCompForm = document.getElementById('workers-comp-form');
  const requestList = document.getElementById('request-list');
  const profileForm = document.getElementById('profile-form');
  const profileUpdates = document.getElementById('profile-updates');
  const toastRoot = document.getElementById('portal-toasts');
  const insightShiftState = document.getElementById('insight-shift-state');
  const insightShiftMeta = document.getElementById('insight-shift-meta');
  const insightShiftCta = document.getElementById('insight-shift-cta');
  const insightHoursValue = document.getElementById('insight-hours-value');
  const insightHoursMeta = document.getElementById('insight-hours-meta');
  const insightHoursProgress = document.getElementById('insight-hours-progress');
  const insightRequestsValue = document.getElementById('insight-requests-value');
  const insightRequestsMeta = document.getElementById('insight-requests-meta');
  const insightProfileValue = document.getElementById('insight-profile-value');
  const insightProfileBar = document.getElementById('insight-profile-bar');
  const insightProfileMeta = document.getElementById('insight-profile-meta');
  let currentRange = 'current';
  let openShift = portal.openShift || null;
  portal.insights = portal.insights && typeof portal.insights === 'object' ? portal.insights : {};
  portal.requests = Array.isArray(portal.requests) ? portal.requests : [];
  const SHIFT_TARGET_MINUTES = portal.insights?.hours?.targetMinutes || 14 * 8 * 60;
  const defaultShiftFallback = portal.insights?.shift?.fallbackMeta || 'Clock in to start tracking your hours.';
  const defaultShiftCta = portal.insights?.shift?.cta || 'Clock in to start your next shift.';

  function formatDuration(minutes) {
    if (!minutes && minutes !== 0) {
      return '—';
    }
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hrs) return `${mins}m`;
    if (!mins) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }

  function showToast(message, type = 'success') {
    if (!toastRoot) return;
    const toast = document.createElement('div');
    toast.className = `portal-toast${type === 'error' ? ' portal-toast--error' : ''}`;
    toast.textContent = message;
    toastRoot.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function updateShiftInsight(entry, options = {}) {
    if (!insightShiftState || !insightShiftMeta) {
      return;
    }
    const fallbackMeta = options.fallbackMeta || portal.insights?.shift?.fallbackMeta || defaultShiftFallback;
    const ctaMessage = options.cta || defaultShiftCta;
    if (entry) {
      const timeLabel = entry.clockInAt ? new Date(entry.clockInAt).toLocaleTimeString() : 'just now';
      insightShiftState.textContent = 'On duty';
      insightShiftMeta.textContent = `Clocked in ${timeLabel}`;
      if (insightShiftCta) {
        insightShiftCta.textContent = 'Clock out when you wrap up to sync payroll.';
        insightShiftCta.hidden = false;
      }
    } else {
      insightShiftState.textContent = 'Off duty';
      insightShiftMeta.textContent = fallbackMeta;
      if (insightShiftCta) {
        insightShiftCta.textContent = ctaMessage;
        insightShiftCta.hidden = !ctaMessage;
      }
    }
  }

  function updateHoursInsight(summary, entries = []) {
    if (!summary) {
      return;
    }
    const totalMinutes = summary.totalMinutes ?? entries.reduce((acc, entry) => acc + (entry.durationMinutes || 0), 0);
    const formatted = summary.formatted || formatDuration(totalMinutes);
    if (insightHoursValue) {
      insightHoursValue.textContent = formatted;
    }
    const completed = entries.filter((entry) => entry.durationMinutes).length;
    const metaText = summary.meta
      || (completed ? `${completed} completed shift${completed === 1 ? '' : 's'} this period` : 'No completed shifts yet this period.');
    if (insightHoursMeta) {
      insightHoursMeta.textContent = metaText;
    }
    if (insightHoursProgress) {
      const progress = SHIFT_TARGET_MINUTES
        ? Math.min(100, Math.round((totalMinutes / SHIFT_TARGET_MINUTES) * 100))
        : 0;
      insightHoursProgress.style.setProperty('--progress', progress);
    }
    portal.insights = portal.insights || {};
    portal.insights.hours = {
      ...(portal.insights.hours || {}),
      totalMinutes,
      formatted,
      meta: metaText
    };
  }

  function updateRequestsInsight(requests = portal.requests) {
    if (!insightRequestsValue || !insightRequestsMeta) {
      return;
    }
    const list = Array.isArray(requests) ? requests : [];
    const pending = list.filter((item) => (item.status || '').toLowerCase() === 'pending').length;
    insightRequestsValue.textContent = pending;
    const metaText = pending
      ? `${pending} awaiting review`
      : list.length
      ? 'All requests resolved'
      : 'No requests submitted';
    insightRequestsMeta.textContent = metaText;
    portal.requests = list;
    portal.insights = portal.insights || {};
    portal.insights.requests = {
      pending,
      total: list.length,
      meta: metaText
    };
  }

  function updateProfileInsight(profile = portal.profile || {}) {
    if (!insightProfileValue || !insightProfileBar || !insightProfileMeta) {
      return;
    }
    const requiredFields = [
      'addressLine1',
      'city',
      'state',
      'postalCode',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelationship'
    ];
    const filled = requiredFields.reduce((count, key) => {
      const value = profile[key];
      return value && String(value).trim().length ? count + 1 : count;
    }, 0);
    const percent = requiredFields.length
      ? Math.min(100, Math.round((filled / requiredFields.length) * 100))
      : 0;
    const missing = Math.max(0, requiredFields.length - filled);
    const metaText = missing
      ? `${missing} detail${missing === 1 ? '' : 's'} left for full coverage`
      : 'Profile complete';
    insightProfileValue.textContent = `${percent}%`;
    insightProfileBar.style.setProperty('--progress', percent);
    insightProfileMeta.textContent = metaText;
    portal.profile = profile;
    portal.insights = portal.insights || {};
    portal.insights.profile = {
      percent,
      missing,
      meta: metaText
    };
  }

  function switchTab(target) {
    tabControls.forEach((btn) => {
      const isTarget = btn.dataset.target === target;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const show = panel.id === `panel-${target}`;
      if (show) {
        panel.removeAttribute('hidden');
        panel.classList.add('active');
      } else {
        panel.setAttribute('hidden', 'hidden');
        panel.classList.remove('active');
      }
    });
  }

  function sanitizeFormData(form) {
    const data = new FormData(form);
    const payload = {};
    data.forEach((value, key) => {
      if (typeof value === 'string') {
        payload[key] = value.trim();
      } else {
        payload[key] = value;
      }
    });
    return payload;
  }

  function renderTimesheet(entries, summary) {
    if (!timesheetBody) return;
    timesheetBody.innerHTML = '';
    if (!entries || !entries.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = '<td colspan="7" class="muted">No recorded shifts in this window yet.</td>';
      timesheetBody.appendChild(emptyRow);
    } else {
      entries.forEach((entry) => {
        const row = document.createElement('tr');
        const clockIn = entry.clockInAt ? new Date(entry.clockInAt) : null;
        const clockOut = entry.clockOutAt ? new Date(entry.clockOutAt) : null;
        const status = entry.clockOutAt ? (entry.durationMinutes ? 'Complete' : 'Pending') : 'Open';
        row.innerHTML = `
          <td>${clockIn ? clockIn.toLocaleDateString() : '—'}</td>
          <td>${clockIn ? clockIn.toLocaleTimeString() : '—'}</td>
          <td>${clockOut ? clockOut.toLocaleTimeString() : '—'}</td>
          <td>${entry.durationMinutes ? formatDuration(entry.durationMinutes) : status === 'Pending' ? 'Needs review' : 'Open'}</td>
          <td>${status}</td>
          <td>${entry.location || '—'}</td>
          <td>${entry.notes || '—'}</td>
        `;
        timesheetBody.appendChild(row);
      });
    }
    const totalMinutes = entries.reduce((total, entry) => total + (entry.durationMinutes || 0), 0);
    const completed = entries.filter((entry) => entry.durationMinutes).length;
    const metaText = completed
      ? `${completed} completed shift${completed === 1 ? '' : 's'} this period`
      : 'No completed shifts yet this period.';
    if (timesheetSummary && summary) {
      timesheetSummary.textContent = `Total this period: ${summary.formatted} (${summary.totalHours}h)`;
    }
    if (summary) {
      updateHoursInsight(
        {
          totalMinutes: summary.totalMinutes ?? totalMinutes,
          formatted: summary.formatted || formatDuration(totalMinutes),
          meta: summary.meta || metaText
        },
        entries
      );
    } else {
      updateHoursInsight({ totalMinutes, formatted: formatDuration(totalMinutes), meta: metaText }, entries);
    }
    const fallbackMeta = entries.length
      ? `Last shift started ${new Date(entries[0].clockInAt).toLocaleString()}`
      : defaultShiftFallback;
    portal.insights = portal.insights || {};
    portal.insights.shift = {
      ...(portal.insights.shift || {}),
      fallbackMeta
    };
    if (!openShift) {
      updateShiftInsight(null, { fallbackMeta });
    }
  }

  function setOpenShift(entry) {
    openShift = entry;
    if (clockOutBtn) {
      clockOutBtn.disabled = !entry;
    }
    const statusChip = document.querySelector('#panel-clock .status-chip');
    if (statusChip) {
      if (entry) {
        const timeLabel = entry.clockInAt ? new Date(entry.clockInAt).toLocaleTimeString() : 'now';
        statusChip.textContent = `Currently clocked in since ${timeLabel}`;
        statusChip.classList.add('status-active');
      } else {
        statusChip.textContent = 'No active shift';
        statusChip.classList.remove('status-active');
      }
    }
    updateShiftInsight(entry, { fallbackMeta: portal.insights?.shift?.fallbackMeta, cta: defaultShiftCta });
  }

  async function fetchTimesheet(range = currentRange) {
    try {
      const response = await fetch(`/api/employee/time/timesheet?range=${encodeURIComponent(range)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to load timesheet');
      }
      const payload = await response.json();
      renderTimesheet(payload.entries || [], payload.summary);
      setOpenShift(payload.openEntry);
      if (timesheetExport) {
        timesheetExport.href = `/api/employee/time/timesheet.csv?range=${encodeURIComponent(range)}`;
      }
    } catch (error) {
      showToast(error.message || 'Unable to load timesheet', 'error');
    }
  }

  function appendRequest(request) {
    if (!requestList) return;
    const li = document.createElement('li');
    li.className = 'timeline-item';
    li.dataset.requestId = request.id;
    li.dataset.requestType = request.type;
    li.dataset.requestStatus = request.status;
    const created = request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Just now';
    const status = request.status || 'pending';
    li.innerHTML = `
      <div>
        <strong>${request.type.replace('_', ' ')}</strong>
        <span class="muted">Submitted ${created}</span>
      </div>
      <div class="status-chip status-${status}">${status}</div>
    `;
    if (request.type === 'pto' && status === 'approved') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline add-calendar';
      button.textContent = 'Add to Calendar';
      button.dataset.request = JSON.stringify(request);
      li.appendChild(button);
    }
    requestList.prepend(li);
    portal.requests = [request, ...(portal.requests || []).filter((entry) => entry.id !== request.id)];
    updateRequestsInsight(portal.requests);
  }

  function renderProfileUpdates(updates) {
    if (!profileUpdates) return;
    profileUpdates.innerHTML = '';
    if (!updates || !updates.length) {
      const empty = document.createElement('li');
      empty.className = 'timeline-item muted';
      empty.textContent = 'No pending updates.';
      profileUpdates.appendChild(empty);
      return;
    }
    updates.forEach((update) => {
      const li = document.createElement('li');
      li.className = 'timeline-item';
      const submitted = update.createdAt ? new Date(update.createdAt).toLocaleString() : 'Just now';
      li.innerHTML = `
        <div>
          <strong>Profile update</strong>
          <span class="muted">Submitted ${submitted}</span>
        </div>
        <div class="status-chip status-${update.status}">${update.status}</div>
      `;
      profileUpdates.appendChild(li);
    });
  }

  async function refreshProfile() {
    try {
      const response = await fetch('/api/employee/profile', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error('Unable to load profile details');
      }
      const payload = await response.json();
      portal.profile = payload.profile || portal.profile;
      renderProfileUpdates(payload.updates || []);
      updateProfileInsight(portal.profile);
    } catch (error) {
      showToast(error.message || 'Failed to refresh profile', 'error');
    }
  }

  async function handleClock(action) {
    if (!clockForm) return;
    const payload = sanitizeFormData(clockForm);
    const endpoint = action === 'in' ? '/api/employee/time/clock-in' : '/api/employee/time/clock-out';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Timekeeping action failed');
      }
      if (action === 'in') {
        setOpenShift(data.entry);
        showToast('Clocked in successfully. Have a stellar shift!');
      } else {
        setOpenShift(null);
        showToast('Clocked out successfully. Rest well.');
      }
      fetchTimesheet(currentRange);
    } catch (error) {
      showToast(error.message || 'Unable to submit timekeeping update', 'error');
    }
  }

  async function submitJsonForm(form, endpoint, successMessage) {
    const payload = sanitizeFormData(form);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      showToast(successMessage);
      return data;
    } catch (error) {
      showToast(error.message || 'Unable to submit request', 'error');
      throw error;
    }
  }

  function downloadIcs(request) {
    if (!request || !request.payload) return;
    const { startDate, endDate, reason } = request.payload;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (!start || !end) {
      showToast('Request missing schedule details', 'error');
      return;
    }
    const uid = `${request.id}@skyhaven`; 
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const summary = `PTO - ${portal.profile?.addressLine1 || 'Skyhaven Crew'}`;
    const description = reason ? reason.replace(/\n/g, '\\n') : 'Approved PTO';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aurora Nexus Skyhaven//Employee Portal//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pto-${request.id}.ics`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 0);
  }

  tabControls.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.target));
  });

  if (clockInBtn) {
    clockInBtn.addEventListener('click', () => handleClock('in'));
  }

  if (clockOutBtn) {
    clockOutBtn.addEventListener('click', () => handleClock('out'));
  }

  if (timesheetRange) {
    timesheetRange.addEventListener('change', (event) => {
      currentRange = event.target.value;
      fetchTimesheet(currentRange);
    });
  }

  if (ptoForm) {
    ptoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = await submitJsonForm(ptoForm, '/api/employee/requests/pto', 'PTO request submitted');
      if (data?.request) {
        appendRequest(data.request);
      }
      ptoForm.reset();
    });
  }

  if (workersCompForm) {
    workersCompForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitJsonForm(workersCompForm, '/api/employee/requests/workers-comp', 'Workers\' compensation form received');
      workersCompForm.reset();
    });
  }

  if (requestList) {
    requestList.addEventListener('click', (event) => {
      const target = event.target;
      if (target.classList.contains('add-calendar')) {
        try {
          const request = JSON.parse(target.dataset.request);
          downloadIcs(request);
        } catch (error) {
          showToast('Unable to generate calendar entry', 'error');
        }
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitJsonForm(profileForm, '/api/employee/profile/update', 'Profile update request sent for approval');
      refreshProfile();
    });
  }

  const initialEntries = portal.timesheet || [];
  const initialMinutes = initialEntries.reduce((total, entry) => total + (entry.durationMinutes || 0), 0);
  const initialCompleted = initialEntries.filter((entry) => entry.durationMinutes).length;
  renderTimesheet(initialEntries, {
    totalMinutes: initialMinutes,
    formatted: formatDuration(initialMinutes),
    totalHours: Math.round((initialMinutes / 60) * 100) / 100,
    meta: initialCompleted
      ? `${initialCompleted} completed shift${initialCompleted === 1 ? '' : 's'} this period`
      : 'No completed shifts yet this period.'
  });
  updateRequestsInsight(portal.requests);
  updateProfileInsight(portal.profile || {});
  renderProfileUpdates([]);
  setOpenShift(openShift);
  refreshProfile();
})();
