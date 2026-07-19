'use client';

import Link from 'next/link';
import { BlogCard } from '@/components/blog/BlogCard';
import type { PublicBlogPost } from '@/lib/cms-api';

import { BLOG_BASE_PATH } from '@/lib/routes';

function PostLinks({
  title,
  posts,
  basePath = BLOG_BASE_PATH,
}: {
  title: string;
  posts: PublicBlogPost[];
  basePath?: string;
}) {
  if (!posts.length) return null;
  return (
    <section className="rounded-xl border border-cardon-border bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-cardon-navy">{title}</h2>
      <ul className="mt-3 space-y-3">
        {posts.map((p) => (
          <li key={p.id}>
            <BlogCard post={p} variant="compact" compactContext="sidebar" basePath={basePath} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ArticleSidebar({
  related,
  latest,
  blogBasePath = BLOG_BASE_PATH,
}: {
  related: PublicBlogPost[];
  latest: PublicBlogPost[];
  blogBasePath?: string;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[88px]">
      <PostLinks title="Bài viết liên quan" posts={related.slice(0, 5)} basePath={blogBasePath} />
      <PostLinks title="Bài viết mới" posts={latest.slice(0, 5)} basePath={blogBasePath} />
    </aside>
  );
}

export function RelatedPostsGrid({
  posts,
  basePath = BLOG_BASE_PATH,
}: {
  posts: PublicBlogPost[];
  basePath?: string;
}) {
  if (!posts.length) return null;
  return (
    <section className="mt-10 border-t border-cardon-border pt-8">
      <h2 className="text-lg font-bold text-cardon-navy">Bài viết liên quan</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        {posts.map((p) => (
          <BlogCard key={p.id} post={p} basePath={basePath} />
        ))}
      </div>
    </section>
  );
}
