import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { extname, join } from 'path';

export const MEDIA_FOLDERS = [
  'logo',
  'favicon',
  'banners',
  'products',
  'articles',
  'general',
] as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.svg',
]);

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);

export const BLOCKED_EXTENSIONS = new Set([
  '.php',
  '.js',
  '.html',
  '.htm',
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
]);

export function normalizeMediaFolder(value?: string): MediaFolder {
  const folder = (value ?? 'general').trim().toLowerCase();
  if (!(MEDIA_FOLDERS as readonly string[]).includes(folder)) {
    throw new BadRequestException(`Invalid media folder: ${value}`);
  }
  return folder as MediaFolder;
}

export function assertSafeUploadFilename(originalName: string): string {
  const base = originalName.replace(/\\/g, '/').split('/').pop() ?? 'file';
  if (base.includes('..') || base.includes('\0')) {
    throw new BadRequestException('Invalid filename');
  }
  const ext = extname(base).toLowerCase();
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
    throw new BadRequestException(`File type not allowed: ${ext || 'unknown'}`);
  }
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new BadRequestException('Only jpg, jpeg, png, webp, svg are allowed');
  }
  return base;
}

export function assertAllowedMimeType(mimeType: string, originalName: string): void {
  const ext = extname(originalName).toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    throw new BadRequestException(`MIME type not allowed: ${mimeType}`);
  }
  if (mimeType === 'image/svg+xml' && ext !== '.svg') {
    throw new BadRequestException('SVG extension mismatch');
  }
  if (mimeType === 'image/jpeg' && ext !== '.jpg' && ext !== '.jpeg') {
    throw new BadRequestException('JPEG extension mismatch');
  }
  if (mimeType === 'image/png' && ext !== '.png') {
    throw new BadRequestException('PNG extension mismatch');
  }
  if (mimeType === 'image/webp' && ext !== '.webp') {
    throw new BadRequestException('WebP extension mismatch');
  }
}

export function buildSafeStoredFilename(originalName: string): string {
  assertSafeUploadFilename(originalName);
  const ext = extname(originalName.replace(/\\/g, '/').split('/').pop() ?? 'file').toLowerCase();
  const hash = createHash('sha256')
    .update(`${Date.now()}-${originalName}-${Math.random()}`)
    .digest('hex')
    .slice(0, 12);
  return `${Date.now()}-${hash}${ext}`;
}

export function resolveUploadPath(root: string, folder: MediaFolder, filename: string): string {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new BadRequestException('Path traversal detected');
  }
  return join(root, folder, filename);
}

export function resolveThumbPath(root: string, folder: MediaFolder, filename: string): string {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new BadRequestException('Path traversal detected');
  }
  return join(root, folder, 'thumbs', filename);
}

export function resolveCardPath(root: string, folder: MediaFolder, filename: string): string {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new BadRequestException('Path traversal detected');
  }
  return join(root, folder, 'cards', filename);
}
