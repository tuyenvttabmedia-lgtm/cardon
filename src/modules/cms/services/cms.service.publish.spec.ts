import { CmsPageStatus } from '@prisma/client';
import { CmsService } from './cms.service';

describe('CmsService.publishPage', () => {
  it('preserves existing publishedAt when re-publishing', async () => {
    const original = new Date('2026-08-01T08:00:00.000Z');
    const repository = {
      updatePage: jest.fn().mockResolvedValue({ id: 'p1' }),
      findDueScheduledPages: jest.fn(),
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'p1',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: original,
          scheduledPublishAt: null,
          pageTags: [],
          seo: null,
          categoryRel: null,
        })
        .mockResolvedValueOnce({
          id: 'p1',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: original,
          scheduledPublishAt: null,
          pageTags: [],
          seo: null,
          categoryRel: null,
        }),
    };

    const service = new CmsService(
      repository as never,
      { upsertSeo: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );

    await service.publishPage('p1');

    expect(repository.updatePage).toHaveBeenCalledWith('p1', {
      status: CmsPageStatus.PUBLISHED,
      publishedAt: original,
      scheduledPublishAt: null,
    });
  });

  it('sets publishedAt when first publishing a draft', async () => {
    const repository = {
      updatePage: jest.fn().mockResolvedValue({ id: 'p2' }),
      findDueScheduledPages: jest.fn(),
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'p2',
          status: CmsPageStatus.DRAFT,
          publishedAt: null,
          scheduledPublishAt: null,
          pageTags: [],
          seo: null,
          categoryRel: null,
        })
        .mockResolvedValueOnce({
          id: 'p2',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: new Date('2026-08-04T00:00:00.000Z'),
          scheduledPublishAt: null,
          pageTags: [],
          seo: null,
          categoryRel: null,
        }),
    };

    const service = new CmsService(
      repository as never,
      { upsertSeo: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );

    const before = Date.now();
    await service.publishPage('p2');
    const after = Date.now();

    const call = repository.updatePage.mock.calls[0][1] as {
      publishedAt: Date;
      status: CmsPageStatus;
      scheduledPublishAt: null;
    };
    expect(call.status).toBe(CmsPageStatus.PUBLISHED);
    expect(call.publishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.publishedAt.getTime()).toBeLessThanOrEqual(after);
    expect(call.scheduledPublishAt).toBeNull();
  });

  it('publishes due scheduled drafts and clears schedule', async () => {
    const repository = {
      findDueScheduledPages: jest.fn().mockResolvedValue([
        { id: 'p3', publishedAt: null, title: 'A', slug: 'a' },
      ]),
      updatePage: jest.fn().mockResolvedValue({ id: 'p3' }),
      findPageById: jest.fn(),
    };
    const service = new CmsService(
      repository as never,
      { upsertSeo: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );

    const count = await service.publishDueScheduledPages();
    expect(count).toBe(1);
    expect(repository.updatePage).toHaveBeenCalledWith(
      'p3',
      expect.objectContaining({
        status: CmsPageStatus.PUBLISHED,
        scheduledPublishAt: null,
      }),
    );
  });
});
