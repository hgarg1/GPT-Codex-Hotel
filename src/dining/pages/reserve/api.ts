import type { AvailabilityPayload, GuestDetails, HoldState, ReservationConfirmation } from './types.js';

interface ApiError {
  status: number;
  message: string;
  field?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      const error: ApiError = {
        status: response.status,
        message: data.error || 'Unexpected server error',
        field: data.field,
      };
      throw error;
    } catch (parseError) {
      throw { status: response.status, message: text || 'Unexpected server error' } as ApiError;
    }
  }
  return (await response.json()) as T;
}

export async function validateSchedule(date: string, time: string): Promise<{ date: string; time: string }> {
  const response = await fetch('/api/dining/reservations/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ step: 'schedule', date, time }),
  });
  return handleResponse<{ date: string; time: string }>(response);
}

export async function validateParty(
  date: string,
  time: string,
  partySize: number,
): Promise<{ partySize: number; availability: AvailabilityPayload }>
{
  const response = await fetch('/api/dining/reservations/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ step: 'party', date, time, partySize }),
  });
  return handleResponse<{ partySize: number; availability: AvailabilityPayload }>(response);
}

export async function validateGuest(guest: GuestDetails): Promise<GuestDetails> {
  const response = await fetch('/api/dining/reservations/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ step: 'guest', guest }),
  });
  return handleResponse<{ guest: GuestDetails }>(response).then((data) => data.guest);
}

export async function fetchDiningTables(): Promise<{ tables: { id: string; label: string; capacity: number; x: number; y: number; rotation?: number | null; zone?: string | null }[] }> {
  const response = await fetch('/api/dining/tables', { credentials: 'include' });
  return handleResponse(response);
}

export async function fetchAvailability(
  date: string,
  time: string,
  partySize: number,
): Promise<AvailabilityPayload> {
  const params = new URLSearchParams({ date, time, partySize: String(partySize) });
  const response = await fetch(`/api/dining/availability?${params.toString()}`, { credentials: 'include' });
  return handleResponse<AvailabilityPayload>(response);
}

export async function holdTables(
  date: string,
  time: string,
  tableIds: string[],
): Promise<HoldState> {
  const response = await fetch('/api/dining/hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ date, time, tableIds }),
  });
  return handleResponse<{ holdId: string; expiresAt: number }>(response).then((data) => ({
    holdId: data.holdId,
    expiresAt: data.expiresAt,
    tableIds: [...tableIds],
  }));
}

export async function releaseHold(holdId: string): Promise<void> {
  await fetch('/api/dining/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ holdId }),
  });
}

interface ReservationPayload {
  holdId: string;
  date: string;
  time: string;
  partySize: number;
  tableIds: string[];
  guest: GuestDetails;
}

export async function submitReservation(payload: ReservationPayload): Promise<ReservationConfirmation> {
  const response = await fetch('/api/dining/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<{ reservation: ReservationConfirmation }>(response).then((data) => data.reservation);
}

export type { ApiError };
