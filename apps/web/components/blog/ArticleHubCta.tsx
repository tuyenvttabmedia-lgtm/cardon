import Link from 'next/link';
import { articleHubCtaForCategory } from '@/lib/seo-pillar-guides';

/** In-article commerce + related-guide links for crawlable internal signals. */
export function ArticleHubCta({
  categorySlug,
  currentPath,
}: {
  categorySlug: string | null | undefined;
  currentPath: string;
}) {
  const cta = articleHubCtaForCategory(categorySlug);
  const related = cta.related.filter((item) => item.href !== currentPath).slice(0, 3);

  return (
    <aside className="mt-8 rounded-xl border border-cardon-border bg-cardon-light/60 p-4 md:p-5">
      <p className="text-sm font-semibold text-cardon-navy">Tiếp theo trên CardOn</p>
      <Link
        href={cta.hubHref}
        className="mt-2 inline-flex rounded-xl bg-cardon-blue px-4 py-2.5 text-sm font-bold text-white hover:bg-cardon-blue/90"
      >
        {cta.hubLabel}
      </Link>
      {related.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm text-cardon-gray">
          {related.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-cardon-blue hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
