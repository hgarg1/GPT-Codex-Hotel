export type ReserveStep = 'schedule' | 'party' | 'seats' | 'guest' | 'review' | 'confirmation';

export interface DiningTable {
  id: string;
  label: string;
  capacity: number;
  x: number;
  y: number;
  rotation?: number | null;
  zone?: string | null;
}

export interface AvailabilityPayload {
  availableTableIds: string[];
  suggestedCombos: string[][];
}

export interface HoldState {
  holdId: string;
  expiresAt: number;
  tableIds: string[];
}

export interface GuestDetails {
  phone: string;
  email: string;
  dietary: string;
  allergies: string;
  notes: string;
}

export interface ReservationConfirmation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  tables: { id: string; label: string; capacity: number }[];
  dietaryPrefs?: string | null;
  allergies?: string | null;
  notes?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  qrCode: string;
}

export interface ReserveState {
  step: ReserveStep;
  date: string | null;
  time: string | null;
  partySize: number | null;
  selectedTableIds: string[];
  tables: DiningTable[];
  availability: AvailabilityPayload | null;
  hold: HoldState | null;
  guest: GuestDetails;
  confirmation: ReservationConfirmation | null;
}

export interface ValidationError {
  field?: string;
  message: string;
}
