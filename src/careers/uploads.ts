import fs from 'node:fs';
import path from 'node:path';
import { ensureUploadsDir } from './db';

export interface PendingUpload {
  originalName: string;
  mimeType: string;
  base64: string;
}

export interface PersistedUploadPaths {
  resumePath?: string | null;
  coverLetterPath?: string | null;
}

export const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

const MIME_EXTENSION_MAP = new Map<string, string>([
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx']
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

function normaliseExtension(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }
  const prefixed = candidate.startsWith('.') ? candidate.toLowerCase() : `.${candidate.toLowerCase()}`;
  return ALLOWED_EXTENSIONS.has(prefixed) ? prefixed : null;
}

function extensionFromUpload(upload: PendingUpload): string {
  const fromName = normaliseExtension(path.extname(upload.originalName));
  if (fromName) {
    return fromName;
  }
  const mapped = MIME_EXTENSION_MAP.get(upload.mimeType) || null;
  const fromMime = normaliseExtension(mapped);
  return fromMime || '.pdf';
}

export function getStoredExtension(storedPath: string): string {
  return normaliseExtension(path.extname(storedPath)) || '.pdf';
}

export function persistApplicationFiles(
  applicationId: string,
  files: { resume?: PendingUpload | null; coverLetter?: PendingUpload | null }
): PersistedUploadPaths {
  ensureUploadsDir(uploadRoot);
  const applicationDir = path.join(uploadRoot, applicationId);
  if (!fs.existsSync(applicationDir)) {
    fs.mkdirSync(applicationDir, { recursive: true });
  }

  const paths: PersistedUploadPaths = {};

  if (files.resume) {
    const resumeBuffer = Buffer.from(files.resume.base64, 'base64');
    const resumeExtension = extensionFromUpload(files.resume);
    const resumePath = path.join(applicationDir, `resume${resumeExtension}`);
    fs.writeFileSync(resumePath, resumeBuffer);
    paths.resumePath = path.relative(process.cwd(), resumePath);
  }

  if (files.coverLetter) {
    const coverBuffer = Buffer.from(files.coverLetter.base64, 'base64');
    const coverExtension = extensionFromUpload(files.coverLetter);
    const coverPath = path.join(applicationDir, `cover-letter${coverExtension}`);
    fs.writeFileSync(coverPath, coverBuffer);
    paths.coverLetterPath = path.relative(process.cwd(), coverPath);
  }

  return paths;
}

export function resolveAbsolutePath(storedPath: string): string {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  return path.resolve(process.cwd(), storedPath);
}

export function fileExists(storedPath: string | null | undefined): boolean {
  if (!storedPath) return false;
  try {
    return fs.existsSync(resolveAbsolutePath(storedPath));
  } catch (error) {
    return false;
  }
}
