import type {
  DiningConfig,
  DiningMenuItem,
  DiningMenuSection,
  DiningReservation,
  DiningTable,
  DiningUser,
} from './types.js';

export interface TableFilterOptions {
  activeOnly?: boolean;
}

export interface MenuSectionOptions {
  includeInactiveItems?: boolean;
}

export interface ReservationListOptions {
  includeCancelled?: boolean;
}

export interface ReservationCreateInput {
  id?: string;
  userId: string;
  date: string;
  time: string;
  partySize: number;
  tableIds: string[];
  status?: string;
  dietaryPrefs?: string | null;
  allergies?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface TableUpdateInput {
  id: string;
  label?: string;
  capacity?: number;
  x?: number;
  y?: number;
  rotation?: number;
  zone?: string | null;
  active?: boolean;
}

export interface MenuSectionUpdateInput {
  title?: string;
  order?: number;
}

export interface MenuItemCreateInput {
  id?: string;
  sectionId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  spicyLevel?: number;
  active?: boolean;
}

export interface MenuItemUpdateInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  spicyLevel?: number;
  active?: boolean;
}

export interface DiningUserInput {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
}

export interface DiningConfigUpdateInput {
  dwellMinutes: number;
  blackoutDates?: string[];
  policyText?: string | null;
}

export interface AdminReservationFilters {
  status?: string;
  date?: string;
  time?: string;
}

export function ensureDiningUserRecord(user: DiningUserInput): Promise<void>;
export function listAdminReservations(filters?: AdminReservationFilters): Promise<DiningReservation[]>;
export function listReservationsBetween(startDate: string, endDate: string): Promise<DiningReservation[]>;
export function listTables(options?: TableFilterOptions): Promise<DiningTable[]>;
export function getTablesByIds(tableIds: string[]): Promise<DiningTable[]>;
export function createDiningTable(data: TableUpdateInput & { label: string; capacity: number; x: number; y: number }): Promise<DiningTable>;
export function updateDiningTables(updates: TableUpdateInput[]): Promise<DiningTable[]>;
export function listMenuSections(options?: MenuSectionOptions): Promise<DiningMenuSection[]>;
export function createMenuSection(data: { id?: string; title: string; order?: number }): Promise<DiningMenuSection>;
export function createMenuItem(data: MenuItemCreateInput): Promise<DiningMenuItem>;
export function updateMenuSection(id: string, data: MenuSectionUpdateInput): Promise<DiningMenuSection>;
export function updateMenuItem(id: string, data: MenuItemUpdateInput): Promise<DiningMenuItem>;
export function deleteMenuSection(id: string): Promise<void>;
export function deleteMenuItem(id: string): Promise<void>;
export function loadDiningConfig(): Promise<DiningConfig>;
export function updateDiningConfig(data: DiningConfigUpdateInput): Promise<DiningConfig>;
export function listReservationsForDate(date: string, options?: ReservationListOptions): Promise<DiningReservation[]>;
export function listReservationsForSlot(date: string, time: string, options?: ReservationListOptions): Promise<DiningReservation[]>;
export function createReservation(data: ReservationCreateInput): Promise<DiningReservation | null>;
export function listReservationsForUser(userId: string): Promise<DiningReservation[]>;
export function getReservationById(id: string): Promise<DiningReservation | null>;
export function updateReservation(id: string, data: Partial<ReservationCreateInput>): Promise<DiningReservation | null>;
