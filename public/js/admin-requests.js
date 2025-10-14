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
