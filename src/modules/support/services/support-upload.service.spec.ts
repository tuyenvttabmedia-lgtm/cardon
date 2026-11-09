import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupportUploadService } from './support-upload.service';

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
}

describe('SupportUploadService', () => {
  const service = new SupportUploadService({
    get: () => 'uploads',
  } as never);

  it('rejects path traversal filenames', () => {
    expect(() => service.assertSafeFilename('../etc/passwd')).toThrow(ForbiddenException);
    expect(() => service.assertSafeFilename('a/b.png')).toThrow(ForbiddenException);
  });

  it('rejects GIF / MIME spoof', () => {
    const gif = Buffer.from('GIF89a............');
    expect(() =>
      service.saveScreenshot('user-1', {
        buffer: gif,
        size: gif.length,
        mimetype: 'image/gif',
        originalname: 'x.gif',
      } as Express.Multer.File),
    ).toThrow(BadRequestException);

    expect(() =>
      service.saveScreenshot('user-1', {
        buffer: gif,
        size: gif.length,
        mimetype: 'image/png',
        originalname: 'x.png',
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });

  it('rejects oversized files', () => {
    const buf = pngBuffer();
    expect(() =>
      service.saveScreenshot('user-1', {
        buffer: buf,
        size: 6 * 1024 * 1024,
        mimetype: 'image/png',
        originalname: 'x.png',
      } as Express.Multer.File),
    ).toThrow(/too large/i);
  });

  it('extracts filename from legacy and API URLs', () => {
    expect(
      service.extractFilenameFromAttachmentUrl('/uploads/support/old-file.png'),
    ).toBe('old-file.png');
    expect(
      service.extractFilenameFromAttachmentUrl('/account/support/files/new_file.png'),
    ).toBe('new_file.png');
  });
});
