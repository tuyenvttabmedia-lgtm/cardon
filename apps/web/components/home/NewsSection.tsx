import Link from 'next/link';
import { BlogCard } from '@/components/blog/BlogCard';
import type { PublicBlogPost } from '@/lib/cms-api';
import { BLOG_BASE_PATH } from '@/lib/routes';

export function NewsSection({ posts }: { posts: PublicBlogPost[] }) {
  const desktopItems = posts.slice(0, 8);
  const mobileItems = posts.slice(0, 4);

  if (!desktopItems.length) return null;

  return (
    <section className="overflow-x-hidden pt-6 pb-8 md:pt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-lg font-bold text-cardon-navy md:text-xl">Tin tức mới nhất</h2>
        <Link href={BLOG_BASE_PATH} className="shrink-0 text-sm font-semibold text-cardon-blue hover:underline">
          Xem tất cả →
        </Link>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {mobileItems.map((post) => (
          <BlogCard key={post.id} post={post} variant="compact" compactContext="home" basePath={BLOG_BASE_PATH} />
        ))}
        <Link
          href={BLOG_BASE_PATH}
          className="mt-1 flex w-full items-center justify-center rounded-xl border border-cardon-border bg-white py-3 text-sm font-semibold text-cardon-navy transition hover:border-cardon-blue hover:text-cardon-blue"
        >
          Xem tất cả tin tức
        </Link>
      </div>

      <div className="hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-4">
        {desktopItems.map((post) => (
          <BlogCard key={post.id} post={post} variant="homeGrid" basePath={BLOG_BASE_PATH} />
        ))}
      </div>
    </section>
  );
}
