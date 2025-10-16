const container = document.querySelector('.careers-apply');
if (container) {
  const step = Number(container.dataset.step || '1');
  const totalSteps = Number(container.dataset.totalSteps || '5');
  const jobId = container.dataset.jobId;
  const stepEndpoint = container.dataset.stepEndpoint;
  const submitEndpoint = container.dataset.submitEndpoint;
  const csrfToken = container.dataset.csrf;
  const feedback = container.querySelector('.careers-form-feedback');
  const progressBar = container.querySelector('[data-progress-bar]');
  const progressLabel = container.querySelector('[data-progress-label]');
  const successCard = container.querySelector('[data-success-card]');
  const successId = successCard?.querySelector('[data-success-id]');
  const successTrack = successCard?.querySelector('[data-success-track]');

  function syncProgress() {
    if (progressBar) {
      const percent = Math.min(100, Math.max(0, (step / totalSteps) * 100));
      progressBar.style.setProperty('--progress', `${percent}%`);
      progressBar.setAttribute('aria-valuenow', String(step));
    }
    if (progressLabel) {
      progressLabel.textContent = `Step ${step} of ${totalSteps}`;
    }
  }

  syncProgress();

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
        const nextStepUrl = json.next || buildStepUrl(step + 1);
        window.location.href = nextStepUrl;
      } catch (error) {
        setFeedback(error.message || 'We hit a snag. Please try again.', 'error');
        disableButton(submitButton, false);
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
        if (successCard) {
          successCard.hidden = false;
          successCard.classList.add('is-visible');
          if (successId) {
            successId.textContent = json.trackingId;
          }
          if (successTrack) {
            successTrack.setAttribute('href', json.confirmationUrl);
          }
          successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (feedback) {
          feedback.setAttribute('role', 'status');
        }
      } catch (error) {
        setFeedback(error.message || 'We could not submit your application.', 'error');
        disableButton(submitButton, false);
      }
    });
  }

  const form = container.querySelector('form[data-careers-step]');
  if (form) {
    if (step === 5) {
      handleSubmitStep(form);
    } else {
      handleStepSubmit(form);
    }
  }

  const requiredFields = Array.from(
    container.querySelectorAll('form[data-careers-step] input[required], form[data-careers-step] textarea[required]')
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
}
