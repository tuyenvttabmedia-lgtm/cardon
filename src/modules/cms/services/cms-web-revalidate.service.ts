import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CmsPageType } from '@prisma/client';

type CmsPageLike = {
  type: CmsPageType | string;
  slug: string;
  categoryRel?: { slug: string } | null;
  categorySlug?: string | null;
};

@Injectable()
export class CmsWebRevalidateService {
  private readonly logger = new Logger(CmsWebRevalidateService.name);

  constructor(private readonly config: ConfigService) {}

  pathsForPage(page: CmsPageLike): string[] {
    const paths = new Set<string>(['/tin-tuc', '/sitemap.xml']);
    const categorySlug = page.categoryRel?.slug ?? page.categorySlug ?? null;

    if (page.type === CmsPageType.BLOG_POST || page.type === 'BLOG_POST') {
      if (categorySlug) {
        paths.add(`/tin-tuc/${categorySlug}`);
        paths.add(`/tin-tuc/${categorySlug}/${page.slug}`);
      } else {
        paths.add(`/${page.slug}`);
      }
    } else {
      paths.add(`/${page.slug}`);
      paths.add(`/pages/${page.slug}`);
    }

    return [...paths];
  }

  async notifyPublish(page: CmsPageLike): Promise<void> {
    await this.revalidate({
      paths: this.pathsForPage(page),
      tags: ['cms'],
    });
  }

  async notifySeoSettings(): Promise<void> {
    await this.revalidate({
      paths: ['/', '/robots.txt', '/sitemap.xml'],
      tags: ['cms'],
    });
  }

  async notifyFaq(): Promise<void> {
    await this.revalidate({
      paths: ['/tro-giup', '/sitemap.xml'],
      tags: ['cms'],
    });
  }

  async notifyBanners(): Promise<void> {
    await this.revalidate({
      paths: ['/'],
      tags: ['cms'],
    });
  }

  async notifyProducts(slugs: string[] = []): Promise<void> {
    const paths = new Set<string>(['/sitemap.xml', '/the-game', '/the-dien-thoai', '/nap-cuoc', '/nap-data']);
    for (const slug of slugs) {
      if (slug?.trim()) paths.add(`/product/${slug.trim()}`);
    }
    await this.revalidate({
      paths: [...paths],
      tags: ['products', 'cms'],
    });
  }

  async revalidate(input: { paths?: string[]; tags?: string[] }): Promise<void> {
    const base = (
      this.config.get<string>('app.webInternalUrl') ??
      process.env.WEB_INTERNAL_URL ??
      ''
    ).replace(/\/$/, '');
    const secret = (
      this.config.get<string>('app.webRevalidateSecret') ??
      process.env.WEB_REVALIDATE_SECRET ??
      ''
    ).trim();

    if (!base || !secret) {
      return;
    }

    const url = `${base}/api/revalidate`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify({
          paths: input.paths ?? [],
          tags: input.tags ?? ['cms'],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Web revalidate failed (${res.status}) ${url}: ${text.slice(0, 200)}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Web revalidate error: ${message}`);
    }
  }
}
