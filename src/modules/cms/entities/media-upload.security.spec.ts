/**
 * Phase 6H.2 — Media upload security
 */
import { BadRequestException } from '@nestjs/common';
import {
  assertAllowedMimeType,
  assertSafeUploadFilename,
  buildSafeStoredFilename,
  normalizeMediaFolder,
  resolveUploadPath,
} from './media-upload.security';

describe('Phase 6H.2 — media upload security', () => {
  it('accepts allowed folders', () => {
    expect(normalizeMediaFolder('banners')).toBe('banners');
    expect(normalizeMediaFolder(undefined)).toBe('general');
  });

  it('rejects invalid folder', () => {
    expect(() => normalizeMediaFolder('../../../etc')).toThrow(BadRequestException);
  });

  it('rejects php/js/html/exe extensions', () => {
    expect(() => assertSafeUploadFilename('shell.php')).toThrow(BadRequestException);
    expect(() => assertSafeUploadFilename('hack.js')).toThrow(BadRequestException);
    expect(() => assertSafeUploadFilename('page.html')).toThrow(BadRequestException);
    expect(() => assertSafeUploadFilename('virus.exe')).toThrow(BadRequestException);
  });

  it('accepts jpg/png/webp/svg', () => {
    expect(assertSafeUploadFilename('photo.jpg')).toBe('photo.jpg');
    expect(assertSafeUploadFilename('icon.svg')).toBe('icon.svg');
  });

  it('validates mime vs extension', () => {
    expect(() => assertAllowedMimeType('image/png', 'file.php')).toThrow(BadRequestException);
    assertAllowedMimeType('image/png', 'file.png');
  });

  it('builds safe stored filename without path traversal', () => {
    const name = buildSafeStoredFilename('my logo.png');
    expect(name).toMatch(/\.png$/);
    expect(name).not.toContain('..');
  });

  it('resolveUploadPath blocks traversal', () => {
    expect(() => resolveUploadPath('/app/uploads', 'general', '../secret.png')).toThrow(
      BadRequestException,
    );
    expect(resolveUploadPath('/app/uploads', 'logo', 'abc.png')).toContain('logo');
  });
});
