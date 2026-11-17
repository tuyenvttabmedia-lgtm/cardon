import Link from 'next/link';
import { HUB_GUIDE_LINKS, type GuideLink } from '@/lib/seo-pillar-guides';

export function HubGuideLinks({
  path,
  title = 'Hướng dẫn liên quan',
  links,
}: {
  path: string;
  title?: string;
  links?: GuideLink[];
}) {
  const items = links ?? HUB_GUIDE_LINKS[path] ?? [];
  if (!items.length) return null;

  return (
    <section className="mt-6 rounded-2xl border border-cardon-border bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-bold text-cardon-navy">{title}</h2>
      <p className="mt-1 text-sm text-cardon-gray">
        Bài viết hữu ích giúp chọn sản phẩm và tránh lỗi khi mua / nạp trên CardOn.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-xl border border-cardon-border px-3 py-2.5 text-sm font-medium text-cardon-navy transition-colors hover:border-cardon-blue/40 hover:text-cardon-blue"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
