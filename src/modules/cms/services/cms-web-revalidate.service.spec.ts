import { CmsPageType } from '@prisma/client';
import { CmsWebRevalidateService } from './cms-web-revalidate.service';

describe('CmsWebRevalidateService.pathsForPage', () => {
  const service = new CmsWebRevalidateService({ get: () => undefined } as never);

  it('includes English URL variants for static policy pages', () => {
    const paths = service.pathsForPage({
      type: CmsPageType.PAGE,
      slug: 'chinh-sach-giao-hang-dien-tu',
    });
    expect(paths).toEqual(
      expect.arrayContaining([
        '/chinh-sach-giao-hang-dien-tu',
        '/en/chinh-sach-giao-hang-dien-tu',
        '/pages/chinh-sach-giao-hang-dien-tu',
        '/en/pages/chinh-sach-giao-hang-dien-tu',
        '/sitemap.xml',
        '/en/sitemap.xml',
      ]),
    );
  });

  it('includes English blog article paths', () => {
    const paths = service.pathsForPage({
      type: CmsPageType.BLOG_POST,
      slug: 'huong-dan-mua-the',
      categoryRel: { slug: 'huong-dan' },
    });
    expect(paths).toEqual(
      expect.arrayContaining([
        '/tin-tuc/huong-dan',
        '/en/tin-tuc/huong-dan',
        '/tin-tuc/huong-dan/huong-dan-mua-the',
        '/en/tin-tuc/huong-dan/huong-dan-mua-the',
      ]),
    );
  });
});

