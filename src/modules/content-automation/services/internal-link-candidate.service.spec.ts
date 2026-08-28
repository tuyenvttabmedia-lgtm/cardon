import { NotFoundException } from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import { InternalLinkCandidateService } from './internal-link-candidate.service';

describe('InternalLinkCandidateService', () => {
  const cmsService = { getPage: jest.fn() };
  const existingContent = { findByKeyword: jest.fn(), listPublishedBlogContent: jest.fn() };
  let service: InternalLinkCandidateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InternalLinkCandidateService(
      cmsService as never,
      existingContent as never,
    );
  });

  it('validates published blog page', async () => {
    cmsService.getPage.mockResolvedValue({
      id: 'page-1',
      type: CmsPageType.BLOG_POST,
      status: CmsPageStatus.PUBLISHED,
      slug: 'test-slug',
      categoryRel: { slug: 'news' },
    });

    const result = await service.validateTargetPageId('page-1');
    expect(result.valid).toBe(true);
    expect(result.publicPath).toBe('/tin-tuc/news/test-slug');
  });

  it('rejects non-published page', async () => {
    cmsService.getPage.mockResolvedValue({
      id: 'page-1',
      type: CmsPageType.BLOG_POST,
      status: CmsPageStatus.DRAFT,
      slug: 'test-slug',
      categoryRel: null,
    });

    const result = await service.validateTargetPageId('page-1');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('NOT_PUBLISHED');
  });

  it('rejects missing page', async () => {
    cmsService.getPage.mockRejectedValue(new NotFoundException());
    const result = await service.validateTargetPageId('missing');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('PAGE_NOT_FOUND');
  });
});
