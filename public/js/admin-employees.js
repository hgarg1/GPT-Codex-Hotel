(() => {
  const tableBody = document.querySelector('[data-employee-rows]');
  if (!tableBody) {
    return;
  }

  const searchInput = document.querySelector('[data-employee-search]');
  const filterDepartment = document.querySelector('[data-employee-filter="department"]');
  const filterStatus = document.querySelector('[data-employee-filter="status"]');
  const filterEmployment = document.querySelector('[data-employee-filter="employmentType"]');
  const paginationEl = document.querySelector('[data-employee-pagination]');
  const bulkForm = document.querySelector('[data-employee-bulk]');
  const bulkDepartment = bulkForm?.querySelector('[data-bulk-department]');
  const bulkStatus = bulkForm?.querySelector('[data-bulk-status]');
  const bulkApply = bulkForm?.querySelector('[data-bulk-apply]');
  const detailPanel = document.querySelector('[data-employee-detail]');
  const toastEl = document.querySelector('[data-employee-toast]');
  const importButton = document.querySelector('[data-import-leadership]');
  const newButton = document.querySelector('[data-open-create]');
  const modal = document.querySelector('[data-employee-modal]');
  const modalTitle = modal?.querySelector('[data-modal-title]');
  const modalForm = modal?.querySelector('[data-employee-form]');
  const submitLabel = modal?.querySelector('[data-submit-label]');

  const csrfToken = window.__CSRF_TOKEN__ || document.querySelector('meta[name="csrf-token"]').getAttribute('content');

  const state = {
    employees: [],
    pagination: { page: 1, pageSize: 20, totalPages: 0, total: 0 },
    filters: { departments: [], statuses: [], employmentTypes: [] },
    query: { search: '', department: '', status: '', employmentType: '' },
    selected: new Set(),
    loading: false,
    detailId: null
  };

  const statusFallback = ['active', 'on-leave', 'suspended', 'terminated'];

  function uniqueOptions(values = []) {
    const seen = new Map();
    values.forEach((raw) => {
      if (raw == null) return;
      const value = String(raw).trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, value);
      }
    });
    return Array.from(seen.values());
  }

  function getStatusOptions() {
    const combined = uniqueOptions([...(state.filters.statuses || []), ...statusFallback]);
    if (combined.length === 0) {
      return statusFallback.slice();
    }
    return combined;
  }

  function setSelectOptions(select, values, options = {}) {
    if (!select) return;
    const {
      placeholder,
      placeholderValue = '',
      selectedValue,
      includeExistingValue = true
    } = options;
    const previousValue =
      typeof selectedValue === 'string' ? selectedValue : typeof select.value === 'string' ? select.value : '';
    select.innerHTML = '';
    if (typeof placeholder === 'string') {
      const option = document.createElement('option');
      option.value = placeholderValue;
      option.textContent = placeholder;
      if (!previousValue) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    let hasMatch = false;
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (previousValue && value.toLowerCase() === previousValue.toLowerCase()) {
        option.selected = true;
        hasMatch = true;
      }
      select.appendChild(option);
    });
    if (previousValue && !hasMatch && includeExistingValue) {
      const option = document.createElement('option');
      option.value = previousValue;
      option.textContent = previousValue;
      option.selected = true;
      select.appendChild(option);
    }
  }

  function showToast(message, tone = 'info') {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('is-info', 'is-error', 'is-success');
    toastEl.classList.add('is-visible');
    if (tone === 'error') {
      toastEl.classList.add('is-error');
    } else if (tone === 'success') {
      toastEl.classList.add('is-success');
    } else {
      toastEl.classList.add('is-info');
    }
    window.clearTimeout(toastEl.dataset.timeoutId);
    const timeoutId = window.setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 5000);
    toastEl.dataset.timeoutId = String(timeoutId);
  }

  function clearToast() {
    if (!toastEl) return;
    toastEl.classList.remove('is-visible', 'is-info', 'is-error', 'is-success');
    toastEl.textContent = '';
  }

  function createRequestOptions(method = 'GET', body) {
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
      } catch (parseError) {
        // Ignore parse errors and use the default message.
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
    state.loading = isLoading;
    if (isLoading && tableBody) {
      tableBody.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'Loading employee roster…';
      row.appendChild(cell);
      tableBody.appendChild(row);
    }
  }

  function updateSelectedCheckbox(id, checked) {
    if (checked) {
      state.selected.add(id);
    } else {
      state.selected.delete(id);
    }
    updateBulkButtonState();
  }

  function markRowDirty(row) {
    row.dataset.dirty = 'true';
    const saveButton = row.querySelector('[data-action="save"]');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }

  function renderEmployees() {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!state.employees.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 8;
      emptyCell.textContent = state.query.search || state.query.department || state.query.status || state.query.employmentType
        ? 'No employees match the filters.'
        : 'No employees recorded yet.';
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
      return;
    }

    state.employees.forEach((employee) => {
      const row = document.createElement('tr');
      row.dataset.employeeId = employee.id;

      const selectCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selected.has(employee.id);
      checkbox.addEventListener('change', (event) => {
        updateSelectedCheckbox(employee.id, event.target.checked);
      });
      selectCell.appendChild(checkbox);
      row.appendChild(selectCell);

      const nameCell = document.createElement('td');
      const stack = document.createElement('div');
      stack.className = 'stacked';
      const nameStrong = document.createElement('strong');
      nameStrong.textContent = employee.name;
      const emailSpan = document.createElement('span');
      emailSpan.className = 'muted';
      emailSpan.textContent = employee.email;
      stack.appendChild(nameStrong);
      stack.appendChild(emailSpan);
      if (employee.phone) {
        const phoneSpan = document.createElement('span');
        phoneSpan.className = 'muted';
        phoneSpan.textContent = employee.phone;
        stack.appendChild(phoneSpan);
      }
      nameCell.appendChild(stack);
      row.appendChild(nameCell);

      const titleCell = document.createElement('td');
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = employee.title || '';
      titleInput.dataset.inlineField = 'title';
      titleInput.addEventListener('input', () => markRowDirty(row));
      titleCell.appendChild(titleInput);
      row.appendChild(titleCell);

      const departmentCell = document.createElement('td');
      const departmentInput = document.createElement('input');
      departmentInput.type = 'text';
      departmentInput.value = employee.department || '';
      departmentInput.dataset.inlineField = 'department';
      departmentInput.addEventListener('input', () => markRowDirty(row));
      departmentCell.appendChild(departmentInput);
      row.appendChild(departmentCell);

      const employmentCell = document.createElement('td');
      const employmentSpan = document.createElement('span');
      employmentSpan.textContent = employee.employmentType || '—';
      employmentCell.appendChild(employmentSpan);
      row.appendChild(employmentCell);

      const statusCell = document.createElement('td');
      const statusSelect = document.createElement('select');
      statusSelect.dataset.inlineField = 'status';
      const statuses = getStatusOptions();
      statuses.forEach((status) => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        if ((employee.status || '').toLowerCase() === status.toLowerCase()) {
          option.selected = true;
        }
        statusSelect.appendChild(option);
      });
      statusSelect.addEventListener('change', () => markRowDirty(row));
      statusCell.appendChild(statusSelect);
      row.appendChild(statusCell);

      const startCell = document.createElement('td');
      startCell.textContent = employee.startDate || '—';
      row.appendChild(startCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'employee-actions';
      const actions = document.createElement('div');
      actions.className = 'actions-stack';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'pill-link primary';
      saveButton.textContent = 'Save';
      saveButton.dataset.action = 'save';
      saveButton.disabled = true;
      actions.appendChild(saveButton);

      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.className = 'pill-link';
      viewButton.textContent = 'View';
      viewButton.dataset.action = 'view';
      actions.appendChild(viewButton);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'pill-link secondary';
      editButton.textContent = 'Edit';
      editButton.dataset.action = 'edit';
      actions.appendChild(editButton);

      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'pill-link secondary';
      resetButton.textContent = 'Reset password';
      resetButton.dataset.action = 'reset';
      actions.appendChild(resetButton);

      const disableButton = document.createElement('button');
      disableButton.type = 'button';
      disableButton.className = 'pill-link secondary';
      disableButton.textContent = 'Disable';
      disableButton.dataset.action = 'disable';
      actions.appendChild(disableButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'pill-link danger';
      deleteButton.textContent = 'Delete';
      deleteButton.dataset.action = 'delete';
      actions.appendChild(deleteButton);

      actions.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        handleRowAction(button.dataset.action, employee, row);
      });

      actionsCell.appendChild(actions);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  }

  function renderFilters() {
    const departments = uniqueOptions(state.filters.departments || []);
    setSelectOptions(filterDepartment, departments, {
      placeholder: 'All departments',
      placeholderValue: '',
      selectedValue: state.query.department
    });
    setSelectOptions(bulkDepartment, departments, {
      placeholder: 'Set department…',
      placeholderValue: '',
      selectedValue: bulkDepartment?.value || '',
      includeExistingValue: true
    });

    const employmentTypes = uniqueOptions(state.filters.employmentTypes || []);
    setSelectOptions(filterEmployment, employmentTypes, {
      placeholder: 'All employment types',
      placeholderValue: '',
      selectedValue: state.query.employmentType
    });

    const statuses = getStatusOptions();
    setSelectOptions(filterStatus, statuses, {
      placeholder: 'All statuses',
      placeholderValue: '',
      selectedValue: state.query.status
    });
    setSelectOptions(bulkStatus, statuses, {
      placeholder: 'Set status…',
      placeholderValue: '',
      selectedValue: bulkStatus?.value || '',
      includeExistingValue: true
    });

    if (modalForm) {
      const modalStatus = modalForm.querySelector('[data-field="status"]');
      setSelectOptions(modalStatus, statuses, {
        selectedValue: modalStatus?.value || 'active',
        includeExistingValue: true
      });
    }
  }

  function updatePaginationControls() {
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

  function updateBulkButtonState() {
    if (!bulkApply) return;
    const hasSelection = state.selected.size > 0;
    const hasUpdates = Boolean((bulkDepartment && bulkDepartment.value) || (bulkStatus && bulkStatus.value));
    bulkApply.disabled = !(hasSelection && hasUpdates);
  }

  async function loadEmployees(page = 1) {
    setLoading(true);
    clearToast();
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      if (state.query.search) params.set('search', state.query.search);
      if (state.query.department) params.set('department', state.query.department);
      if (state.query.status) params.set('status', state.query.status);
      if (state.query.employmentType) params.set('employmentType', state.query.employmentType);
      const data = await http(`/api/admin/employees?${params.toString()}`);
      state.employees = Array.isArray(data.employees) ? data.employees : [];
      state.pagination = data.pagination || { page: page, pageSize: 20, totalPages: 0, total: 0 };
      state.filters = data.filters || state.filters;
      state.pagination.page = data.pagination?.page || page;
      const visibleIds = new Set(state.employees.map((employee) => employee.id));
      Array.from(state.selected).forEach((id) => {
        if (!visibleIds.has(id)) {
          state.selected.delete(id);
        }
      });
      renderEmployees();
      renderFilters();
      updatePaginationControls();
      updateBulkButtonState();
      if (state.detailId) {
        const employee = state.employees.find((item) => item.id === state.detailId);
        if (employee) {
          populateDetail(employee);
        }
      }
    } catch (error) {
      showToast(error.message || 'Unable to load employees', 'error');
    } finally {
      setLoading(false);
    }
  }

  function populateDetail(employee) {
    if (!detailPanel) return;
    state.detailId = employee.id;
    detailPanel.querySelector('[data-detail-name]').textContent = employee.name;
    detailPanel.querySelector('[data-detail-email]').textContent = employee.email || '';
    detailPanel.querySelector('[data-detail-department]').textContent = employee.department || '—';
    detailPanel.querySelector('[data-detail-title]').textContent = employee.title || '—';
    detailPanel.querySelector('[data-detail-employment]').textContent = employee.employmentType || '—';
    detailPanel.querySelector('[data-detail-status]').textContent = employee.status || '—';
    detailPanel.querySelector('[data-detail-start]').textContent = employee.startDate || '—';
    detailPanel.querySelector('[data-detail-emergency]').textContent = employee.emergencyContact || '—';
    detailPanel.querySelector('[data-detail-notes]').textContent = employee.notes || 'No notes captured.';
    detailPanel.hidden = false;
  }

  function closeDetail() {
    if (!detailPanel) return;
    detailPanel.hidden = true;
    state.detailId = null;
  }

  function openModal(employee) {
    if (!modal || !modalForm) return;
    modal.hidden = false;
    modal.classList.add('is-visible');
    if (employee) {
      modalTitle.textContent = 'Edit employee';
      submitLabel.textContent = 'Save changes';
      modalForm.querySelector('[data-field="id"]').value = employee.id;
      modalForm.querySelector('[data-field="name"]').value = employee.name || '';
      modalForm.querySelector('[data-field="email"]').value = employee.email || '';
      modalForm.querySelector('[data-field="phone"]').value = employee.phone || '';
      modalForm.querySelector('[data-field="department"]').value = employee.department || '';
      modalForm.querySelector('[data-field="title"]').value = employee.title || '';
      modalForm.querySelector('[data-field="employmentType"]').value = employee.employmentType || 'Full-Time';
      modalForm.querySelector('[data-field="startDate"]').value = employee.startDate || '';
      const statusField = modalForm.querySelector('[data-field="status"]');
      setSelectOptions(statusField, getStatusOptions(), {
        selectedValue: employee.status || 'active',
        includeExistingValue: true
      });
      modalForm.querySelector('[data-field="emergencyContact"]').value = employee.emergencyContact || '';
      modalForm.querySelector('[data-field="notes"]').value = employee.notes || '';
    } else {
      modalTitle.textContent = 'New employee';
      submitLabel.textContent = 'Create employee';
      modalForm.querySelector('[data-field="id"]').value = '';
      modalForm.querySelector('[data-field="name"]').value = '';
      modalForm.querySelector('[data-field="email"]').value = '';
      modalForm.querySelector('[data-field="phone"]').value = '';
      modalForm.querySelector('[data-field="department"]').value = '';
      modalForm.querySelector('[data-field="title"]').value = '';
      modalForm.querySelector('[data-field="employmentType"]').value = 'Full-Time';
      modalForm.querySelector('[data-field="startDate"]').value = '';
      const statusField = modalForm.querySelector('[data-field="status"]');
      setSelectOptions(statusField, getStatusOptions(), {
        selectedValue: 'active',
        includeExistingValue: true
      });
      modalForm.querySelector('[data-field="emergencyContact"]').value = '';
      modalForm.querySelector('[data-field="notes"]').value = '';
    }
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-visible');
    modal.hidden = true;
  }

  async function handleRowAction(action, employee, row) {
    try {
      if (action === 'save') {
        const title = row.querySelector('[data-inline-field="title"]').value;
        const department = row.querySelector('[data-inline-field="department"]').value;
        const status = row.querySelector('[data-inline-field="status"]').value;
        await http(`/api/admin/employees/${employee.id}`, createRequestOptions('PATCH', {
          title,
          department,
          status
        }));
        showToast(`Updated ${employee.name}.`, 'success');
        await loadEmployees(state.pagination.page);
      } else if (action === 'view') {
        populateDetail(employee);
      } else if (action === 'edit') {
        openModal(employee);
      } else if (action === 'reset') {
        const data = await http(`/api/admin/employees/${employee.id}/reset-password`, createRequestOptions('POST'));
        showToast(`Temporary password for ${employee.name}: ${data.temporaryPassword}`, 'success');
      } else if (action === 'disable') {
        await http(`/api/admin/employees/${employee.id}`, createRequestOptions('PATCH', { status: 'suspended' }));
        showToast(`${employee.name} has been disabled.`, 'success');
        await loadEmployees(state.pagination.page);
      } else if (action === 'delete') {
        const confirmed = window.confirm(`Delete ${employee.name}? This cannot be undone.`);
        if (!confirmed) return;
        await http(`/api/admin/employees/${employee.id}`, createRequestOptions('DELETE'));
        state.selected.delete(employee.id);
        showToast(`${employee.name} removed from roster.`, 'success');
        await loadEmployees(Math.max(1, state.pagination.page));
      }
    } catch (error) {
      showToast(error.message || 'Unable to complete action', 'error');
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
        loadEmployees(1);
      }, 250);
    });
  }

  if (filterDepartment) {
    filterDepartment.addEventListener('change', (event) => {
      state.query.department = event.target.value;
      state.pagination.page = 1;
      loadEmployees(1);
    });
  }
  if (filterStatus) {
    filterStatus.addEventListener('change', (event) => {
      state.query.status = event.target.value;
      state.pagination.page = 1;
      loadEmployees(1);
    });
  }
  if (filterEmployment) {
    filterEmployment.addEventListener('change', (event) => {
      state.query.employmentType = event.target.value;
      state.pagination.page = 1;
      loadEmployees(1);
    });
  }

  if (paginationEl) {
    paginationEl.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button) return;
      const direction = button.dataset.page;
      if (direction === 'prev' && state.pagination.page > 1) {
        loadEmployees(state.pagination.page - 1);
      } else if (direction === 'next' && state.pagination.page < state.pagination.totalPages) {
        loadEmployees(state.pagination.page + 1);
      }
    });
  }

  if (bulkForm) {
    bulkForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.selected.size === 0) return;
      const payload = { ids: Array.from(state.selected) };
      if (bulkDepartment && bulkDepartment.value) {
        payload.department = bulkDepartment.value;
      }
      if (bulkStatus && bulkStatus.value) {
        payload.status = bulkStatus.value;
      }
      try {
        await http('/api/admin/employees/bulk', createRequestOptions('POST', payload));
        showToast('Bulk update applied.', 'success');
        state.selected.clear();
        if (bulkDepartment) bulkDepartment.value = '';
        if (bulkStatus) bulkStatus.value = '';
        updateBulkButtonState();
        await loadEmployees(state.pagination.page);
      } catch (error) {
        showToast(error.message || 'Bulk update failed', 'error');
      }
    });
    bulkDepartment?.addEventListener('change', updateBulkButtonState);
    bulkStatus?.addEventListener('change', updateBulkButtonState);
  }

  if (detailPanel) {
    detailPanel.querySelector('[data-close-detail]')?.addEventListener('click', () => {
      closeDetail();
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target.matches('[data-close-modal]') || event.target.classList.contains('employee-modal__backdrop')) {
        closeModal();
      }
    });
  }

  if (modalForm) {
    modalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(modalForm);
      const payload = Object.fromEntries(formData.entries());
      const id = payload.id;
      if (!payload.name || !payload.email) {
        showToast('Name and email are required.', 'error');
        return;
      }
      if (!payload.startDate) {
        delete payload.startDate;
      }
      try {
        if (id) {
          delete payload.id;
          await http(`/api/admin/employees/${id}`, createRequestOptions('PATCH', payload));
          showToast('Employee updated.', 'success');
        } else {
          delete payload.id;
          await http('/api/admin/employees', createRequestOptions('POST', payload));
          showToast('Employee created.', 'success');
        }
        closeModal();
        await loadEmployees(state.pagination.page);
      } catch (error) {
        showToast(error.message || 'Unable to save employee', 'error');
      }
    });
  }

  if (importButton) {
    importButton.addEventListener('click', async () => {
      try {
        const data = await http('/api/admin/employees/import-from-leadership', createRequestOptions('POST', {}));
        const createdCount = Number.isFinite(data.createdCount)
          ? data.createdCount
          : Number.parseInt(data.createdCount, 10) || 0;
        const skippedCount = Number.isFinite(data.skippedCount)
          ? data.skippedCount
          : Number.parseInt(data.skippedCount, 10) || 0;
        if (createdCount > 0) {
          const summary =
            skippedCount > 0
              ? `Imported ${createdCount} leaders. Skipped ${skippedCount} existing records.`
              : `Imported ${createdCount} leaders into the roster.`;
          showToast(summary, 'success');
        } else if (skippedCount > 0) {
          showToast(`All leadership members are already in the roster (${skippedCount} skipped).`, 'info');
        } else {
          showToast('No new leaders to import.', 'info');
        }
        await loadEmployees(state.pagination.page);
      } catch (error) {
        showToast(error.message || 'Import failed', 'error');
      }
    });
  }

  if (newButton) {
    newButton.addEventListener('click', () => {
      openModal(null);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetail();
      if (modal && !modal.hidden) {
        closeModal();
      }
    }
  });

  loadEmployees(1);
})();
