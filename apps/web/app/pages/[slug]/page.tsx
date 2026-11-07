import { permanentRedirect } from 'next/navigation';
import { withLocalePrefix } from '@/lib/i18n/locale';
import { readRequestLocale } from '@/lib/i18n/request-locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `Redirect — ${slug}` };
}

export default async function LegacyCmsPageRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await readRequestLocale();
  permanentRedirect(withLocalePrefix(`/${slug}`, locale));
}
