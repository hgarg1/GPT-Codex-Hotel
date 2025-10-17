const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }
  return response;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseRequirements(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function bindJobToggle(form) {
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
    }
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.is_active = Number(payload.is_active);
    try {
      await request(form.action, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      if (submit) {
        submit.disabled = false;
      }
    }
  });
}

function bindJobDelete(form) {
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = form.querySelector('[data-confirm]')?.getAttribute('data-confirm') || 'Remove this job?';
    if (!window.confirm(message)) {
      return;
    }
    try {
      await request(form.action, {
        method: 'DELETE',
      });
      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  });
}

function appendJobRow(job) {
  const tableSection = document.querySelector('.admin-careers__table');
  const tableBody = tableSection?.querySelector('tbody');
  if (!tableSection || !tableBody) {
    window.location.reload();
    return;
  }

  const row = document.createElement('tr');
  row.dataset.jobId = job.id;
  row.classList.add('is-new');

  const title = escapeHtml(job.title || '—');
  const department = escapeHtml(job.department || '—');
  const location = escapeHtml(job.location || '—');
  const employmentType = escapeHtml(job.employment_type || '—');
  const isActive = Number(job.is_active) === 1;

  row.innerHTML = `
    <td data-label="Title">${title}</td>
    <td data-label="Department">${department || '—'}</td>
    <td data-label="Location">${location || '—'}</td>
    <td data-label="Type">${employmentType || '—'}</td>
    <td data-label="Active">
      <form action="/api/admin/careers/jobs/${job.id}" method="post" data-job-toggle>
        <input type="hidden" name="_method" value="patch" />
        <input type="hidden" name="is_active" value="${isActive ? 0 : 1}" />
        <button type="submit" class="status-toggle ${isActive ? 'is-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}">
          <span class="sr-only">${isActive ? 'Deactivate' : 'Activate'} job</span>
          <span aria-hidden="true">${isActive ? 'Active' : 'Inactive'}</span>
        </button>
      </form>
    </td>
    <td data-label="Actions">
      <div class="table-actions">
        <a class="pill-link" href="/careers/${job.id}" target="_blank" rel="noopener">View</a>
        <form action="/api/admin/careers/jobs/${job.id}" method="post" data-job-delete>
          <input type="hidden" name="_method" value="delete" />
          <button type="submit" class="pill-link danger" data-confirm="Remove this job?">Remove</button>
        </form>
      </div>
    </td>
  `;

  tableBody.prepend(row);
  bindJobToggle(row.querySelector('form[data-job-toggle]'));
  bindJobDelete(row.querySelector('form[data-job-delete]'));
}

const jobWizard = document.querySelector('[data-job-wizard]');

