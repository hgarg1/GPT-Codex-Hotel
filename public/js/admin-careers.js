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

const jobForm = document.querySelector('[data-careers-job-form]');
if (jobForm) {
  jobForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = jobForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    const formData = new FormData(jobForm);
    const payload = Object.fromEntries(formData.entries());
    payload.is_active = formData.get('is_active') ? 1 : 0;
    try {
      await request(jobForm.action, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.location.reload();
    } catch (error) {
      alert(error.message);
      submit.disabled = false;
    }
  });
}

document.querySelectorAll('form[data-job-toggle]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
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
    }
  });
});

document.querySelectorAll('form[data-job-delete]').forEach((form) => {
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
});

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
