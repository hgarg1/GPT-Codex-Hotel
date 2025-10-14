(() => {
  const adminSection = document.querySelector('.admin[data-animate]');
  if (adminSection && !adminSection.classList.contains('is-visible')) {
    requestAnimationFrame(() => {
      adminSection.classList.add('is-visible');
    });
  }

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

  const roleLabels = {
    GLOBAL_ADMIN: 'Global Admin',
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    EMPLOYEE: 'Employee'
  };

  const permissionLabels = {
    'manage:employees': 'Manage employees',
    'reset:passwords': 'Reset passwords',
    'approve:transfers': 'Approve transfers',
    'manage:permissions': 'Manage permissions'
  };

  const escapeSelector = (value) => {
    const stringValue = String(value ?? '');
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(stringValue);
    }
    return stringValue.replace(/"/g, '\\"');
  };

  const initSubAdminRoster = () => {
    const section = document.querySelector('[data-subadmin-roster]');
    if (!section) {
      return {
        refresh: () => {},
        upsert: () => {}
      };
    }

    const tableBody = section.querySelector('[data-roster-body]');
    const feedback = section.querySelector('[data-roster-feedback]');
    const refreshButton = section.querySelector('[data-roster-refresh]');
    const emptyMessage = section.getAttribute('data-empty-text') || 'No delegated administrators yet.';

    const setFeedback = (message, tone = 'info') => {
      if (!feedback) return;
      const text = message || '';
      feedback.textContent = text;
      feedback.classList.remove('is-error', 'is-success');
      if (!text) {
        return;
      }
      if (tone === 'error') {
        feedback.classList.add('is-error');
      } else if (tone === 'success') {
        feedback.classList.add('is-success');
      }
    };

    const clearBody = () => {
      if (!tableBody) return;
      while (tableBody.firstChild) {
        tableBody.removeChild(tableBody.firstChild);
      }
    };

    const showEmpty = () => {
      if (!tableBody) return;
      clearBody();
      const row = document.createElement('tr');
      row.dataset.rosterEmpty = 'true';
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'muted';
      cell.textContent = emptyMessage;
      row.append(cell);
      tableBody.append(row);
    };

    const renderPermissions = (permissions) => {
      if (!Array.isArray(permissions) || !permissions.length) {
        const placeholder = document.createElement('span');
        placeholder.className = 'muted';
        placeholder.textContent = 'Default privileges';
        return placeholder;
      }
      const list = document.createElement('ul');
      list.className = 'chip-list';
      permissions.forEach((permission) => {
        const item = document.createElement('li');
        item.textContent = permissionLabels[permission] || permission;
        list.append(item);
      });
      return list;
    };

    const renderRow = (record) => {
      const row = document.createElement('tr');
      row.dataset.subadminId = record.id;

      const identityCell = document.createElement('td');
      const stack = document.createElement('div');
      stack.className = 'stacked';
      const nameEl = document.createElement('strong');
      nameEl.textContent = record.name || record.email || 'Admin';
      const emailEl = document.createElement('span');
      emailEl.className = 'muted';
      emailEl.textContent = record.email || '—';
      stack.append(nameEl, emailEl);
      identityCell.append(stack);

      const roleCell = document.createElement('td');
      const roleChip = document.createElement('span');
      roleChip.className = 'role-chip';
      roleChip.textContent = roleLabels[record.role] || record.role || 'Admin';
      roleCell.append(roleChip);

      const departmentCell = document.createElement('td');
      if (record.department) {
        departmentCell.textContent = record.department;
      } else {
        departmentCell.className = 'muted';
        departmentCell.textContent = '—';
      }

      const statusCell = document.createElement('td');
      const statusValue = String(record.status || 'active').toLowerCase();
      const statusChip = document.createElement('span');
      statusChip.className = `status-chip status-${statusValue}`;
      statusChip.textContent = statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
      statusCell.append(statusChip);

      const permissionsCell = document.createElement('td');
      permissionsCell.append(renderPermissions(record.permissions));

      row.append(identityCell, roleCell, departmentCell, statusCell, permissionsCell);
      return row;
    };

    const upsert = (record) => {
      if (!tableBody || !record || !record.id) {
        return;
      }
      const safeId = escapeSelector(record.id);
      const existing = tableBody.querySelector(`[data-subadmin-id="${safeId}"]`);
      const nextRow = renderRow(record);
      const emptyRow = tableBody.querySelector('[data-roster-empty]');
      if (emptyRow) {
        emptyRow.remove();
      }
      if (existing) {
        existing.replaceWith(nextRow);
      } else {
        tableBody.prepend(nextRow);
      }
    };

    const refresh = async () => {
      if (!tableBody) return;
      clearBody();
      const loadingRow = document.createElement('tr');
      loadingRow.dataset.rosterLoading = 'true';
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'Loading delegated administrators…';
      loadingRow.append(cell);
      tableBody.append(loadingRow);
      setFeedback('');
      try {
        const response = await fetch('/api/admin/subadmins', {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load delegated admins.');
        }
        const records = Array.isArray(payload.subAdmins) ? payload.subAdmins : [];
        clearBody();
        if (!records.length) {
          showEmpty();
          setFeedback('No delegated administrators yet.', 'info');
          return;
        }
        records
          .sort((a, b) => {
            const nameA = String(a.name || a.email || '').toLowerCase();
            const nameB = String(b.name || b.email || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
          })
          .forEach((record) => {
            tableBody.append(renderRow(record));
          });
        setFeedback(`Showing ${records.length} delegated ${records.length === 1 ? 'admin' : 'admins'}.`, 'success');
      } catch (error) {
        clearBody();
        showEmpty();
        setFeedback(error.message || 'Unable to load delegated admins.', 'error');
      }
    };

    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        refresh();
      });
    }

    refresh();

    return {
      refresh,
      upsert
    };
  };

  const initSubAdminWizard = (rosterApi) => {
    const wizard = document.querySelector('[data-subadmin-wizard]');
    if (!wizard) return;

    let config = {};
    try {
      const rawConfig = wizard.getAttribute('data-config');
      if (rawConfig) {
        config = JSON.parse(rawConfig);
      }
    } catch (error) {
      console.warn('Unable to parse sub-admin wizard configuration', error);
    }

    const allowedRoles = Array.isArray(config.allowedSubAdminRoles) ? config.allowedSubAdminRoles : [];
    if (!allowedRoles.length) {
      return;
    }

    const stages = {
      select: wizard.querySelector('[data-stage="select"]'),
      details: wizard.querySelector('[data-stage="details"]'),
      result: wizard.querySelector('[data-stage="result"]')
    };
    const continueButton = wizard.querySelector('[data-action="advance"]');
    const backButton = wizard.querySelector('[data-action="back"]');
    const finishButton = wizard.querySelector('[data-action="finish-wizard"]');
    const createAnotherButton = wizard.querySelector('[data-action="create-another"]');
    const form = wizard.querySelector('[data-subadmin-form]');
    const feedback = wizard.querySelector('[data-subadmin-feedback]');
    const roleInput = wizard.querySelector('[data-role-input]');
    const submitButton = wizard.querySelector('[data-action="submit"]');
    const resultName = wizard.querySelector('[data-result-name]');
    const resultRole = wizard.querySelector('[data-result-role]');
    const roleButtons = Array.from(wizard.querySelectorAll('[data-role-option]'));
    const selectedRoleLabels = wizard.querySelectorAll('[data-selected-role-label]');

    let selectedRole = '';

    const setSelectedRoleLabel = (role) => {
      const label = roleLabels[role] || role || 'Admin';
      selectedRoleLabels.forEach((node) => {
        node.textContent = label;
      });
    };

    const showStage = (name) => {
      Object.entries(stages).forEach(([key, stage]) => {
        if (!stage) return;
        stage.hidden = key !== name;
      });
      if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('is-success', 'is-error');
      }
    };

    const focusNameField = () => {
      const nameInput = form?.querySelector('input[name="name"]');
      if (nameInput) {
        nameInput.focus();
      }
    };

    const selectRole = (role) => {
      selectedRole = role;
      if (roleInput) {
        roleInput.value = role;
      }
      setSelectedRoleLabel(role);
      roleButtons.forEach((button) => {
        if (button.dataset.role === role) {
          button.classList.add('is-selected');
          button.setAttribute('aria-pressed', 'true');
        } else {
          button.classList.remove('is-selected');
          button.setAttribute('aria-pressed', 'false');
        }
      });
      if (continueButton) {
        continueButton.disabled = !role;
      }
      if (submitButton) {
        submitButton.disabled = !role;
      }
    };

    roleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        selectRole(button.dataset.role || '');
      });
    });

    if (continueButton) {
      continueButton.addEventListener('click', () => {
        if (!selectedRole) return;
        showStage('details');
        focusNameField();
      });
    }

    if (backButton) {
      backButton.addEventListener('click', () => {
        showStage('select');
      });
    }

    const startOver = (preserveRole = false) => {
      form?.reset();
      if (!preserveRole) {
        selectRole('');
        showStage('select');
        return;
      }
      if (!selectedRole && allowedRoles.length) {
        selectRole(allowedRoles[0]);
      }
      showStage('details');
      focusNameField();
    };

    if (finishButton) {
      finishButton.addEventListener('click', () => {
        startOver(false);
      });
    }

    if (createAnotherButton) {
      createAnotherButton.addEventListener('click', () => {
        startOver(true);
      });
    }

    const validatePayload = (payload) => {
      if (!payload.name) {
        return 'Please provide the new administrator\'s name.';
      }
      if (!payload.email) {
        return 'Please provide an email address.';
      }
      if (!payload.password || payload.password.length < 8) {
        return 'Temporary passwords must be at least 8 characters long.';
      }
      return '';
    };

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!selectedRole) {
          if (feedback) {
            feedback.textContent = 'Select a role to continue.';
            feedback.classList.remove('is-success');
            feedback.classList.add('is-error');
          }
          return;
        }

        const formData = new FormData(form);
        const payload = {
          role: selectedRole,
          name: formData.get('name')?.toString().trim() || '',
          email: formData.get('email')?.toString().trim() || '',
          password: formData.get('password')?.toString() || '',
          department: formData.get('department')?.toString().trim() || ''
        };
        payload.department = payload.department || null;

        const validationError = validatePayload(payload);
        if (validationError) {
          if (feedback) {
            feedback.textContent = validationError;
            feedback.classList.remove('is-success');
            feedback.classList.add('is-error');
          }
          return;
        }

        if (feedback) {
          feedback.textContent = '';
          feedback.classList.remove('is-success', 'is-error');
        }
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.dataset.loading = 'true';
        }

        try {
          const response = await fetch('/api/admin/subadmins', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-CSRF-Token': csrfToken
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || 'Unable to create sub-admin.');
          }

          const created = data.subAdmin || {};
          if (resultName) {
            resultName.textContent = created.name || payload.name || 'New admin';
          }
          if (resultRole) {
            const label = roleLabels[created.role] || roleLabels[payload.role] || payload.role;
            resultRole.textContent = label;
          }
          if (typeof rosterApi?.upsert === 'function' && created.id) {
            rosterApi.upsert(created);
          }
          showStage('result');
          if (feedback) {
            feedback.textContent = '';
          }
        } catch (error) {
          if (feedback) {
            feedback.textContent = error.message || 'Something went wrong while creating the account.';
            feedback.classList.remove('is-success');
            feedback.classList.add('is-error');
          }
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            delete submitButton.dataset.loading;
          }
        }
      });
    }

    if (allowedRoles.length === 1) {
      selectRole(allowedRoles[0]);
    }
  };

  const initInquiries = () => {
    const inquiryList = document.querySelector('[data-inquiry-list]');
    if (!inquiryList || typeof window.io !== 'function') {
      return;
    }

    const badge = document.querySelector('[data-inquiry-badge]');
    const badgeValue = badge?.querySelector('[data-inquiry-count]');

    const parseCount = () => {
      if (!badge) return 0;
      const stored = badge.getAttribute('data-open-count');
      const fromText = badgeValue?.textContent?.trim();
      const candidate = Number.parseInt(stored ?? fromText ?? '0', 10);
      return Number.isNaN(candidate) ? 0 : candidate;
    };

    const updateBadge = (next) => {
      if (!badge || !badgeValue) return;
      const safe = Math.max(0, next);
      badge.setAttribute('data-open-count', String(safe));
      badgeValue.textContent = String(safe);
    };

    const formatTimestamp = (iso) => {
      try {
        return new Date(iso).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        return iso;
      }
    };

    const createHiddenInput = (name, value) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      return input;
    };

    const renderInquiry = (inquiry) => {
      const card = document.createElement('li');
      card.className = 'inquiry-card';
      card.dataset.inquiryId = inquiry.id;
      if (inquiry.status === 'resolved') {
        card.classList.add('is-resolved');
      } else {
        card.classList.add('is-new');
      }

      const header = document.createElement('header');
      header.className = 'inquiry-header';

      const stack = document.createElement('div');
      stack.className = 'stacked';

      const nameEl = document.createElement('strong');
      nameEl.textContent = inquiry.name;
      const emailEl = document.createElement('span');
      emailEl.className = 'muted';
      emailEl.textContent = inquiry.email;

      stack.append(nameEl, emailEl);

      const statusChip = document.createElement('span');
      statusChip.className = `status-chip status-${inquiry.status}`;
      statusChip.textContent = inquiry.status;

      header.append(stack, statusChip);

      const message = document.createElement('p');
      message.textContent = inquiry.message;

      const footer = document.createElement('footer');
      footer.className = 'inquiry-footer';

      const meta = document.createElement('small');
      meta.className = 'muted';
      meta.textContent = `Received ${formatTimestamp(inquiry.receivedAt)}`;
      if (inquiry.status === 'resolved' && inquiry.resolvedAt) {
        meta.textContent += ` • Resolved ${formatTimestamp(inquiry.resolvedAt)}`;
      }

      const form = document.createElement('form');
      form.className = 'inline-form';
      form.method = 'post';
      form.action = `/admin/inquiries/${inquiry.id}/status`;
      form.append(createHiddenInput('_csrf', csrfToken));
      form.append(createHiddenInput('status', inquiry.status === 'resolved' ? 'open' : 'resolved'));

      const button = document.createElement('button');
      button.type = 'submit';
      button.className = `pill-link ${inquiry.status === 'resolved' ? 'secondary' : 'primary'}`;
      button.textContent = inquiry.status === 'resolved' ? 'Reopen' : 'Mark resolved';

      form.append(button);
      footer.append(meta, form);

      card.append(header, message, footer);
      return card;
    };

    const removeEmptyState = () => {
      const empty = inquiryList.querySelector('[data-empty]');
      if (empty) {
        empty.remove();
      }
    };

    const socket = window.io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      socket.emit('admin:subscribe', 'inquiries');
    });

    socket.on('inquiry:new', (inquiry) => {
      removeEmptyState();
      const card = renderInquiry(inquiry);
      inquiryList.prepend(card);
      const current = parseCount();
      if (inquiry.status !== 'resolved') {
        updateBadge(current + 1);
      }
      card.addEventListener(
        'animationend',
        () => {
          card.classList.remove('is-new');
        },
        { once: true }
      );
    });
  };

  const rosterApi = initSubAdminRoster();
  initSubAdminWizard(rosterApi);
  initInquiries();
})();
