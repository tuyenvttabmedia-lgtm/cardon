import Link from 'next/link';
import { BlogListImage } from '@/components/blog/BlogListImage';
import type { PublicBlogPost } from '@/lib/cms-api';
import { blogPostPath } from '@/lib/routes';
import { stripHtmlForSearch } from '@/lib/vi-search';
import { cn } from '@/lib/utils';

export type BlogCardVariant = 'grid' | 'featured' | 'compact' | 'homeGrid';

function getBlogPostSummary(post: PublicBlogPost, maxLength = 180): string | null {
  for (const raw of [post.excerpt, post.seo?.ogDescription, post.seo?.metaDescription]) {
    const text = raw?.trim();
    if (text) {
      return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
    }
  }

  const plain = stripHtmlForSearch(post.content);
  if (!plain) return null;
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}…` : plain;
}

export function BlogCard({
  post,
  variant = 'grid',
  featured = false,
  basePath = '/tin-tuc',
  className,
  /** Compact row thumbnail context */
  compactContext = 'home',
}: {
  post: PublicBlogPost;
  variant?: BlogCardVariant;
  featured?: boolean;
  basePath?: string;
  className?: string;
  compactContext?: 'home' | 'sidebar';
}) {
  const resolvedVariant: BlogCardVariant = featured ? 'featured' : variant;
  const summary = getBlogPostSummary(post, resolvedVariant === 'featured' ? 220 : 160);

  const href = blogPostPath(post.categorySlug, post.slug);

  if (resolvedVariant === 'compact') {
    const isHome = compactContext === 'home';
    return (
      <Link
        href={href}
        className={cn(
          'group flex min-w-0 gap-3',
          isHome && 'news-card-mobile rounded-2xl border border-cardon-border bg-white p-3 shadow-sm transition hover:shadow-card',
          !isHome && 'py-0.5',
          className,
        )}
      >
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-lg bg-cardon-light',
            isHome ? 'h-[76px] w-[112px] rounded-xl' : 'h-16 w-16 lg:h-[72px] lg:w-[72px]',
          )}
        >
          {post.featuredImage ? (
            <BlogListImage src={post.featuredImage} alt={post.title} />
          ) : (
            <div className="flex h-full items-center justify-center text-lg opacity-30">📰</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-[1.35] text-cardon-navy group-hover:text-cardon-blue">
            {post.title}
          </h3>
          {post.publishedAt && (
            <time className={cn('mt-1 block text-xs', isHome ? 'text-[#6B7280]' : 'text-cardon-gray')}>
              {new Date(post.publishedAt).toLocaleDateString('vi-VN')}
            </time>
          )}
        </div>
      </Link>
    );
  }

  if (resolvedVariant === 'homeGrid') {
    return (
      <Link
        href={href}
        className={cn(
          'group flex flex-col overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-card transition hover:shadow-card-hover',
          className,
        )}
      >
        <div className="relative aspect-[2/1] overflow-hidden rounded-t-xl bg-cardon-light">
          {post.featuredImage ? (
            <BlogListImage src={post.featuredImage} alt={post.title} />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl opacity-30">📰</div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-cardon-navy group-hover:text-cardon-blue">
            {post.title}
          </h3>
          {post.publishedAt && (
            <time className="mt-1.5 text-xs text-[#6B7280]">
              {new Date(post.publishedAt).toLocaleDateString('vi-VN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-card transition hover:shadow-card-hover',
        resolvedVariant === 'featured' && 'md:flex-row',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-cardon-light aspect-[16/9]',
          resolvedVariant === 'featured' && 'md:w-1/2 md:shrink-0',
        )}
      >
        {post.featuredImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featuredImage}
            alt={post.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl opacity-30">📰</div>
        )}
      </div>
      <div className={cn('flex flex-1 flex-col p-4 md:p-5', resolvedVariant === 'featured' && 'md:py-6')}>
        {post.category && (
          <span className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-cardon-blue">
            {post.category}
          </span>
        )}
        <h2
          className={cn(
            'mt-2 font-bold text-cardon-navy group-hover:text-cardon-blue',
            resolvedVariant === 'featured' ? 'text-xl md:text-2xl' : 'line-clamp-2 text-base',
          )}
        >
          {post.title}
        </h2>
        {summary ? (
          <p
            className={cn(
              'mt-3 text-sm leading-relaxed text-cardon-gray',
              resolvedVariant === 'featured' ? 'line-clamp-4 md:line-clamp-3' : 'line-clamp-2',
            )}
          >
            {summary}
          </p>
        ) : null}
        {post.publishedAt && (
          <time className={cn('text-xs text-cardon-gray', summary ? 'mt-4' : 'mt-auto pt-3')}>
            {new Date(post.publishedAt).toLocaleDateString('vi-VN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        )}
      </div>
    </Link>
  );
}
