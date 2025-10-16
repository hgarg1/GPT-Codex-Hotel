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
    const resumePath = path.join(applicationDir, 'resume.pdf');
    fs.writeFileSync(resumePath, resumeBuffer);
    paths.resumePath = path.relative(process.cwd(), resumePath);
  }

  if (files.coverLetter) {
    const coverBuffer = Buffer.from(files.coverLetter.base64, 'base64');
    const coverPath = path.join(applicationDir, 'cover-letter.pdf');
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
