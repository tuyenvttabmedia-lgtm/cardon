import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleSidebar, RelatedPostsGrid } from '@/components/blog/ArticleSidebar';
import { ArticleShareButtons } from '@/components/blog/ArticleShareButtons';
import { ArticleTableOfContents } from '@/components/blog/ArticleTableOfContents';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageContainer } from '@/components/layout/PageContainer';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import { pickRelatedPosts, prepareArticleHtml } from '@/lib/blog-utils';
import { getBlogPost, listBlogPosts } from '@/lib/cms-api';
import { BLOG_BASE_PATH, blogCategoryPath, blogPostPath } from '@/lib/routes';
import { buildCmsMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';

export async function buildBlogArticleMetadata(slug: string): Promise<Metadata> {
  const data = await getBlogPost(slug);
  if (!data) return { title: 'Không tìm thấy bài viết' };
  return buildCmsMetadata(data.post, data.post.seo, blogPostPath(data.post.categorySlug, data.post.slug));
}

export async function BlogArticlePageView({ slug }: { slug: string }) {
  const data = await getBlogPost(slug);
  if (!data) notFound();
  const { post, related: apiRelated } = data;

  const allPosts = (await listBlogPosts({ take: 20 })) ?? [];
  const relatedPosts = pickRelatedPosts(post, apiRelated, allPosts, 4);
  const latest = allPosts.filter((p) => p.id !== post.id).slice(0, 5);

  const { html: articleHtml, headings } = prepareArticleHtml(post.content);

  const articlePath = blogPostPath(post.categorySlug, post.slug);
  const articleUrl = `${getSiteUrl()}${articlePath}`;
  const postBasePath = BLOG_BASE_PATH;

  const schema = post.seo?.structuredData ?? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? post.seo?.metaDescription,
    image: post.featuredImage ?? post.seo?.ogImage,
    datePublished: post.publishedAt,
    author: { '@type': 'Organization', name: 'CardOn' },
    publisher: {
      '@type': 'Organization',
      name: 'CardOn',
      logo: { '@type': 'ImageObject', url: `${getSiteUrl()}/images/cardon-logo-full.png` },
    },
    mainEntityOfPage: articleUrl,
  };

  const breadcrumbItems = [
    { label: 'Trang chủ', href: '/' },
    { label: 'Tin tức', href: BLOG_BASE_PATH },
    ...(post.category && post.categorySlug
      ? [{ label: post.category, href: blogCategoryPath(post.categorySlug) }]
      : []),
    { label: post.title },
  ];

  return (
    <PageContainer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <Breadcrumb items={breadcrumbItems} className="mb-6" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="mx-auto w-full max-w-[760px] lg:max-w-none">
          <article className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-8">
            <header className="space-y-3">
              {post.category && post.categorySlug && (
                <Link
                  href={blogCategoryPath(post.categorySlug)}
                  className="inline-flex rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-cardon-blue"
                >
                  {post.category}
                </Link>
              )}
              <h1 className="text-2xl font-bold leading-tight text-cardon-navy md:text-[1.75rem]">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-cardon-gray">
                {post.publishedAt && (
                  <time>
                    {new Date(post.publishedAt).toLocaleDateString('vi-VN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                )}
                <span>•</span>
                <span>Tác giả: CardOn</span>
              </div>
            </header>

            <ArticleTableOfContents items={headings} />

            {post.featuredImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.featuredImage}
                alt={post.title}
                className="mt-6 aspect-video w-full rounded-xl object-cover"
              />
            )}

            <SafeCmsHtml html={articleHtml} className="cms-prose mt-6" />

            <ArticleShareButtons url={articleUrl} title={post.title} />

            {post.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2 border-t border-cardon-border pt-6">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-cardon-light px-3 py-1 text-xs text-cardon-gray">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </article>

          <RelatedPostsGrid posts={relatedPosts} basePath={postBasePath} />
        </div>

        <ArticleSidebar related={relatedPosts} latest={latest} blogBasePath={postBasePath} />
      </div>
    </PageContainer>
  );
}
