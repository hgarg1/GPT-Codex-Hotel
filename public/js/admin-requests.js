(function () {
  const csrfToken = window.AdminRequests?.csrfToken || document.querySelector('meta[name="csrf-token"]').content;
  const tableBody = document.querySelector('#requests-table tbody');
  const filterStatus = document.getElementById('request-filter-status');
  const filterType = document.getElementById('request-filter-type');
  const filterApply = document.getElementById('request-filter-apply');
  let requests = [];

  function parseRows() {
    if (!tableBody) return;
    requests = Array.from(tableBody.querySelectorAll('tr[data-request]')).map((row) => {
      try {
        return JSON.parse(row.dataset.request);
      } catch (error) {
        return null;
      }
    }).filter(Boolean);
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
      const row = document.createElement('tr');
      row.dataset.requestId = request.id;
      row.dataset.request = JSON.stringify(request);
      const submitted = request.createdAt ? new Date(request.createdAt).toLocaleString() : request.submittedLabel || '—';
      const employeeLabel = request.employeeName || request.employeeId;
      const employeeMeta = request.employeeEmail || request.employeeId;
      const status = request.status || 'pending';
      row.innerHTML = `
        <td>${submitted}</td>
        <td><strong>${employeeLabel}</strong><br /><span class="muted">${employeeMeta}</span></td>
        <td>${request.type.replace('_', ' ')}</td>
        <td><span class="status-chip status-${status}">${status}</span></td>
        <td class="request-payload"><pre></pre></td>
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
        pre.textContent = JSON.stringify(request.payload, null, 2);
      }
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
})();
