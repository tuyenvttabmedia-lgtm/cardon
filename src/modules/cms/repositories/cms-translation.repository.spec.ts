import { CmsPageStatus } from '@prisma/client';
import { CmsRepository } from './cms.repository';

function transactionClient() {
  const page = {
    id: 'page-1',
    title: 'Tiêu đề Việt',
    excerpt: 'Mô tả Việt',
    content: '<p>Nội dung Việt</p>',
    status: CmsPageStatus.PUBLISHED,
  };
  const tx = {
    cmsPage: {
      update: jest.fn(async () => page),
      findUnique: jest.fn(async ({ select }: { select?: { id?: boolean } }) => (select ? { id: page.id } : page)),
      findUniqueOrThrow: jest.fn(async () => ({ ...page, translations: [], seoTranslations: [] })),
    },
    cmsSeo: {
      upsert: jest.fn(async () => ({
        metaTitle: 'SEO Việt',
        metaDescription: 'Mô tả SEO',
        metaKeywords: 'viet',
        focusKeyword: null,
        ogTitle: null,
        ogDescription: null,
        canonicalUrl: null,
      })),
    },
    cmsPageTranslation: {
      upsert: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ status: CmsPageStatus.DRAFT })),
    },
    cmsSeoTranslation: {
      upsert: jest.fn(async () => ({})),
    },
    cmsCategory: {
      update: jest.fn(async () => ({
        id: 'cat-1',
        name: 'Game',
        description: 'Mô tả',
        intro: null,
        metaTitle: null,
        metaDescription: null,
        canonicalUrl: null,
      })),
      findUnique: jest.fn(async () => ({ id: 'cat-1' })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'cat-1', translations: [] })),
    },
    cmsCategoryTranslation: {
      upsert: jest.fn(async () => ({})),
    },
    cmsTag: {
      update: jest.fn(),
      findUnique: jest.fn(async () => ({ id: 'tag-1' })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'tag-1', translations: [] })),
    },
    cmsTagTranslation: {
      upsert: jest.fn(async () => ({})),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, tx };
}

describe('CMS translation writes', () => {
  it('mirrors Vietnamese page text and SEO in one transaction and leaves English untouched', async () => {
    const { prisma, tx } = transactionClient();
    const repository = new CmsRepository(prisma as never);

    await repository.updatePage('page-1', { title: 'Tiêu đề Việt' }, {
      metaTitle: 'SEO Việt',
      metaDescription: 'Mô tả SEO',
      metaKeywords: 'viet',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.cmsPageTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId_locale: { pageId: 'page-1', locale: 'vi' } },
      }),
    );
    expect(tx.cmsSeoTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId_locale: { pageId: 'page-1', locale: 'vi' } },
      }),
    );
    const mirrored = JSON.stringify(tx.cmsPageTranslation.upsert.mock.calls);
    expect(mirrored).toContain('"locale":"vi"');
    expect(mirrored).not.toContain('"locale":"en"');
  });

  it('rolls the transaction back when the Vietnamese SEO mirror fails', async () => {
    const { prisma, tx } = transactionClient();
    tx.cmsSeoTranslation.upsert.mockRejectedValueOnce(new Error('seo failed'));
    const repository = new CmsRepository(prisma as never);

    await expect(
      repository.updatePage('page-1', { title: 'Tiêu đề Việt' }, {
        metaTitle: 'SEO Việt',
        metaDescription: 'Mô tả SEO',
      }),
    ).rejects.toThrow('seo failed');
    expect(tx.cmsPage.update).toHaveBeenCalled();
    expect(tx.cmsPage.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('writes an English page translation without updating the page or the Vietnamese row', async () => {
    const { prisma, tx } = transactionClient();
    const repository = new CmsRepository(prisma as never);

    await repository.upsertEnglishPageTranslation('page-1', {
      title: 'English title',
      excerpt: 'English excerpt',
      content: '<p>English</p>',
      status: CmsPageStatus.DRAFT,
      seo: { metaTitle: 'English SEO', metaDescription: 'English description' },
    });

    expect(tx.cmsPage.update).not.toHaveBeenCalled();
    expect(tx.cmsPageTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId_locale: { pageId: 'page-1', locale: 'en' } },
        create: expect.objectContaining({ title: 'English title', status: CmsPageStatus.DRAFT }),
      }),
    );
    expect(tx.cmsSeoTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId_locale: { pageId: 'page-1', locale: 'en' } },
      }),
    );
  });

  it('writes an English category without changing the Vietnamese category row', async () => {
    const { prisma, tx } = transactionClient();
    const repository = new CmsRepository(prisma as never);

    await repository.upsertEnglishCategoryTranslation('cat-1', {
      name: 'Games',
      description: 'English description',
    });

    expect(tx.cmsCategory.update).not.toHaveBeenCalled();
    expect(tx.cmsCategoryTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId_locale: { categoryId: 'cat-1', locale: 'en' } },
        create: expect.objectContaining({ name: 'Games' }),
      }),
    );
  });

  it('writes an English tag without changing the Vietnamese tag row', async () => {
    const { prisma, tx } = transactionClient();
    const repository = new CmsRepository(prisma as never);

    await repository.upsertEnglishTagTranslation('tag-1', {
      name: 'Steam cards',
      metaDescription: 'English tag text',
    });

    expect(tx.cmsTag.update).not.toHaveBeenCalled();
    expect(tx.cmsTagTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tagId_locale: { tagId: 'tag-1', locale: 'en' } },
        create: expect.objectContaining({ name: 'Steam cards' }),
      }),
    );
  });
});