if (jobWizard) {
  const form = jobWizard.querySelector('[data-job-wizard-form]');
  if (!form) {
    console.warn('Job wizard initialisation aborted: form missing');
  }
  const endpoint = jobWizard.getAttribute('data-submit-endpoint') || form?.getAttribute('action');
  if (!form || !endpoint) {
    return;
  }
  const steps = Array.from(form.querySelectorAll('[data-job-step]'));
  const progressItems = Array.from(jobWizard.querySelectorAll('[data-job-progress-step]'));
  const statusEl = jobWizard.querySelector('[data-job-status]');
  const successEl = jobWizard.querySelector('[data-job-success]');
  const successMessageEl = jobWizard.querySelector('[data-job-success-message]');
  const successViewLink = jobWizard.querySelector('[data-job-success-view]');
  const createAnotherButton = jobWizard.querySelector('[data-job-create-another]');
  const submitButton = form.querySelector('[data-job-submit]');

  const previewMap = {
    title: jobWizard.querySelector('[data-job-preview="title"]'),
    department: jobWizard.querySelector('[data-job-preview="department"]'),
    location: jobWizard.querySelector('[data-job-preview="location"]'),
    employment_type: jobWizard.querySelector('[data-job-preview="employment_type"]'),
    description: jobWizard.querySelector('[data-job-preview="description"]'),
    requirements: jobWizard.querySelector('[data-job-preview="requirements"]'),
  };

  const summaryMap = {
    title: jobWizard.querySelector('[data-job-summary="title"]'),
    department: jobWizard.querySelector('[data-job-summary="department"]'),
    location: jobWizard.querySelector('[data-job-summary="location"]'),
    employment_type: jobWizard.querySelector('[data-job-summary="employment_type"]'),
    description: jobWizard.querySelector('[data-job-summary="description"]'),
    requirements: jobWizard.querySelector('[data-job-summary="requirements"]'),
  };

  const previewDefaults = {
    title: previewMap.title?.textContent || 'Your stellar role title',
    department: previewMap.department?.textContent || 'Department awaiting',
    location: previewMap.location?.textContent || 'Location TBD',
    employment_type: previewMap.employment_type?.textContent || 'Employment type',
    description: previewMap.description?.innerHTML || 'Write a luminous description to help talent understand the mission.',
    requirements: previewMap.requirements?.innerHTML || '',
  };

  const summaryDefaults = {
    description: summaryMap.description?.innerHTML || 'No description captured yet.',
  };

  let currentStepIndex = 0;

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.removeAttribute('data-variant');
  }

  function showStatus(message, variant = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.setAttribute('data-variant', variant);
    statusEl.hidden = false;
  }

  function getFormValues() {
    const values = {};
    form.querySelectorAll('[data-job-field]').forEach((field) => {
      const name = field.getAttribute('name');
      if (!name) return;
      if (field instanceof HTMLInputElement && field.type === 'checkbox') {
        values[name] = field.checked;
      } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        values[name] = field.value;
      }
    });
    return values;
  }

  function updatePreviewFromForm() {
    const values = getFormValues();
    const title = (values.title || '').trim();
    const department = (values.department || '').trim();
    const location = (values.location || '').trim();
    const employmentType = (values.employment_type || '').trim();
    const description = (values.description || '').trim();
    const requirementsRaw = (values.requirements || '').trim();

    if (previewMap.title) {
      previewMap.title.textContent = title || previewDefaults.title;
    }
    if (previewMap.department) {
      previewMap.department.textContent = department || previewDefaults.department;
    }
    if (previewMap.location) {
      previewMap.location.textContent = location || previewDefaults.location;
    }
    if (previewMap.employment_type) {
      previewMap.employment_type.textContent = employmentType || previewDefaults.employment_type;
    }
    if (previewMap.description) {
      previewMap.description.innerHTML = description
        ? escapeHtml(description).replace(/\n/g, '<br />')
        : previewDefaults.description;
    }
    if (previewMap.requirements) {
      const list = parseRequirements(requirementsRaw);
      if (list.length) {
        previewMap.requirements.innerHTML = list.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      } else {
        previewMap.requirements.innerHTML = previewDefaults.requirements;
      }
    }

    if (summaryMap.title) {
      summaryMap.title.textContent = title || '—';
    }
    if (summaryMap.department) {
      summaryMap.department.textContent = department || '—';
    }
    if (summaryMap.location) {
      summaryMap.location.textContent = location || '—';
    }
    if (summaryMap.employment_type) {
      summaryMap.employment_type.textContent = employmentType || '—';
    }
    if (summaryMap.description) {
      summaryMap.description.innerHTML = description
        ? escapeHtml(description).replace(/\n/g, '<br />')
        : summaryDefaults.description;
    }
    if (summaryMap.requirements) {
      const list = parseRequirements(requirementsRaw);
      if (list.length) {
        summaryMap.requirements.innerHTML = list
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('');
      } else {
        summaryMap.requirements.innerHTML = '<li class="job-wizard__summary-empty">No requirements captured.</li>';
      }
    }
  }

  function updateProgress() {
    progressItems.forEach((item, index) => {
      item.classList.toggle('is-current', index === currentStepIndex);
      item.classList.toggle('is-complete', index < currentStepIndex);
    });
  }

  function showStep(index) {
    const nextIndex = Math.max(0, Math.min(index, steps.length - 1));
    currentStepIndex = nextIndex;
    steps.forEach((step, stepIndex) => {
      const isCurrent = stepIndex === currentStepIndex;
      step.hidden = !isCurrent;
      step.setAttribute('aria-hidden', String(!isCurrent));
      if (isCurrent) {
        step.removeAttribute('hidden');
      }
    });
    jobWizard.setAttribute('data-current-step', String(currentStepIndex + 1));
    updateProgress();
    if (currentStepIndex === steps.length - 1) {
      updatePreviewFromForm();
    }
  }

  function validateStep(index) {
    const step = steps[index];
    if (!step) return true;
    const fields = Array.from(step.querySelectorAll('input, textarea, select'));
    for (const field of fields) {
      if (field.disabled) continue;
      if (typeof field.reportValidity === 'function' && !field.reportValidity()) {
        return false;
      }
    }
    return true;
  }

  jobWizard.addEventListener('click', (event) => {
    const nextTrigger = event.target instanceof HTMLElement ? event.target.closest('[data-job-next]') : null;
    if (nextTrigger) {
      event.preventDefault();
      clearStatus();
      if (validateStep(currentStepIndex)) {
        showStep(currentStepIndex + 1);
      }
      return;
    }

    const prevTrigger = event.target instanceof HTMLElement ? event.target.closest('[data-job-prev]') : null;
    if (prevTrigger) {
      event.preventDefault();
      clearStatus();
      showStep(currentStepIndex - 1);
    }
  });

  form.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.hasAttribute('data-job-field')) return;
    clearStatus();
    updatePreviewFromForm();
  });

  form.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.hasAttribute('data-job-field')) return;
    clearStatus();
    updatePreviewFromForm();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep(currentStepIndex)) {
      return;
    }
    clearStatus();
    updatePreviewFromForm();
    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'is_active') {
        payload.is_active = 1;
      } else if (typeof value === 'string') {
        payload[key] = value.trim();
      }
    }
    if (payload.is_active !== 1) {
      payload.is_active = 0;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.loading = 'true';
    }
    showStatus('Launching role…', 'info');

    try {
      const response = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      const job = result.job;
      showStatus('Role created successfully.', 'success');
      if (successMessageEl) {
        const baseMessage = job.is_active ? 'is live and visible to candidates.' : 'is saved as a draft.';
        successMessageEl.textContent = `“${job.title}” ${baseMessage}`;
      }
      if (successViewLink) {
        if (Number(job.is_active) === 1) {
          successViewLink.href = `/careers/${job.id}`;
          successViewLink.hidden = false;
        } else {
          successViewLink.hidden = true;
        }
      }
      if (successEl) {
        successEl.hidden = false;
      }
      jobWizard.classList.add('is-success');
      appendJobRow(job);
    } catch (error) {
      showStatus(error.message || 'Unable to create job right now.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        delete submitButton.dataset.loading;
      }
    }
  });

  if (createAnotherButton) {
    createAnotherButton.addEventListener('click', () => {
      form.reset();
      clearStatus();
      if (successEl) {
        successEl.hidden = true;
      }
      jobWizard.classList.remove('is-success');
      updatePreviewFromForm();
      showStep(0);
      const checkbox = form.querySelector('input[name="is_active"]');
      if (checkbox instanceof HTMLInputElement) {
        checkbox.checked = true;
      }
    });
  }

  updatePreviewFromForm();
  showStep(0);
}

document.querySelectorAll('form[data-job-toggle]').forEach(bindJobToggle);
document.querySelectorAll('form[data-job-delete]').forEach(bindJobDelete);

const statusForm = document.querySelector('form[data-careers-status]');
if (statusForm) {
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(statusForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      await request(statusForm.action, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  });
}
