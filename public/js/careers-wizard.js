const container = document.querySelector('.careers-apply');
if (container) {
  const step = Number(container.dataset.step || '1');
  const jobId = container.dataset.jobId;
  const stepEndpoint = container.dataset.stepEndpoint;
  const submitEndpoint = container.dataset.submitEndpoint;
  const csrfToken = container.dataset.csrf;
  const feedback = container.querySelector('.careers-form-feedback');
  const form = container.querySelector('form[data-careers-step]');

  function resolveStorage() {
    try {
      const key = '__careers_wizard_test__';
      window.localStorage.setItem(key, 'ok');
      window.localStorage.removeItem(key);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  const storage = resolveStorage();
  const draftKey = storage && jobId ? `careers:wizard:${jobId}:step:${step}` : null;
  const shouldPersistDraft = Boolean(form && draftKey && form.enctype !== 'multipart/form-data');
  let hasPendingChanges = false;

  const beforeUnloadHandler = (event) => {
    if (!hasPendingChanges) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  function setFeedback(message, type = 'info') {
    if (!feedback) return;
    feedback.textContent = '';
    if (!message) {
      feedback.className = 'careers-form-feedback';
      return;
    }
    feedback.className = `careers-form-feedback is-${type}`;
    feedback.textContent = message;
  }

  function serialiseFormData(targetForm) {
    const result = {};
    if (!targetForm) {
      return result;
    }
    const elements = Array.from(targetForm.elements);
    elements.forEach((element) => {
      if (
        !(element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement)
      ) {
        return;
      }
      const name = element.name;
      if (!name) return;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'file') {
          return;
        }
        if (element.type === 'checkbox') {
          result[name] = element.checked;
          return;
        }
        if (element.type === 'radio') {
          if (element.checked) {
            result[name] = element.value;
          } else if (!(name in result)) {
            result[name] = null;
          }
          return;
        }
      }
      result[name] = element.value;
    });
    return result;
  }

  function restoreDraft(targetForm, draft) {
    if (!targetForm || !draft) {
      return;
    }
    Object.entries(draft).forEach(([name, value]) => {
      const field = targetForm.elements.namedItem(name);
      if (!field) return;
      if (field instanceof RadioNodeList) {
        Array.from(field).forEach((node) => {
          if (node instanceof HTMLInputElement && node.type === 'radio') {
            node.checked = node.value === value;
          }
        });
        return;
      }
      const element = field;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else if (element.type !== 'file') {
          element.value = typeof value === 'string' ? value : value ?? '';
        }
      } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        element.value = typeof value === 'string' ? value : value ?? '';
      }
    });
  }

  function persistDraft() {
    if (!shouldPersistDraft || !storage || !draftKey) {
      return;
    }
    const draft = serialiseFormData(form);
    storage.setItem(draftKey, JSON.stringify(draft));
  }

  function clearDraft() {
    if (!storage || !draftKey) {
      return;
    }
    storage.removeItem(draftKey);
  }

  function markDirty() {
    hasPendingChanges = true;
  }

  function disableButton(button, disabled) {
    if (!button) return;
    button.disabled = disabled;
    button.setAttribute('aria-busy', disabled ? 'true' : 'false');
  }

  function buildStepUrl(nextStep) {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(nextStep));
    return url.toString();
  }

  function handleStepSubmit(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!jobId) return;
      setFeedback('');
      disableButton(submitButton, true);
      setFeedback('Saving progress…', 'info');

      try {
        let response;
        if (step === 4) {
          const formData = new FormData(form);
          const resume = form.querySelector('#resume');
          const resumeFile = resume && resume.files ? resume.files[0] : null;
          if (!resumeFile || resumeFile.type !== 'application/pdf') {
            throw new Error('Please upload a PDF resume.');
          }
          if (resumeFile.size > 5 * 1024 * 1024) {
            throw new Error('Files must be 5MB or smaller.');
          }
          formData.append('jobId', jobId);
          formData.append('step', String(step));
          response = await fetch(stepEndpoint, {
            method: 'POST',
            body: formData,
            headers: {
              'x-csrf-token': csrfToken,
            },
            credentials: 'same-origin',
          });
        } else {
          const payload = new FormData(form);
          payload.append('jobId', jobId);
          payload.append('step', String(step));
          const data = Object.fromEntries(payload.entries());
          response = await fetch(stepEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            credentials: 'same-origin',
            body: JSON.stringify(data),
          });
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Unable to save this step.');
        }

        const json = await response.json();
        clearDraft();
        hasPendingChanges = false;
        const nextStepUrl = json.next || buildStepUrl(step + 1);
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        window.location.href = nextStepUrl;
      } catch (error) {
        setFeedback(error.message || 'We hit a snag. Please try again.', 'error');
        disableButton(submitButton, false);
        hasPendingChanges = true;
      }
    });
  }

  function handleSubmitStep(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!jobId) return;
      setFeedback('');
      disableButton(submitButton, true);
      setFeedback('Submitting application…', 'info');
      const payload = new FormData(form);
      payload.append('jobId', jobId);
      try {
        const response = await fetch(submitEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'same-origin',
          body: JSON.stringify(Object.fromEntries(payload.entries())),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Unable to submit application.');
        }
        const json = await response.json();
        form.classList.add('is-hidden');
        setFeedback(`Thanks for applying! Your tracking ID is ${json.trackingId}.`, 'success');
        if (feedback) {
          const link = document.createElement('a');
          link.href = json.confirmationUrl;
          link.textContent = 'Track my application';
          link.className = 'pill-link';
          feedback.appendChild(document.createElement('br'));
          feedback.appendChild(link);
        }
        clearDraft();
        hasPendingChanges = false;
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      } catch (error) {
        setFeedback(error.message || 'We could not submit your application.', 'error');
        disableButton(submitButton, false);
        hasPendingChanges = true;
      }
    });
  }

  if (form) {
    if (step === 5) {
      handleSubmitStep(form);
    } else {
      handleStepSubmit(form);
    }
  }

  if (form && shouldPersistDraft && storage && draftKey) {
    try {
      const stored = storage.getItem(draftKey);
      if (stored) {
        restoreDraft(form, JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to restore careers draft', error);
    }
  }

  if (form) {
    const requiredFields = Array.from(
      form.querySelectorAll('input[required], textarea[required]')
    );
    requiredFields.forEach((field) => {
      field.addEventListener('input', () => {
        const formEl = field.closest('form');
        if (!formEl) return;
        const button = formEl.querySelector('button[type="submit"]');
        if (!button) return;
        const invalid = !formEl.checkValidity();
        button.disabled = invalid;
      });
      const formEl = field.closest('form');
      const button = formEl?.querySelector('button[type="submit"]');
      if (formEl && button) {
        button.disabled = !formEl.checkValidity();
      }
    });

    const persistableFields = Array.from(form.elements).filter((element) =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    );

    persistableFields.forEach((element) => {
      const eventName = element instanceof HTMLInputElement && element.type === 'checkbox' ? 'change' : 'input';
      element.addEventListener(eventName, () => {
        markDirty();
        if (shouldPersistDraft) {
          persistDraft();
        }
      });
      if (element instanceof HTMLInputElement && element.type === 'file') {
        element.addEventListener('change', () => {
          markDirty();
        });
      }
    });

    if (shouldPersistDraft) {
      persistDraft();
    }
  }
}
