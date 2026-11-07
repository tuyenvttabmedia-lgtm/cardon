import { permanentRedirect } from 'next/navigation';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { getBlogPost } from '@/lib/cms-api';
import { blogPostPath } from '@/lib/routes';

export default async function BlogPostRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await readRequestLocale();
  const data = await getBlogPost(slug, locale);
  if (data?.post) {
    permanentRedirect(blogPostPath(data.post.categorySlug, data.post.slug));
  }
  permanentRedirect(`/${slug}`);
}
