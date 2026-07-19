/**
 * Phase 6H.2 — CMS media service tests
 */
import { BadRequestException } from '@nestjs/common';
import { CmsMediaService } from './cms-media.service';

describe('Phase 6H.2 — CmsMediaService', () => {
  const repository = {
    listMedia: jest.fn(),
    createMedia: jest.fn(),
    findMediaById: jest.fn(),
    softDeleteMedia: jest.fn(),
  };
  const storage = {
    getMaxBytes: jest.fn().mockReturnValue(5 * 1024 * 1024),
    saveLocal: jest.fn(),
    deleteLocalFile: jest.fn(),
  };

  function service() {
    return new CmsMediaService(repository as never, storage as never, {} as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('uploads image via storage and persists metadata', async () => {
    storage.saveLocal.mockResolvedValue({
      filename: '1-abc.png',
      storageKey: 'articles/1-abc.png',
      url: '/uploads/articles/1-abc.png',
      thumbnailUrl: '/uploads/articles/thumbs/1-abc.webp',
      storage: 'local',
      folder: 'articles',
      width: 800,
      height: 600,
      size: 1200,
      mimeType: 'image/png',
    });
    repository.createMedia.mockResolvedValue({ id: 'media-1' });

    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 1200,
      buffer: Buffer.from('png'),
    } as Express.Multer.File;

    const result = await service().upload(file, { folder: 'articles', alt: 'A' });
    expect(result).toEqual({ id: 'media-1' });
    expect(storage.saveLocal).toHaveBeenCalledWith(file, 'articles');
  });

  it('rejects invalid file type', async () => {
    const file = {
      originalname: 'bad.php',
      mimetype: 'application/x-php',
      size: 100,
      buffer: Buffer.from('<?php'),
    } as Express.Multer.File;

    await expect(service().upload(file)).rejects.toThrow(BadRequestException);
  });

  it('deletes media file from disk on delete', async () => {
    repository.findMediaById.mockResolvedValue({
      id: 'm1',
      storageKey: 'banners/x.png',
    });
    repository.softDeleteMedia.mockResolvedValue({ id: 'm1' });

    await service().deleteMedia('m1');
    expect(storage.deleteLocalFile).toHaveBeenCalledWith('banners/x.png');
    expect(repository.softDeleteMedia).toHaveBeenCalledWith('m1');
  });
});
