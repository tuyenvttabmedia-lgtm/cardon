import { CMS_MEDIA_UPLOAD_ROOT } from '../entities/cms.constants';
import { CmsMediaStorageService } from './cms-media-storage.service';

describe('Phase 6H.2 — upload volume path', () => {
  it('defaults upload root to /app/uploads in production container layout', () => {
    const service = new CmsMediaStorageService({
      get: (key: string) => {
        if (key === 'media.uploadRoot') return CMS_MEDIA_UPLOAD_ROOT;
        return undefined;
      },
    } as never);

    const root = service.getUploadRoot().replace(/\\/g, '/');
    expect(root.endsWith('/uploads')).toBe(true);
  });
});
