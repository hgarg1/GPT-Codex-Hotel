const { PrismaClient } = require('@prisma/client');
const { sanitizeString } = require('../utils/sanitize');

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

let prismaInstance;
let prismaUnavailable = false;

function getPrisma() {
  if (prismaUnavailable) {
    return null;
  }
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
    } catch (error) {
      prismaUnavailable = true;
      console.warn('Dining integration unavailable – Prisma client failed to initialise.', error);
      return null;
    }
  }
  return prismaInstance;
}

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

async function fetchTableMap(client, tableIds) {
  if (!client || tableIds.length === 0) {
    return new Map();
  }
  const unique = [...new Set(tableIds)];
  const tables = await client.diningTable.findMany({
    where: { id: { in: unique } },
  });
  return new Map(tables.map((table) => [table.id, table]));
}

async function listReservationsForUser(userId) {
  if (!userId) {
    return { upcoming: [], past: [] };
  }
  const client = getPrisma();
  if (!client) {
    const tableMap = new Map();
    const mapped = FALLBACK_RESERVATIONS.map((reservation) =>
      mapReservation(reservation, tableMap),
    );
    return partitionReservations(mapped);
  }
  const reservations = await client.reservation.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  const tableMap = await fetchTableMap(
    client,
    reservations.flatMap((reservation) => reservation.tableIds || []),
  );
  const mapped = reservations.map((reservation) => mapReservation(reservation, tableMap));
  return partitionReservations(mapped);
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
  const client = getPrisma();
  if (!client) {
    return;
  }
  try {
    await client.user.upsert({
      where: { id: user.id },
      update: { email: user.email, name: user.name ?? null, phone: user.phone ?? null },
      create: { id: user.id, email: user.email, name: user.name ?? null, phone: user.phone ?? null },
    });
  } catch (error) {
    console.warn('Failed to sync dining profile', error);
  }
}

async function updateReservationDetails(userId, reservationId, payload) {
  const client = getPrisma();
  if (!client || !userId || !reservationId) {
    return { error: 'Dining system unavailable' };
  }
  const reservation = await client.reservation.findUnique({ where: { id: reservationId } });
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
  const updated = await client.reservation.update({
    where: { id: reservationId },
    data: updates,
  });
  const tableMap = await fetchTableMap(client, updated.tableIds || []);
  return { reservation: mapReservation(updated, tableMap) };
}

async function cancelReservation(userId, reservationId) {
  const client = getPrisma();
  if (!client || !userId || !reservationId) {
    return { error: 'Dining system unavailable' };
  }
  const reservation = await client.reservation.findUnique({ where: { id: reservationId } });
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
  const updated = await client.reservation.update({
    where: { id: reservationId },
    data: { status: 'CANCELLED' },
  });
  const tableMap = await fetchTableMap(client, updated.tableIds || []);
  return { reservation: mapReservation(updated, tableMap) };
}

async function getDiningPolicy() {
  const defaultPolicy = {
    text: 'Cancellations require 24 hours notice. Dietary updates can be made until the day of your seating.',
    cancellationWindowHours: CANCELLATION_WINDOW_HOURS,
  };
  const client = getPrisma();
  if (!client) {
    return defaultPolicy;
  }
  const config = await client.diningConfig.findUnique({ where: { id: 'default' } });
  return {
    text: config?.policyText || defaultPolicy.text,
    cancellationWindowHours: CANCELLATION_WINDOW_HOURS,
  };
}

process.on('beforeExit', async () => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
  }
});

module.exports = {
  listReservationsForUser,
  partitionReservations,
  syncDiningProfile,
  updateReservationDetails,
  cancelReservation,
  getDiningPolicy,
};
