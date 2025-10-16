import type { Request } from 'express';
import type { PendingUpload } from './uploads';

export interface BasicsStep {
  fullName: string;
  email: string;
  phone?: string;
  locationEligibility: string;
}

export interface ExperienceStep {
  years: string;
  skills: string[];
  links?: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
  };
}

export interface RoleStep {
  motivation?: string;
  proudest?: string;
  availability?: string;
}

export interface WizardState {
  basics?: BasicsStep;
  experience?: ExperienceStep;
  role?: RoleStep;
  resume?: PendingUpload;
  coverLetter?: PendingUpload | null;
  consent?: boolean;
}

export function getWizardState(req: Request, jobId: string): WizardState {
  const store = (req.session as any).careersWizard || {};
  return store[jobId] || {};
}

export function saveWizardState(req: Request, jobId: string, nextState: WizardState): void {
  const sessionAny = req.session as any;
  const store = sessionAny.careersWizard || {};
  store[jobId] = { ...store[jobId], ...nextState };
  sessionAny.careersWizard = store;
}

export function mergeWizardState(req: Request, jobId: string, partial: Partial<WizardState>): WizardState {
  const existing = getWizardState(req, jobId);
  const updated = { ...existing, ...partial };
  saveWizardState(req, jobId, updated);
  return updated;
}

export function clearWizardState(req: Request, jobId: string): void {
  const sessionAny = req.session as any;
  const store = sessionAny.careersWizard || {};
  delete store[jobId];
  sessionAny.careersWizard = store;
}
