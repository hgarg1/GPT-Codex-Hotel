(function () {
  const csrfToken = window.AdminRequests?.csrfToken || document.querySelector('meta[name="csrf-token"]').content;
  const tableBody = document.querySelector('#requests-table tbody');
  const filterStatus = document.getElementById('request-filter-status');
  const filterType = document.getElementById('request-filter-type');
  const filterApply = document.getElementById('request-filter-apply');
  let requests = [];

  const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  function formatRelativeTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '—';
    }
    const diffMs = date.getTime() - Date.now();
    const units = [
      { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
      { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
      { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
      { unit: 'day', ms: 1000 * 60 * 60 * 24 },
      { unit: 'hour', ms: 1000 * 60 * 60 },
      { unit: 'minute', ms: 1000 * 60 },
      { unit: 'second', ms: 1000 }
    ];
    for (const { unit, ms } of units) {
      if (Math.abs(diffMs) >= ms || unit === 'second') {
        return relativeTimeFormatter.format(Math.round(diffMs / ms), unit);
      }
    }
    return '—';
  }

  function toTitleCaseFromSlug(value) {
    if (!value) return '—';
    return value
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  function normalizeRequest(request) {
    if (!request || typeof request !== 'object') {
      return null;
    }
    const createdAt = request.createdAt ? new Date(request.createdAt) : null;
    const submittedLabel =
      request.submittedLabel || (createdAt ? createdAt.toLocaleString() : '—');
    const submittedRelative =
      request.submittedRelative || (createdAt ? formatRelativeTime(createdAt) : '—');
    const typeLabel = request.typeLabel || toTitleCaseFromSlug(request.type);
    return {
      ...request,
      submittedLabel,
      submittedRelative,
      typeLabel
    };
  }

  function parseRows() {
    if (!tableBody) return;
    requests = Array.from(tableBody.querySelectorAll('tr[data-request]'))
      .map((row) => {
        try {
          const parsed = JSON.parse(row.dataset.request);
          const normalized = normalizeRequest(parsed);
          if (normalized) {
            row.dataset.request = JSON.stringify(normalized);
          }
          return normalized;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  }

  function renderRows(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!list.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" class="muted">No crew requests match the filter.</td>';
      tableBody.appendChild(row);
      return;
    }
    list.forEach((request) => {
      const normalized = normalizeRequest(request);
      if (!normalized) return;
      const row = document.createElement('tr');
      row.dataset.requestId = normalized.id;
      row.dataset.request = JSON.stringify(normalized);
      const status = normalized.status || 'pending';
      const employeeLabel = normalized.employeeName || normalized.employeeId || '—';
      const employeeMeta = normalized.employeeEmail || normalized.employeeId || '—';
      row.innerHTML = `
        <td>
          <span class="submitted-label">${normalized.submittedLabel}</span>
          <span class="submitted-relative">${normalized.submittedRelative}</span>
        </td>
        <td>
          <strong>${employeeLabel}</strong>
          <span class="muted">${employeeMeta}</span>
        </td>
        <td><span class="type-chip">${normalized.typeLabel}</span></td>
        <td><span class="status-chip status-${status}">${status}</span></td>
        <td class="request-payload">
          <details class="request-payload__details">
            <summary>Inspect payload</summary>
            <pre></pre>
          </details>
        </td>
        <td>
          <div class="request-actions">
            <select class="request-status">
              <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="denied" ${status === 'denied' ? 'selected' : ''}>Denied</option>
              <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <button type="button" class="btn btn-outline request-update">Update</button>
          </div>
        </td>
      `;
      const pre = row.querySelector('pre');
      if (pre) {
        pre.textContent = JSON.stringify(normalized.payload, null, 2);
      }
      tableBody.appendChild(row);
    });
  }

  function applyFilter() {
    const status = filterStatus?.value || '';
    const type = filterType?.value || '';
    const filtered = requests.filter((request) => {
      const statusMatch = !status || request.status === status;
      const typeMatch = !type || request.type === type;
      return statusMatch && typeMatch;
    });
    renderRows(filtered);
  }

  async function updateStatus(row, request, status) {
    try {
      const response = await fetch(`/api/admin/requests/${request.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status');
      }
      const updated = normalizeRequest({ ...request, ...data.request });
      if (!updated) {
        throw new Error('Unexpected response payload');
      }
      const index = requests.findIndex((item) => item.id === updated.id);
      if (index >= 0) {
        requests[index] = updated;
      }
      const chip = row.querySelector('.status-chip');
      if (chip) {
        chip.textContent = updated.status;
        chip.className = `status-chip status-${updated.status}`;
      }
      const select = row.querySelector('.request-status');
      if (select) {
        select.value = updated.status;
      }
      row.dataset.request = JSON.stringify(updated);
      alert('Request status updated.');
    } catch (error) {
      alert(error.message || 'Unable to update request status');
    }
  }

  tableBody?.addEventListener('click', (event) => {
    const button = event.target.closest('.request-update');
    if (!button) return;
    const row = button.closest('tr');
    if (!row) return;
    try {
      const request = JSON.parse(row.dataset.request);
      const statusSelect = row.querySelector('.request-status');
      if (!statusSelect) return;
      updateStatus(row, request, statusSelect.value);
    } catch (error) {
      console.error('Failed to parse request', error);
    }
  });

  filterApply?.addEventListener('click', applyFilter);

  parseRows();
})();

(() => {
  const tableBody = document.querySelector('[data-request-rows]');
  if (!tableBody) {
    return;
  }

  const searchInput = document.querySelector('[data-request-search]');
  const statusFilter = document.querySelector('[data-request-filter="status"]');
  const typeFilter = document.querySelector('[data-request-filter="type"]');
  const paginationEl = document.querySelector('[data-request-pagination]');
  const detailPanel = document.querySelector('[data-request-detail]');
  const detailComment = detailPanel?.querySelector('[data-decision-comment]');
  const toastEl = document.querySelector('[data-request-toast]');
  const csrfToken = window.__CSRF_TOKEN__ || document.querySelector('meta[name="csrf-token"]').getAttribute('content');

  const state = {
    requests: [],
    pagination: { page: 1, pageSize: 15, totalPages: 0, total: 0 },
    query: { search: '', status: 'pending', type: '' },
    activeRequestId: null
  };

  function showToast(message, tone = 'info') {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('is-info', 'is-error', 'is-success');
    toastEl.classList.add('is-visible');
    toastEl.classList.add(tone === 'error' ? 'is-error' : tone === 'success' ? 'is-success' : 'is-info');
    window.clearTimeout(toastEl.dataset.timeoutId);
    const timeoutId = window.setTimeout(() => {
      toastEl.classList.remove('is-visible', 'is-info', 'is-error', 'is-success');
      toastEl.textContent = '';
    }, 4000);
    toastEl.dataset.timeoutId = String(timeoutId);
  }

  function httpOptions(method = 'GET', body) {
    const headers = { 'CSRF-Token': csrfToken };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    return options;
  }

  async function http(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      let message = response.statusText || 'Request failed';
      try {
        const payload = JSON.parse(text);
        message = payload.error || payload.message || message;
      } catch (error) {
        // ignore
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  function setLoading(isLoading) {
    if (!tableBody) return;
    if (isLoading) {
      tableBody.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Loading requests…';
      row.appendChild(cell);
      tableBody.appendChild(row);
    }
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return value;
    }
  }

  function renderRequests() {
    tableBody.innerHTML = '';
    if (!state.requests.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = state.query.status === 'pending'
        ? 'No pending requests at the moment.'
        : 'No requests match the filters.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    state.requests.forEach((request) => {
      const row = document.createElement('tr');
      row.dataset.requestId = request.id;

      const employeeCell = document.createElement('td');
      const stack = document.createElement('div');
      stack.className = 'stacked';
      const name = document.createElement('strong');
      name.textContent = request.employee?.name || 'Unknown employee';
      const email = document.createElement('span');
      email.className = 'muted';
      email.textContent = request.employee?.email || '—';
      stack.appendChild(name);
      stack.appendChild(email);
      employeeCell.appendChild(stack);
      row.appendChild(employeeCell);

      const typeCell = document.createElement('td');
      typeCell.textContent = request.type;
      row.appendChild(typeCell);

      const submittedCell = document.createElement('td');
      submittedCell.textContent = formatDate(request.createdAt);
      row.appendChild(submittedCell);

      const statusCell = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = `status-chip status-${request.status}`;
      chip.textContent = request.status;
      statusCell.appendChild(chip);
      row.appendChild(statusCell);

      const commentCell = document.createElement('td');
      commentCell.textContent = request.comment || '—';
      row.appendChild(commentCell);

      const actionsCell = document.createElement('td');
      const reviewButton = document.createElement('button');
      reviewButton.type = 'button';
      reviewButton.className = 'pill-link secondary';
      reviewButton.textContent = 'Review';
      reviewButton.addEventListener('click', () => {
        openDetail(request);
      });
      actionsCell.appendChild(reviewButton);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  }

  function applyFilter() {
    const status = filterStatus.value;
    const type = filterType.value;
    const filtered = requests.filter((request) => {
      const statusMatch = !status || request.status === status;
      const typeMatch = !type || request.type === type;
      return statusMatch && typeMatch;
    });
    renderRows(filtered);
  }

  async function updateStatus(row, request, status) {
    try {
      const response = await fetch(`/api/admin/requests/${request.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status');
      }
      const updated = data.request;
      const index = requests.findIndex((item) => item.id === updated.id);
      if (index >= 0) {
        requests[index] = updated;
      }
      const chip = row.querySelector('.status-chip');
      if (chip) {
        chip.textContent = updated.status;
        chip.className = `status-chip status-${updated.status}`;
      }
      row.dataset.request = JSON.stringify(updated);
      alert('Request status updated.');
    } catch (error) {
      alert(error.message || 'Unable to update request status');
    }
  }

  tableBody?.addEventListener('click', (event) => {
    const button = event.target.closest('.request-update');
    if (!button) return;
    const row = button.closest('tr');
    if (!row) return;
    try {
      const request = JSON.parse(row.dataset.request);
      const statusSelect = row.querySelector('.request-status');
      if (!statusSelect) return;
      updateStatus(row, request, statusSelect.value);
    } catch (error) {
      console.error('Failed to parse request', error);
    }
  });

  filterApply?.addEventListener('click', applyFilter);

  parseRows();
  function updatePagination() {
    if (!paginationEl) return;
    const prev = paginationEl.querySelector('[data-page="prev"]');
    const next = paginationEl.querySelector('[data-page="next"]');
    const status = paginationEl.querySelector('[data-page-status]');
    if (prev) {
      prev.disabled = state.pagination.page <= 1;
    }
    if (next) {
      next.disabled = state.pagination.totalPages === 0 || state.pagination.page >= state.pagination.totalPages;
    }
    if (status) {
      status.textContent = `Page ${state.pagination.totalPages === 0 ? 0 : state.pagination.page} of ${state.pagination.totalPages}`;
    }
  }

  function formatPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return '—';
    }
    const entries = Object.entries(payload);
    if (!entries.length) {
      return '—';
    }
    const list = document.createElement('ul');
    list.className = 'payload-list';
    entries.forEach(([key, value]) => {
      const item = document.createElement('li');
      item.innerHTML = `<strong>${key}</strong>: ${value ?? '—'}`;
      list.appendChild(item);
    });
    return list.outerHTML;
  }

  function openDetail(request) {
    if (!detailPanel) return;
    state.activeRequestId = request.id;
    detailPanel.querySelector('[data-detail-title]').textContent = `${request.type} request`;
    detailPanel.querySelector('[data-detail-subtitle]').textContent = `${request.employee?.name || 'Unknown'} • ${formatDate(request.createdAt)}`;
    detailPanel.querySelector('[data-detail-employee]').textContent = request.employee?.name || '—';
    detailPanel.querySelector('[data-detail-department]').textContent = request.employee?.department || '—';
    detailPanel.querySelector('[data-detail-status]').textContent = request.status;
    detailPanel.querySelector('[data-detail-created]').textContent = formatDate(request.createdAt);
    const payloadEl = detailPanel.querySelector('[data-detail-payload]');
    payloadEl.innerHTML = formatPayload(request.payload);
    if (detailComment) {
      detailComment.value = request.comment || '';
    }
    detailPanel.hidden = false;
  }

  function closeDetail() {
    if (!detailPanel) return;
    detailPanel.hidden = true;
    state.activeRequestId = null;
    if (detailComment) {
      detailComment.value = '';
    }
  }

  async function loadRequests(page = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('pageSize', state.pagination.pageSize);
      if (state.query.search) params.set('search', state.query.search);
      if (state.query.status) params.set('status', state.query.status);
      if (state.query.type) params.set('type', state.query.type);
      const data = await http(`/api/admin/employee-requests?${params.toString()}`);
      state.requests = data.requests || [];
      state.pagination = data.pagination || state.pagination;
      state.pagination.page = data.pagination?.page || page;
      renderRequests();
      updatePagination();
      if (state.activeRequestId) {
        const match = state.requests.find((item) => item.id === state.activeRequestId);
        if (match) {
          openDetail(match);
        } else {
          closeDetail();
        }
      }
    } catch (error) {
      showToast(error.message || 'Unable to load requests', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitDecision(status) {
    if (!state.activeRequestId) {
      showToast('Select a request to review.', 'error');
      return;
    }
    try {
      const body = { status, comment: detailComment?.value || '' };
      await http(`/api/admin/employee-requests/${state.activeRequestId}/decision`, httpOptions('POST', body));
      showToast(`Request ${status === 'approved' ? 'approved' : 'denied'}.`, 'success');
      closeDetail();
      await loadRequests(state.pagination.page);
    } catch (error) {
      showToast(error.message || 'Unable to record decision', 'error');
    }
  }

  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      window.clearTimeout(searchTimeout);
      const value = event.target.value.trim();
      searchTimeout = window.setTimeout(() => {
        state.query.search = value;
        state.pagination.page = 1;
        loadRequests(1);
      }, 250);
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', (event) => {
      state.query.status = event.target.value;
      state.pagination.page = 1;
      loadRequests(1);
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', (event) => {
      state.query.type = event.target.value;
      state.pagination.page = 1;
      loadRequests(1);
    });
  }

  if (paginationEl) {
    paginationEl.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button) return;
      const direction = button.dataset.page;
      if (direction === 'prev' && state.pagination.page > 1) {
        loadRequests(state.pagination.page - 1);
      } else if (direction === 'next' && state.pagination.page < state.pagination.totalPages) {
        loadRequests(state.pagination.page + 1);
      }
    });
  }

  if (detailPanel) {
    detailPanel.querySelector('[data-close-request]')?.addEventListener('click', () => {
      closeDetail();
    });
    detailPanel.querySelector('[data-decision="approve"]')?.addEventListener('click', () => {
      submitDecision('approved');
    });
    detailPanel.querySelector('[data-decision="deny"]')?.addEventListener('click', () => {
      submitDecision('denied');
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetail();
    }
  });

  // Default status filter to pending for first load.
  if (statusFilter) {
    statusFilter.value = 'pending';
  }

  loadRequests(1);
})();
