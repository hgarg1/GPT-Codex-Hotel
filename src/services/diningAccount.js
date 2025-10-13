const { sanitizeString } = require('../utils/sanitize');
const {
  ensureDiningUserRecord,
  listReservationsForUser: listDiningReservations,
  getTablesByIds,
  updateReservation,
  getReservationById,
  loadDiningConfig,
} = require('../dining/data');

const FALLBACK_RESERVATIONS = [
  {
    id: 'res-1',
    date: new Date('2024-07-01T19:00:00Z'),
    time: '19:00',
    partySize: 2,
    tableIds: ['A1', 'A2'],
    status: 'CONFIRMED',
    dietaryPrefs: 'No shellfish',
    contactPhone: '+12025550123',
    contactEmail: 'guest@example.com',
    allergies: null,
    notes: null,
  },
  {
    id: 'res-2',
    date: new Date('2024-08-15T21:00:00Z'),
    time: '21:00',
    partySize: 4,
    tableIds: ['C1'],
    status: 'PENDING',
    dietaryPrefs: 'Celebrating anniversary',
    contactPhone: '+12025550123',
    contactEmail: 'guest@example.com',
    allergies: null,
    notes: null,
  },
];

const CANCELLATION_WINDOW_HOURS = Number(process.env.DINING_CANCEL_HOURS ?? 24);

function toTitleCase(value) {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(/\s|_/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function combineDateTime(date, time) {
  const [hourStr = '00', minuteStr = '00'] = String(time || '').split(':');
  const instance = new Date(date instanceof Date ? date.getTime() : Date.parse(`${date}T00:00:00`));
  if (Number.isNaN(instance.getTime())) {
    return null;
  }
  instance.setHours(Number.parseInt(hourStr, 10) || 0, Number.parseInt(minuteStr, 10) || 0, 0, 0);
  return instance;
}

function isPastReservation(reservationDate) {
  if (!reservationDate) return false;
  return reservationDate.getTime() < Date.now();
}

function formatDateLabel(date) {
  if (!(date instanceof Date)) return '';
  return date.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTables(tableIds, tableMap) {
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return { label: 'Assigned by host', list: [] };
  }
  const tables = tableIds
    .map((id) => tableMap.get(id))
    .filter(Boolean);
  if (tables.length === 0) {
    return { label: tableIds.join(', '), list: [] };
  }
  const labels = tables.map((table) => table.label);
  return {
    label: labels.join(', '),
    list: tables,
  };
}

function normalisePhone(value) {
  const cleaned = sanitizeString(value);
  if (!cleaned) return null;
  const digits = cleaned.replace(/[^0-9+]/g, '');
  if (digits.length < 7) {
    return null;
  }
  return cleaned.slice(0, 40);
}

function normaliseEmail(value) {
  const cleaned = sanitizeString(value);
  if (!cleaned) return null;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(cleaned)) {
    return null;
  }
  return cleaned.slice(0, 120);
}

function normaliseNote(value, max = 800) {
  const cleaned = sanitizeString(value);
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function mapReservation(record, tableMap) {
  const slot = combineDateTime(record.date, record.time);
  const past = isPastReservation(slot);
  const tables = formatTables(record.tableIds || [], tableMap);
  const hoursUntil = slot ? (slot.getTime() - Date.now()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
  const cancelable = !past && hoursUntil >= CANCELLATION_WINDOW_HOURS && record.status !== 'CANCELLED';
  return {
    id: record.id,
    status: record.status,
    statusLabel: toTitleCase(record.status || ''),
    partySize: record.partySize,
    start: slot,
    dateIso: slot ? slot.toISOString() : null,
    dateLabel: formatDateLabel(slot),
    tables,
    dietaryPrefs: record.dietaryPrefs || null,
    allergies: record.allergies || null,
    notes: record.notes || null,
    contactPhone: record.contactPhone || null,
    contactEmail: record.contactEmail || null,
    cancelable,
    cancelWarning: cancelable
      ? null
      : past
        ? 'Completed experience'
        : `Cancellations require ${CANCELLATION_WINDOW_HOURS}-hour notice`,
  };
}

async function fetchTableMap(tableIds) {
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return new Map();
  }
  const tables = await getTablesByIds(tableIds);
  return new Map(tables.map((table) => [table.id, table]));
}

async function listReservationsForUser(userId) {
  if (!userId) {
    return { upcoming: [], past: [] };
  }
  try {
    const reservations = await listDiningReservations(userId);
    const tableMap = await fetchTableMap(
      reservations.flatMap((reservation) => reservation.tableIds || []),
    );
    const mapped = reservations.map((reservation) => mapReservation(reservation, tableMap));
    return partitionReservations(mapped);
  } catch (error) {
    console.warn('Failed to list dining reservations, using fallback data.', error);
    const tableMap = new Map();
    const mapped = FALLBACK_RESERVATIONS.map((reservation) => mapReservation(reservation, tableMap));
    return partitionReservations(mapped);
  }
}

function partitionReservations(reservations) {
  const upcoming = [];
  const past = [];
  reservations.forEach((reservation) => {
    if (reservation.start && reservation.start.getTime() >= Date.now()) {
      upcoming.push(reservation);
    } else {
      past.push(reservation);
    }
  });
  upcoming.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return a.start.getTime() - b.start.getTime();
  });
  past.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return b.start.getTime() - a.start.getTime();
  });
  return { upcoming, past };
}

