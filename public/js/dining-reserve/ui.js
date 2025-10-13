import { loadState, saveState, setSchedule, setPartySize, setTables, setSelectedTables, setHold, setGuestDetails, setConfirmation, updateStep, resetState, } from './state.js';
import { validateSchedule, validateParty, fetchDiningTables, fetchAvailability, holdTables, releaseHold, validateGuest, submitReservation, } from './api.js';
const root = document.getElementById('dining-reserve-root');
const alertsRegion = document.getElementById('dining-reserve-alerts');
let state = loadState();
let holdCountdownInterval = null;
let isSubmitting = false;
const STEP_LABELS = {
    schedule: 'Date & time',
    party: 'Party size',
    seats: 'Seat selection',
    guest: 'Guest details',
    review: 'Review & confirm',
    confirmation: 'Confirmed',
};
function formatDateDisplay(date) {
    if (!date)
        return '—';
    try {
        const instance = new Date(date);
        return instance.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
    catch (error) {
        return date;
    }
}
function formatTimeDisplay(time) {
    if (!time)
        return '—';
    const [hourStr, minuteStr] = time.split(':');
    if (!hourStr)
        return time;
    const date = new Date();
    date.setHours(Number.parseInt(hourStr, 10), Number.parseInt(minuteStr ?? '0', 10));
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function formatCountdown(expiresAt) {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0)
        return 'expired';
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
function showAlert(message, tone = 'info') {
    if (!alertsRegion)
        return;
    alertsRegion.innerHTML = `<div class="reserve-alert reserve-alert--${tone}" role="alert">${message}</div>`;
}
function clearAlert() {
    if (alertsRegion) {
        alertsRegion.innerHTML = '';
    }
}
function ensurePreviousSteps() {
    if (state.step !== 'schedule' && (!state.date || !state.time)) {
        state = updateStep(state, 'schedule');
    }
    if (state.step !== 'schedule' && state.step !== 'party' && !state.partySize) {
        state = updateStep(state, 'party');
    }
    if (state.step !== 'schedule' && state.step !== 'party' && state.step !== 'seats' && (!state.hold || !state.hold.holdId)) {
        state = updateStep(state, 'seats');
    }
    if (state.step === 'review' && !state.guest) {
        state = updateStep(state, 'guest');
    }
    if (state.step === 'confirmation' && !state.confirmation) {
        state = updateStep(state, 'review');
    }
    return state;
}
async function ensureTablesLoaded() {
    if (state.tables.length > 0) {
        return;
    }
    try {
        const data = await fetchDiningTables();
        state = setTables(state, data.tables);
        saveState(state);
    }
    catch (error) {
        showAlert('Unable to load dining tables. Please refresh.', 'danger');
    }
}
function getStepperMarkup(currentStep) {
    const steps = ['schedule', 'party', 'seats', 'guest', 'review'];
    return `
    <ol class="reserve-stepper" aria-label="Reservation progress">
      ${steps
        .map((step) => {
        const isActive = currentStep === step;
        const isComplete = steps.indexOf(step) < steps.indexOf(currentStep);
        return `<li class="reserve-stepper__item ${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}">
            <span class="reserve-stepper__label">${STEP_LABELS[step]}</span>
          </li>`;
    })
        .join('')}
    </ol>
  `;
}
function renderScheduleStep() {
    const dateValue = state.date ?? '';
    const timeValue = state.time ?? '';
    return `
    <form class="reserve-card" id="reserve-schedule-form">
      <h2>Date & time</h2>
      <p>Select your preferred evening. We host two seatings nightly.</p>
      <label class="reserve-field">
        <span>Date</span>
        <input type="date" name="date" required value="${dateValue}">
      </label>
      <label class="reserve-field">
        <span>Time</span>
        <input type="time" name="time" required value="${timeValue}" step="900">
      </label>
      <button class="reserve-primary" type="submit">Continue</button>
    </form>
  `;
}
function renderPartyStep() {
    const sizeValue = state.partySize ?? '';
    return `
    <form class="reserve-card" id="reserve-party-form">
      <h2>Party size</h2>
      <p>Skyhaven accommodates intimate groups up to twelve guests.</p>
      <label class="reserve-field">
        <span>Guests</span>
        <input type="number" name="partySize" min="1" max="12" required value="${sizeValue}">
      </label>
      <div class="reserve-actions">
        <button type="button" class="reserve-secondary" data-action="back">Back</button>
        <button class="reserve-primary" type="submit">Check availability</button>
      </div>
    </form>
  `;
}
function tableStatus(table) {
    if (state.selectedTableIds.includes(table.id)) {
        return 'selected';
    }
    if (!state.availability) {
        return 'available';
    }
    if (state.availability.availableTableIds.includes(table.id)) {
        return 'available';
    }
    if (state.hold && state.hold.tableIds.includes(table.id)) {
        return 'held';
    }
    return 'unavailable';
}
function renderSeatMap() {
    if (state.tables.length === 0) {
        return '<p class="reserve-muted">Loading seating plan…</p>';
    }
    const [minX, minY, maxX, maxY] = state.tables.reduce((acc, table) => {
        const minx = Math.min(acc[0], table.x);
        const miny = Math.min(acc[1], table.y);
        const maxx = Math.max(acc[2], table.x);
        const maxy = Math.max(acc[3], table.y);
        return [minx, miny, maxx, maxy];
    }, [Infinity, Infinity, -Infinity, -Infinity]);
    const width = maxX - minX + 80;
    const height = maxY - minY + 80;
    const seatButtons = state.tables
        .map((table) => {
        const status = tableStatus(table);
        const left = table.x - minX + 40;
        const top = table.y - minY + 40;
        return `<button class="seat-button seat-button--${status}" data-table-id="${table.id}" style="left:${left}px;top:${top}px" type="button">
        <span class="seat-button__label">${table.label}</span>
        <span class="seat-button__capacity">${table.capacity}</span>
      </button>`;
    })
        .join('');
    return `<div class="reserve-seatmap" style="width:${width}px;height:${height}px">${seatButtons}</div>`;
}
function renderSuggestedCombos() {
    if (!state.availability || state.availability.suggestedCombos.length === 0) {
        return '';
    }
    return `
    <section class="reserve-card reserve-card--subtle">
      <h3>Suggested pairings</h3>
      <ul class="reserve-combos">
        ${state.availability.suggestedCombos
        .map((combo) => {
        const labels = combo
            .map((id) => state.tables.find((table) => table.id === id)?.label || id)
            .join(' + ');
        return `<li><button type="button" class="reserve-chip" data-action="apply-combo" data-combo="${combo.join(',')}">${labels}</button></li>`;
    })
        .join('')}
      </ul>
    </section>
  `;
}
function renderSeatsStep() {
    const holdInfo = state.hold ? `<p class="reserve-hold">Hold active · <span data-role="hold-countdown">${formatCountdown(state.hold.expiresAt)}</span> remaining</p>` : '';
    return `
    <div class="reserve-grid">
      <section class="reserve-card">
        <h2>Select your tables</h2>
        <p>Tap available tables to match your party size. Selected seats glow gold.</p>
        <div class="reserve-seatmap-wrapper" data-role="seat-map">${renderSeatMap()}</div>
        <p class="reserve-capacity">Selected capacity: <span data-role="selected-capacity">${getSelectedCapacity()}</span> / ${state.partySize ?? '—'}</p>
        ${holdInfo}
        <div class="reserve-actions">
          <button type="button" class="reserve-secondary" data-action="back">Back</button>
          <button type="button" class="reserve-primary" data-action="continue-seats">Continue</button>
        </div>
      </section>
      ${renderSuggestedCombos()}
    </div>
  `;
}
function renderGuestStep() {
    const { guest } = state;
    const holdInfo = state.hold
        ? `<p class="reserve-hold">Tables held · <span data-role="hold-countdown">${formatCountdown(state.hold.expiresAt)}</span> remaining</p>`
        : '';
    return `
    <form class="reserve-card" id="reserve-guest-form">
      <h2>Guest details</h2>
      <p>Share contact and considerations so the team can tailor the experience.</p>
      ${holdInfo}
      <label class="reserve-field">
        <span>Primary phone<span aria-hidden="true">*</span></span>
        <input type="tel" name="phone" required value="${guest.phone ?? ''}" placeholder="e.g. +1 415 555 0199">
      </label>
      <label class="reserve-field">
        <span>Contact email</span>
        <input type="email" name="email" value="${guest.email ?? ''}" placeholder="nova@skyhaven.test">
      </label>
      <label class="reserve-field">
        <span>Dietary preferences</span>
        <textarea name="dietary" rows="2" placeholder="Vegetarian tasting, celebrate a birthday">${guest.dietary ?? ''}</textarea>
      </label>
      <label class="reserve-field">
        <span>Allergies</span>
        <textarea name="allergies" rows="2" placeholder="Tree nuts, shellfish">${guest.allergies ?? ''}</textarea>
      </label>
      <label class="reserve-field">
        <span>Notes</span>
        <textarea name="notes" rows="3" placeholder="Favorite cocktails, arrival notes">${guest.notes ?? ''}</textarea>
      </label>
      <div class="reserve-actions">
        <button type="button" class="reserve-secondary" data-action="back">Back</button>
        <button class="reserve-primary" type="submit">Review reservation</button>
      </div>
    </form>
  `;
}
function renderReviewStep() {
    const holdInfo = state.hold
        ? `<p class="reserve-hold">Tables held · <span data-role="hold-countdown">${formatCountdown(state.hold.expiresAt)}</span> remaining</p>`
        : '<p class="reserve-hold reserve-hold--warning">Hold expired · seats will refresh on confirm.</p>';
    const tableList = state.selectedTableIds
        .map((id) => {
        const table = state.tables.find((entry) => entry.id === id);
        if (!table)
            return `<li>${id}</li>`;
        return `<li>${table.label} · seats ${table.capacity}</li>`;
    })
        .join('');
    return `
    <section class="reserve-card">
      <h2>Review & confirm</h2>
      ${holdInfo}
      <dl class="reserve-summary">
        <div><dt>Date</dt><dd>${formatDateDisplay(state.date)}</dd></div>
        <div><dt>Time</dt><dd>${formatTimeDisplay(state.time)}</dd></div>
        <div><dt>Party</dt><dd>${state.partySize ?? '—'} guests</dd></div>
        <div><dt>Tables</dt><dd><ul>${tableList}</ul></dd></div>
        <div><dt>Dietary</dt><dd>${state.guest.dietary || 'None noted'}</dd></div>
        <div><dt>Allergies</dt><dd>${state.guest.allergies || 'None noted'}</dd></div>
        <div><dt>Contact</dt><dd>${state.guest.phone}${state.guest.email ? `<br>${state.guest.email}` : ''}</dd></div>
      </dl>
      <div class="reserve-actions">
        <button type="button" class="reserve-secondary" data-action="back">Back</button>
        <button type="button" class="reserve-primary" data-action="confirm" ${isSubmitting ? 'disabled' : ''}>
          ${isSubmitting ? 'Confirming…' : 'Confirm reservation'}
        </button>
      </div>
    </section>
  `;
}
function renderConfirmationStep() {
    const confirmation = state.confirmation;
    if (!confirmation) {
        return '<section class="reserve-card"><p>Reservation not found.</p></section>';
    }
    const tableList = confirmation.tables
        .map((table) => `<li>${table.label} · seats ${table.capacity}</li>`)
        .join('');
    return `
    <section class="reserve-card reserve-card--success">
      <h2>Reservation secured</h2>
      <p>Your evening is confirmed. Present this QR code to the maître d'.</p>
      <div class="reserve-confirmation-grid">
        <div>
          <dl class="reserve-summary">
            <div><dt>Date</dt><dd>${formatDateDisplay(confirmation.date)}</dd></div>
            <div><dt>Time</dt><dd>${formatTimeDisplay(confirmation.time)}</dd></div>
            <div><dt>Party</dt><dd>${confirmation.partySize} guests</dd></div>
            <div><dt>Tables</dt><dd><ul>${tableList}</ul></dd></div>
            <div><dt>Dietary</dt><dd>${confirmation.dietaryPrefs || 'None noted'}</dd></div>
            <div><dt>Allergies</dt><dd>${confirmation.allergies || 'None noted'}</dd></div>
            <div><dt>Contact</dt><dd>${confirmation.contactPhone ?? ''}${confirmation.contactEmail ? `<br>${confirmation.contactEmail}` : ''}</dd></div>
          </dl>
          <div class="reserve-actions">
            <button type="button" class="reserve-primary" data-action="new-reservation">Book another evening</button>
          </div>
        </div>
        <figure class="reserve-qr">
          <img src="${confirmation.qrCode}" alt="Reservation QR code">
          <figcaption>${confirmation.id}</figcaption>
        </figure>
      </div>
    </section>
  `;
}
function getSelectedCapacity() {
    return state.selectedTableIds.reduce((sum, id) => {
        const table = state.tables.find((entry) => entry.id === id);
        return sum + (table?.capacity ?? 0);
    }, 0);
}
function renderStep() {
    if (!root)
        return;
    clearAlert();
    ensurePreviousSteps();
    let markup = '';
    switch (state.step) {
        case 'schedule':
            markup = renderScheduleStep();
            break;
        case 'party':
            markup = renderPartyStep();
            break;
        case 'seats':
            markup = renderSeatsStep();
            break;
        case 'guest':
            markup = renderGuestStep();
            break;
        case 'review':
            markup = renderReviewStep();
            break;
        case 'confirmation':
            markup = renderConfirmationStep();
            break;
        default:
            markup = '<p>Unknown step.</p>';
    }
    const container = `
    ${state.step === 'confirmation' ? '' : getStepperMarkup(state.step)}
    ${markup}
  `;
    root.innerHTML = container;
    attachHandlers();
    refreshHoldCountdown();
}
function attachHandlers() {
    if (!root)
        return;
    const backButton = root.querySelector('[data-action="back"]');
    if (backButton) {
        backButton.addEventListener('click', () => {
            if (state.step === 'party') {
                state = updateStep(state, 'schedule');
            }
            else if (state.step === 'seats') {
                state = updateStep(state, 'party');
            }
            else if (state.step === 'guest') {
                state = updateStep(state, 'seats');
            }
            else if (state.step === 'review') {
                state = updateStep(state, 'guest');
            }
            saveState(state);
            renderStep();
        });
    }
    if (state.step === 'schedule') {
        const form = document.getElementById('reserve-schedule-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const date = String(formData.get('date') || '').trim();
            const time = String(formData.get('time') || '').trim();
            if (!date || !time) {
                showAlert('Choose both date and time to continue.', 'warning');
                return;
            }
            try {
                const result = await validateSchedule(date, time);
                state = setSchedule(state, result.date, result.time);
                saveState(state);
                renderStep();
            }
            catch (error) {
                const apiError = error;
                showAlert(apiError.message || 'Unable to validate schedule.', 'danger');
            }
        });
    }
    if (state.step === 'party') {
        const form = document.getElementById('reserve-party-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const partySizeRaw = String(formData.get('partySize') || '');
            const partySize = Number.parseInt(partySizeRaw, 10);
            if (!state.date || !state.time) {
                showAlert('Select date and time before choosing party size.', 'warning');
                return;
            }
            if (Number.isNaN(partySize) || partySize <= 0) {
                showAlert('Enter a valid party size.', 'warning');
                return;
            }
            try {
                const result = await validateParty(state.date, state.time, partySize);
                state = setPartySize(state, result.partySize, result.availability);
                saveState(state);
                await ensureTablesLoaded();
                renderStep();
            }
            catch (error) {
                const apiError = error;
                showAlert(apiError.message || 'Unable to validate party size.', 'danger');
            }
        });
    }
    if (state.step === 'seats') {
        const seatMap = root.querySelector('[data-role="seat-map"]');
        if (seatMap) {
            seatMap.addEventListener('click', (event) => {
                const target = event.target;
                const button = target.closest('button[data-table-id]');
                if (!button)
                    return;
                const tableId = button.dataset.tableId;
                if (!tableId)
                    return;
                if (button.classList.contains('seat-button--unavailable')) {
                    showAlert('That table is not available for this seating.', 'warning');
                    return;
                }
                const nextSelection = new Set(state.selectedTableIds);
                if (nextSelection.has(tableId)) {
                    nextSelection.delete(tableId);
                }
                else {
                    nextSelection.add(tableId);
                }
                state = setSelectedTables(state, Array.from(nextSelection));
                saveState(state);
                renderStep();
            });
        }
        const comboButtons = root.querySelectorAll('[data-action="apply-combo"]');
        comboButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const comboIds = (button.dataset.combo || '').split(',').filter(Boolean);
                state = setSelectedTables(state, comboIds);
                saveState(state);
                renderStep();
            });
        });
        const continueButton = root.querySelector('[data-action="continue-seats"]');
        continueButton?.addEventListener('click', async () => {
            if (!state.date || !state.time || !state.partySize) {
                showAlert('Select date, time, and party size before choosing seats.', 'warning');
                return;
            }
            if (state.selectedTableIds.length === 0) {
                showAlert('Choose at least one table to continue.', 'warning');
                return;
            }
            const capacity = getSelectedCapacity();
            if (capacity < state.partySize) {
                showAlert('Selected tables do not seat the full party.', 'warning');
                return;
            }
            try {
                if (state.hold && state.hold.holdId) {
                    await releaseHold(state.hold.holdId);
                }
                const hold = await holdTables(state.date, state.time, state.selectedTableIds);
                state = setHold(state, hold);
                state = updateStep(state, 'guest');
                saveState(state);
                renderStep();
            }
            catch (error) {
                const apiError = error;
                if (apiError.status === 409) {
                    showAlert(apiError.message || 'Those tables were just taken. Updating availability.', 'danger');
                    if (state.date && state.time && state.partySize) {
                        try {
                            const availability = await fetchAvailability(state.date, state.time, state.partySize);
                            state = setPartySize(state, state.partySize, availability);
                            state = updateStep(state, 'seats');
                            saveState(state);
                            renderStep();
                            return;
                        }
                        catch (refreshError) {
                            showAlert('Unable to refresh availability. Please try again.', 'danger');
                        }
                    }
                }
                else {
                    showAlert(apiError.message || 'Unable to hold tables.', 'danger');
                }
            }
        });
    }
    if (state.step === 'guest') {
        const form = document.getElementById('reserve-guest-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!state.hold || !state.hold.holdId) {
                showAlert('Please reselect tables before continuing.', 'warning');
                state = updateStep(state, 'seats');
                renderStep();
                return;
            }
            const formData = new FormData(form);
            const guest = {
                phone: String(formData.get('phone') || '').trim(),
                email: String(formData.get('email') || '').trim(),
                dietary: String(formData.get('dietary') || '').trim(),
                allergies: String(formData.get('allergies') || '').trim(),
                notes: String(formData.get('notes') || '').trim(),
            };
            try {
                const validated = await validateGuest(guest);
                state = setGuestDetails(state, validated);
                saveState(state);
                renderStep();
            }
            catch (error) {
                const apiError = error;
                showAlert(apiError.message || 'Unable to validate guest details.', 'danger');
            }
        });
    }
    if (state.step === 'review') {
        const confirmButton = root.querySelector('[data-action="confirm"]');
        confirmButton?.addEventListener('click', async () => {
            if (!state.hold || !state.hold.holdId || !state.date || !state.time || !state.partySize) {
                showAlert('Reservation details incomplete. Returning to seat selection.', 'warning');
                state = updateStep(state, 'seats');
                renderStep();
                return;
            }
            if (isSubmitting)
                return;
            isSubmitting = true;
            renderStep();
            try {
                const confirmation = await submitReservation({
                    holdId: state.hold.holdId,
                    date: state.date,
                    time: state.time,
                    partySize: state.partySize,
                    tableIds: state.selectedTableIds,
                    guest: state.guest,
                });
                state = setHold(state, null);
                state = setConfirmation(state, confirmation);
                saveState(state);
                isSubmitting = false;
                renderStep();
            }
            catch (error) {
                isSubmitting = false;
                const apiError = error;
                if (apiError.status === 409) {
                    showAlert(apiError.message || 'Those tables were just taken. Returning to availability.', 'danger');
                    if (state.hold?.holdId) {
                        await releaseHold(state.hold.holdId);
                    }
                    if (state.date && state.time && state.partySize) {
                        try {
                            const availability = await fetchAvailability(state.date, state.time, state.partySize);
                            state = setPartySize(state, state.partySize, availability);
                        }
                        catch (refreshError) {
                            showAlert('Unable to refresh availability. Please try again.', 'danger');
                        }
                    }
                    state = setHold(state, null);
                    state = updateStep(state, 'seats');
                    saveState(state);
                    renderStep();
                }
                else if (apiError.status === 410) {
                    showAlert(apiError.message || 'Hold expired. Please reselect tables.', 'warning');
                    state = setHold(state, null);
                    state = updateStep(state, 'seats');
                    saveState(state);
                    renderStep();
                }
                else {
                    showAlert(apiError.message || 'Unable to confirm reservation. Please try again.', 'danger');
                    renderStep();
                }
            }
        });
    }
    if (state.step === 'confirmation') {
        const button = root.querySelector('[data-action="new-reservation"]');
        button?.addEventListener('click', () => {
            state = resetState();
            saveState(state);
            renderStep();
        });
    }
}
function refreshHoldCountdown() {
    if (holdCountdownInterval) {
        window.clearInterval(holdCountdownInterval);
        holdCountdownInterval = null;
    }
    const countdownEl = root?.querySelector('[data-role="hold-countdown"]');
    if (!countdownEl || !state.hold) {
        return;
    }
    const update = () => {
        if (!state.hold)
            return;
        const display = formatCountdown(state.hold.expiresAt);
        countdownEl.textContent = display;
        if (display === 'expired') {
            window.clearInterval(holdCountdownInterval ?? undefined);
            holdCountdownInterval = null;
        }
    };
    update();
    holdCountdownInterval = window.setInterval(update, 1000);
}
async function refreshAvailabilityOnFocus() {
    if (!state.date || !state.time || !state.partySize) {
        return;
    }
    try {
        const availability = await fetchAvailability(state.date, state.time, state.partySize);
        state = setPartySize(state, state.partySize, availability);
        state = updateStep(state, 'seats');
        saveState(state);
        renderStep();
    }
    catch (error) {
        console.warn('Failed to refresh availability on focus', error);
    }
}
function attachGlobalListeners() {
    window.addEventListener('beforeunload', () => {
        if (state.hold?.holdId) {
            const payload = JSON.stringify({ holdId: state.hold.holdId });
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon('/api/dining/release', blob);
        }
    });
    window.addEventListener('focus', () => {
        if (state.step === 'seats') {
            refreshAvailabilityOnFocus();
        }
    });
}
export async function initializeReserveUI() {
    if (!root) {
        console.warn('Dining reserve root not found');
        return;
    }
    attachGlobalListeners();
    await ensureTablesLoaded();
    renderStep();
}
void initializeReserveUI();
