import { loadState, saveState, setSchedule, setPartySize, setTables, setSelectedTables, setHold, setGuestDetails, setConfirmation, updateStep, resetState, } from './state.js';
import { validateSchedule, validateParty, fetchDiningTables, fetchAvailability, holdTables, releaseHold, validateGuest, submitReservation, } from './api.js';
const root = document.getElementById('dining-reserve-root');
const alertsRegion = document.getElementById('dining-reserve-alerts');
let state = loadState();
let holdCountdownInterval = null;
let isSubmitting = false;
let spotlightTableId = null;
let celebratedConfirmationId = null;
const STEP_LABELS = {
    schedule: 'Date & time',
    party: 'Party size',
    seats: 'Seat selection',
    guest: 'Guest details',
    review: 'Review & confirm',
    confirmation: 'Confirmed',
};
const ZONE_DETAILS = {
    atrium: {
        name: 'Atrium',
        description: 'Sunken lounge ringed with glass panels that shimmer with the aurora display.',
        accent: '#7ebcff',
        highlights: ['Aurora canopy overhead', 'Closest to the ambient harpist alcove'],
    },
    garden: {
        name: 'Glass Garden',
        description: 'Bioluminescent planters and living walls wrap these tables in greenery.',
        accent: '#74d1a2',
        highlights: ['Fragrant herb planters', 'Perfect for botanical cocktail pairings'],
    },
    'chef-s-counter': {
        name: "Chef's Counter",
        description: 'Front-row vantage of the culinary line with stories from the chefs.',
        accent: '#f9d27d',
        highlights: ['Live plating and narration', 'Ideal for adventurous tasting add-ons'],
    },
    'chefs-counter': {
        name: "Chef's Counter",
        description: 'Front-row vantage of the culinary line with stories from the chefs.',
        accent: '#f9d27d',
        highlights: ['Live plating and narration', 'Ideal for adventurous tasting add-ons'],
    },
    observatory: {
        name: 'Observatory',
        description: 'Skyline panorama with projected constellations that slowly drift during service.',
        accent: '#c79bff',
        highlights: ['Constellation projection dome', 'Sweeping view across the city lights'],
    },
    lounge: {
        name: 'Solstice Lounge',
        description: 'Low-slung banquettes with a resident mixologist crafting bespoke pairings.',
        accent: '#ff9ec7',
        highlights: ['Resident mixologist nearby', 'Lush velvet acoustics for conversation'],
    },
    terrace: {
        name: 'Celestial Terrace',
        description: 'Climate-controlled terrace edged by floating lanterns and fireglass.',
        accent: '#7ff0d8',
        highlights: ['Lantern-lit horizon', 'Best for sunset proposals and celebrations'],
    },
    default: {
        name: 'Main floor',
        description: 'Balanced vantage with curated acoustics and attentive service cadence.',
        accent: '#cfa858',
        highlights: ['Signature Skyhaven service', 'Balanced acoustics across the room'],
    },
};
const CONFETTI_COLORS = ['#f9d27d', '#7ebcff', '#c79bff', '#74d1a2', '#ff9ec7'];
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
function normalizeZoneKey(zone) {
    if (!zone)
        return 'default';
    return zone
        .toString()
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'default';
}
function getZoneDetails(zone) {
    const key = normalizeZoneKey(zone);
    const base = ZONE_DETAILS[key] ?? ZONE_DETAILS.default;
    const providedName = typeof zone === 'string' && zone.trim().length > 0 ? zone.trim() : ZONE_DETAILS.default.name;
    return {
        key,
        name: base.name ?? providedName,
        description: base.description ?? ZONE_DETAILS.default.description,
        accent: base.accent ?? ZONE_DETAILS.default.accent,
        highlights: Array.isArray(base.highlights) && base.highlights.length > 0
            ? base.highlights
            : ZONE_DETAILS.default.highlights,
    };
}
function getSpotlightTargetId() {
    if (spotlightTableId && state.tables.some((table) => table.id === spotlightTableId)) {
        return spotlightTableId;
    }
    if (state.selectedTableIds.length > 0) {
        const fallbackId = state.selectedTableIds[state.selectedTableIds.length - 1];
        if (fallbackId && state.tables.some((table) => table.id === fallbackId)) {
            return fallbackId;
        }
    }
    return null;
}
function getSpotlightTable() {
    const targetId = getSpotlightTargetId();
    if (!targetId)
        return null;
    return state.tables.find((table) => table.id === targetId) ?? null;
}
function setSpotlight(tableId, options = {}) {
    if (tableId && !state.tables.some((table) => table.id === tableId)) {
        return;
    }
    spotlightTableId = tableId;
    if (options.defer) {
        return;
    }
    updateSeatInsightsPanel();
    applySpotlightToButtons();
}
function getCapacityDescriptor(capacity) {
    if (capacity <= 2)
        return 'Intimate duo setting';
    if (capacity <= 4)
        return 'Perfect for a quartet of guests';
    if (capacity <= 6)
        return 'Celebration-ready table';
    return 'Private gathering capacity';
}
function getStatusDescriptor(table) {
    const status = tableStatus(table);
    switch (status) {
        case 'selected':
            return 'Reserved just for your party';
        case 'available':
            return 'Available this seating';
        case 'held':
            return 'Briefly held by another guest';
        case 'unavailable':
        default:
            return 'Not available right now';
    }
}
function renderSeatHighlights(highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0)
        return '';
    return `<ul class="reserve-seatinsights__highlights">${highlights
        .map((item) => `<li>${item}</li>`)
        .join('')}</ul>`;
}
function renderSeatInsightsContent() {
    const table = getSpotlightTable();
    if (!table) {
        return `
      <div class="reserve-seatinsights__empty">
        <h3>Explore the dining room</h3>
        <p>Select a table in the map to preview its ambience, recommended experiences, and how it fits your party.</p>
      </div>
    `;
    }
    const zoneDetails = getZoneDetails(table.zone);
    const fitsParty = state.partySize ? table.capacity >= state.partySize : null;
    const gaugePercent = state.partySize
        ? Math.min(100, Math.round((Math.min(table.capacity, state.partySize) / table.capacity) * 100))
        : 100;
    const gaugeLabel = state.partySize
        ? table.capacity >= state.partySize
            ? `Comfortably seats your ${state.partySize}-guest party`
            : `Add ${state.partySize - table.capacity} more seats to fit everyone`
        : `${table.capacity} seats available`;
    return `
    <header>
      <span class="reserve-seatinsights__eyebrow" style="--accent:${zoneDetails.accent}">${zoneDetails.name}</span>
      <h3>Table ${table.label}</h3>
    </header>
    <p>${zoneDetails.description}</p>
    <div class="reserve-seatinsights__stats">
      <div>
        <span class="reserve-seatinsights__stat-label">Capacity</span>
        <span class="reserve-seatinsights__stat-value">${table.capacity} guests</span>
        <span class="reserve-seatinsights__stat-note">${getCapacityDescriptor(table.capacity)}</span>
      </div>
      <div>
        <span class="reserve-seatinsights__stat-label">Status</span>
        <span class="reserve-seatinsights__stat-value">${getStatusDescriptor(table)}</span>
        <span class="reserve-seatinsights__stat-note">${state.partySize ? `Planning for ${state.partySize}` : 'Select party size to tailor fit'}</span>
      </div>
    </div>
    <div class="reserve-seatinsights__gauge ${fitsParty === false ? 'is-warning' : ''}" role="img" aria-label="${gaugeLabel}">
      <div class="reserve-seatinsights__gauge-track">
        <div class="reserve-seatinsights__gauge-fill" style="width:${gaugePercent}%"></div>
      </div>
      <span class="reserve-seatinsights__gauge-label">${gaugeLabel}</span>
    </div>
    ${renderSeatHighlights(zoneDetails.highlights)}
  `;
}
function renderZoneLegend() {
    const zoneMap = new Map();
    state.tables.forEach((table) => {
        const key = normalizeZoneKey(table.zone);
        if (!key || key === 'default') {
            return;
        }
        if (!zoneMap.has(key)) {
            zoneMap.set(key, table.zone);
        }
    });
    if (zoneMap.size === 0) {
        return '';
    }
    return `
    <section class="reserve-card reserve-card--subtle reserve-zonelegend">
      <h3>Ambience map</h3>
      <ul>
        ${Array.from(zoneMap.entries())
        .map(([key, label]) => {
        const details = getZoneDetails(label ?? key);
        return `<li data-zone-key="${key}">
              <span class="reserve-zonelegend__swatch" style="--accent:${details.accent}"></span>
              <div>
                <span class="reserve-zonelegend__name">${details.name}</span>
                <p>${details.description}</p>
              </div>
            </li>`;
    })
        .join('')}
      </ul>
    </section>
  `;
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
    if ((state.step === 'guest' || state.step === 'review') && (!state.hold || !state.hold.holdId)) {
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
    const width = Math.max(360, maxX - minX + 160);
    const height = Math.max(320, maxY - minY + 160);
    const seatButtons = state.tables
        .map((table) => {
        const status = tableStatus(table);
        const left = table.x - minX + 80;
        const top = table.y - minY + 80;
        const zoneDetails = getZoneDetails(table.zone);
        const isSelected = state.selectedTableIds.includes(table.id);
        const title = `Table ${table.label} • ${zoneDetails.name} • seats ${table.capacity}`;
        return `<button class="seat-button seat-button--${status}" data-table-id="${table.id}" data-zone-key="${zoneDetails.key}" data-zone-name="${zoneDetails.name}" aria-pressed="${isSelected}" aria-label="${title}" title="${title}" style="left:${left}px;top:${top}px;--accent:${zoneDetails.accent}" type="button">
        <span class="seat-button__halo" aria-hidden="true"></span>
        <span class="seat-button__label">${table.label}</span>
        <span class="seat-button__capacity">${table.capacity}</span>
      </button>`;
    })
        .join('');
    return `<div class="reserve-seatmap" style="width:${width}px;height:${height}px">
      <div class="reserve-seatmap__ambient reserve-seatmap__ambient--aurora" aria-hidden="true"></div>
      <div class="reserve-seatmap__ambient reserve-seatmap__ambient--floor" aria-hidden="true"></div>
      <div class="reserve-seatmap__overlay reserve-seatmap__overlay--kitchen" aria-hidden="true"><span>Chef’s line</span></div>
      <div class="reserve-seatmap__overlay reserve-seatmap__overlay--bar" aria-hidden="true"><span>Aurora bar</span></div>
      ${seatButtons}
    </div>`;
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
      <section class="reserve-card reserve-card--immersive">
        <div class="reserve-card__intro">
          <h2>Select your tables</h2>
          <p>Glide across the floor plan, tap glowing seats, and preview the ambience of each zone in real time.</p>
        </div>
        <div class="reserve-seatmap-layout">
          <div class="reserve-seatmap-wrapper" data-role="seat-map">${renderSeatMap()}</div>
          <aside class="reserve-seatinsights" data-role="seat-insights">${renderSeatInsightsContent()}</aside>
        </div>
        <p class="reserve-capacity">Selected capacity: <span data-role="selected-capacity">${getSelectedCapacity()}</span> / ${state.partySize ?? '—'}</p>
        ${holdInfo}
        <div class="reserve-actions">
          <button type="button" class="reserve-secondary" data-action="back">Back</button>
          <button type="button" class="reserve-primary" data-action="continue-seats">Continue</button>
        </div>
      </section>
      ${renderZoneLegend()}
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
    <section class="reserve-card reserve-card--success reserve-card--celebration">
      <h2>Reservation secured</h2>
      <p>Your evening is confirmed. Present this QR code to the maître d'.</p>
      <div class="reserve-celebration__banner" aria-hidden="true">
        <span>✨</span>
        <span>Expect a sparkling welcome upon arrival.</span>
      </div>
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
    syncSeatExperience();
    maybeTriggerCelebration();
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
                setSpotlight(tableId, { defer: true });
                state = setSelectedTables(state, Array.from(nextSelection));
                saveState(state);
                renderStep();
            });
            seatMap.addEventListener('pointerover', (event) => {
                const target = event.target;
                const button = target.closest('button[data-table-id]');
                if (!button)
                    return;
                const tableId = button.dataset.tableId;
                if (tableId) {
                    setSpotlight(tableId);
                }
            });
            seatMap.addEventListener('focusin', (event) => {
                const target = event.target;
                const button = target.closest('button[data-table-id]');
                if (!button)
                    return;
                const tableId = button.dataset.tableId;
                if (tableId) {
                    setSpotlight(tableId);
                }
            });
            seatMap.addEventListener('pointerleave', () => {
                if (state.selectedTableIds.length > 0) {
                    const fallback = state.selectedTableIds[state.selectedTableIds.length - 1];
                    setSpotlight(fallback);
                }
                else {
                    setSpotlight(null);
                }
            });
        }
        const comboButtons = root.querySelectorAll('[data-action="apply-combo"]');
        comboButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const comboIds = (button.dataset.combo || '').split(',').filter(Boolean);
                const focusId = comboIds[comboIds.length - 1] ?? comboIds[0] ?? null;
                if (focusId) {
                    setSpotlight(focusId, { defer: true });
                }
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
function updateSeatInsightsPanel() {
    if (state.step !== 'seats') {
        return;
    }
    const panel = root?.querySelector('[data-role="seat-insights"]');
    if (panel) {
        panel.innerHTML = renderSeatInsightsContent();
    }
}
function applySpotlightToButtons() {
    if (state.step !== 'seats') {
        return;
    }
    const targetId = getSpotlightTargetId();
    const buttons = root?.querySelectorAll('.seat-button');
    if (!buttons)
        return;
    buttons.forEach((button) => {
        if (!(button instanceof HTMLElement)) {
            return;
        }
        if (targetId && button.dataset.tableId === targetId) {
            button.setAttribute('data-spotlight', 'true');
        }
        else {
            button.removeAttribute('data-spotlight');
        }
    });
}
function syncSeatExperience() {
    if (state.step !== 'seats') {
        return;
    }
    if (!getSpotlightTargetId() && state.tables.length > 0) {
        setSpotlight(state.tables[0].id, { defer: true });
    }
    updateSeatInsightsPanel();
    applySpotlightToButtons();
}
function triggerConfettiBurst() {
    if (typeof document === 'undefined') {
        return;
    }
    const container = document.createElement('div');
    container.className = 'reserve-confetti';
    const pieces = 160;
    for (let index = 0; index < pieces; index += 1) {
        const piece = document.createElement('span');
        piece.className = 'reserve-confetti__piece';
        const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
        piece.style.setProperty('--left', `${Math.random() * 100}%`);
        piece.style.setProperty('--animation-delay', `${Math.random() * 0.6}s`);
        piece.style.setProperty('--animation-duration', `${3 + Math.random() * 2}s`);
        piece.style.setProperty('--size', `${6 + Math.random() * 6}px`);
        piece.style.setProperty('--drift', `${(Math.random() * 40 - 20).toFixed(2)}vw`);
        const spinMagnitude = 480 + Math.random() * 360;
        const spinDirection = Math.random() > 0.5 ? 1 : -1;
        piece.style.setProperty('--spin', `${(spinMagnitude * spinDirection).toFixed(0)}deg`);
        piece.style.setProperty('--start-tilt', `${(Math.random() * 120 - 60).toFixed(0)}deg`);
        piece.style.backgroundColor = color;
        if (Math.random() > 0.65) {
            piece.style.borderRadius = '999px';
        }
        container.appendChild(piece);
    }
    document.body.appendChild(container);
    window.setTimeout(() => {
        container.remove();
    }, 6000);
}
function maybeTriggerCelebration() {
    if (!root)
        return;
    root.classList.toggle('reserve-root--celebration', state.step === 'confirmation');
    if (state.step !== 'confirmation' || !state.confirmation) {
        return;
    }
    if (celebratedConfirmationId === state.confirmation.id) {
        return;
    }
    celebratedConfirmationId = state.confirmation.id;
    triggerConfettiBurst();
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