async function syncDiningProfile(user) {
  if (!user || !user.id || !user.email) {
    return;
  }
  try {
    await ensureDiningUserRecord({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      phone: user.phone ?? null,
    });
  } catch (error) {
    console.warn('Failed to sync dining profile', error);
  }
}

async function updateReservationDetails(userId, reservationId, payload) {
  if (!userId || !reservationId) {
    return { error: 'Dining system unavailable' };
  }
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.userId !== userId) {
    return { error: 'Reservation not found' };
  }
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
    const phone = normalisePhone(payload.phone);
    if (!phone) {
      return { error: 'A valid phone number is required' };
    }
    updates.contactPhone = phone;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    const email = normaliseEmail(payload.email);
    updates.contactEmail = email;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'dietary')) {
    updates.dietaryPrefs = normaliseNote(payload.dietary, 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'allergies')) {
    updates.allergies = normaliseNote(payload.allergies, 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    updates.notes = normaliseNote(payload.notes, 800);
  }
  if (Object.keys(updates).length === 0) {
    return { error: 'No changes supplied' };
  }
  try {
    const updated = await updateReservation(reservationId, updates);
    if (!updated) {
      return { error: 'Reservation not found' };
    }
    const tableMap = await fetchTableMap(updated.tableIds || []);
    return { reservation: mapReservation(updated, tableMap) };
  } catch (error) {
    console.error('Failed to update dining reservation', error);
    return { error: 'Dining system unavailable' };
  }
}

async function cancelReservation(userId, reservationId) {
  if (!userId || !reservationId) {
    return { error: 'Dining system unavailable' };
  }
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.userId !== userId) {
    return { error: 'Reservation not found' };
  }
  const slot = combineDateTime(reservation.date, reservation.time);
  if (!slot) {
    return { error: 'Unable to determine reservation window' };
  }
  if (reservation.status === 'CANCELLED') {
    return { error: 'Reservation already cancelled' };
  }
  const hoursUntil = (slot.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil < CANCELLATION_WINDOW_HOURS) {
    return {
      error: `Cancellations require ${CANCELLATION_WINDOW_HOURS}-hour notice`,
    };
  }
  try {
    const updated = await updateReservation(reservationId, { status: 'CANCELLED' });
    if (!updated) {
      return { error: 'Reservation not found' };
    }
    const tableMap = await fetchTableMap(updated.tableIds || []);
    return { reservation: mapReservation(updated, tableMap) };
  } catch (error) {
    console.error('Failed to cancel dining reservation', error);
    return { error: 'Dining system unavailable' };
  }
}

async function getDiningPolicy() {
  const defaultPolicy = {
    text: 'Cancellations require 24 hours notice. Dietary updates can be made until the day of your seating.',
    cancellationWindowHours: CANCELLATION_WINDOW_HOURS,
  };
  try {
    const config = await loadDiningConfig();
    return {
      text: config?.policyText || defaultPolicy.text,
      cancellationWindowHours: CANCELLATION_WINDOW_HOURS,
    };
  } catch (error) {
    console.warn('Failed to load dining policy', error);
    return defaultPolicy;
  }
}

module.exports = {
  listReservationsForUser,
  partitionReservations,
  syncDiningProfile,
  updateReservationDetails,
  cancelReservation,
  getDiningPolicy,
};
