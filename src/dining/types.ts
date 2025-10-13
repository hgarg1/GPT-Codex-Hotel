export interface DiningUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiningTable {
  id: string;
  label: string;
  capacity: number;
  x: number;
  y: number;
  rotation: number;
  zone: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiningReservation {
  id: string;
  userId: string;
  date: Date;
  time: string;
  partySize: number;
  tableIds: string[];
  status: string;
  dietaryPrefs: string | null;
  allergies: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: DiningUser | null;
}

export interface DiningMenuItem {
  id: string;
  sectionId: string;
  name: string;
  description: string | null;
  priceCents: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  spicyLevel: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiningMenuSection {
  id: string;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  items: DiningMenuItem[];
}

export interface DiningConfig {
  id: string;
  dwellMinutes: number;
  blackoutDates: string[];
  policyText: string | null;
  createdAt: Date;
  updatedAt: Date;
}
