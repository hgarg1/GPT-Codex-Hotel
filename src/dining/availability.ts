import type { DiningTable, DiningReservation } from './types.js';
import { listReservationsForDate, listTables } from './data.js';
import { listHoldsForSlot } from './holds.js';

const DWELL_MINUTES = Number(process.env.DINING_DWELL_MINUTES ?? 105);

export interface AvailabilityResult {
  availableTableIds: string[];
  suggestedCombos: string[][];
}

interface TableWithMeta extends DiningTable {
  isAvailable: boolean;
}

function toDateInstance(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  return new Date(`${value}T00:00:00`);
}

function combineDateTime(date: string | Date, time: string): Date {
  const base = toDateInstance(date);
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number.parseInt(hourStr ?? '0', 10);
  const minute = Number.parseInt(minuteStr ?? '0', 10);
  base.setHours(hour, minute, 0, 0);
  return base;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function getReservationWindow(reservation: DiningReservation): { start: Date; end: Date } {
  const start = combineDateTime(reservation.date, reservation.time);
  const end = new Date(start.getTime() + DWELL_MINUTES * 60 * 1000);
  return { start, end };
}

function getRequestedWindow(date: string, time: string): { start: Date; end: Date } {
  const start = combineDateTime(date, time);
  const end = new Date(start.getTime() + DWELL_MINUTES * 60 * 1000);
  return { start, end };
}

function buildCombos(tables: DiningTable[], partySize: number): string[][] {
  const combos: string[][] = [];
  const available = tables
    .filter((table) => table.capacity > 0)
    .map((table) => ({
      id: table.id,
      capacity: table.capacity,
      zone: table.zone ?? 'floor',
      x: table.x,
      y: table.y,
    }));

  available.sort((a, b) => a.capacity - b.capacity);

  const maxComboSize = 3;

  function isCompatibleZone(ids: number[]): boolean {
    const zones = ids.map((index) => available[index].zone);
    return zones.every((zone) => zone === zones[0]);
  }

  function distanceScore(indices: number[]): number {
    if (indices.length <= 1) return 0;
    let total = 0;
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const a = available[indices[i]];
        const b = available[indices[j]];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        total += Math.sqrt(dx * dx + dy * dy);
      }
    }
    return total;
  }

  function backtrack(startIndex: number, picked: number[], capacitySum: number): void {
    if (capacitySum >= partySize && picked.length >= 2) {
      combos.push(picked.map((index) => available[index].id));
    }

    if (picked.length === maxComboSize || capacitySum >= partySize * 2) {
      return;
    }

    for (let i = startIndex; i < available.length; i += 1) {
      if (picked.includes(i)) continue;
      backtrack(i + 1, [...picked, i], capacitySum + available[i].capacity);
    }
  }

  backtrack(0, [], 0);

  const uniqueCombos = new Map<string, string[]>();
  combos.forEach((combo) => {
    const key = combo.slice().sort().join('|');
    if (!uniqueCombos.has(key)) {
      uniqueCombos.set(key, combo);
    }
  });

  const scored = Array.from(uniqueCombos.values()).map((combo) => {
    const indices = combo.map((id) => available.findIndex((item) => item.id === id));
    const zoneBonus = isCompatibleZone(indices) ? 0 : 1;
    const totalCapacity = combo.reduce((sum, id) => {
      const table = available.find((item) => item.id === id);
      return sum + (table?.capacity ?? 0);
    }, 0);
    const extraSeats = totalCapacity - partySize;
    return {
      combo,
      score: zoneBonus * 1000 + extraSeats * 10 + distanceScore(indices),
      tableCount: combo.length,
      extraSeats,
    };
  });

  scored.sort((a, b) => {
    if (a.tableCount !== b.tableCount) return a.tableCount - b.tableCount;
    if (a.extraSeats !== b.extraSeats) return a.extraSeats - b.extraSeats;
    return a.score - b.score;
  });

  return scored.slice(0, 5).map((item) => item.combo);
}

export async function getDiningAvailability(
  date: string,
  time: string,
  partySize: number,
): Promise<AvailabilityResult> {
  const tables = await listTables({ activeOnly: true });

  const { start: requestedStart, end: requestedEnd } = getRequestedWindow(date, time);

  const reservations = await listReservationsForDate(date);

  const unavailableTableIds = new Set<string>();

  reservations.forEach((reservation) => {
    const { start, end } = getReservationWindow(reservation);
    if (overlaps(requestedStart, requestedEnd, start, end)) {
      reservation.tableIds.forEach((tableId) => {
        unavailableTableIds.add(tableId);
      });
    }
  });

  const holds = await listHoldsForSlot(date, time);
  holds.forEach((hold) => {
    hold.tableIds.forEach((tableId) => {
      unavailableTableIds.add(tableId);
    });
  });

  const availableTables: TableWithMeta[] = tables.map((table) => ({
    ...table,
    isAvailable: !unavailableTableIds.has(table.id),
  }));

  const availableTableIds = availableTables
    .filter((table) => table.isAvailable)
    .map((table) => table.id);

  const suggestedCombos: string[][] = [];

  const maxSingleCapacity = availableTables
    .filter((table) => table.isAvailable)
    .reduce((max, table) => Math.max(max, table.capacity), 0);

  if (partySize > maxSingleCapacity) {
    suggestedCombos.push(...buildCombos(availableTables.filter((table) => table.isAvailable), partySize));
  }

  return {
    availableTableIds,
    suggestedCombos,
  };
}

