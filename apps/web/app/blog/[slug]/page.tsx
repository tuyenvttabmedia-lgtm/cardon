import { permanentRedirect } from 'next/navigation';
import { getBlogPost } from '@/lib/cms-api';
import { blogPostPath } from '@/lib/routes';

export default async function BlogPostRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getBlogPost(slug);
  if (data?.post) {
    permanentRedirect(blogPostPath(data.post.categorySlug, data.post.slug));
  }
  permanentRedirect(`/${slug}`);
}
