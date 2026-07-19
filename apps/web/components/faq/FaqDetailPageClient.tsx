'use client';

import Link from 'next/link';
import { SafeFaqHtml } from '@/components/SafeFaqHtml';
import { FaqSchema } from '@/components/seo/FaqSchema';
import type { PublicFaqDetail } from '@/lib/cms-api';

export function FaqDetailPageClient({ data }: { data: PublicFaqDetail }) {
  const { faq, related } = data;

  return (
    <div className="page-shell py-8">
      <FaqSchema question={faq.question} answerHtml={faq.answer} />

      <nav className="mb-4 text-sm text-cardon-gray">
        <Link href="/" className="hover:text-cardon-blue">
          Trang chủ
        </Link>
        <span className="mx-2">›</span>
        <Link href="/tro-giup" className="hover:text-cardon-blue">
          Trợ giúp
        </Link>
        <span className="mx-2">›</span>
        <Link href={`/tro-giup?category=${faq.category.slug}`} className="hover:text-cardon-blue">
          {faq.category.name}
        </Link>
      </nav>

      <article className="rounded-2xl border border-cardon-border bg-white p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-cardon-blue">{faq.category.name}</p>
        <h1 className="mt-2 text-xl font-bold text-cardon-navy md:text-2xl">{faq.question}</h1>
        <SafeFaqHtml html={faq.answer} className="cms-prose mt-6" />
      </article>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-cardon-navy">Câu hỏi liên quan</h2>
          <ul className="divide-y divide-cardon-border rounded-2xl border border-cardon-border bg-white">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/tro-giup/${item.category.slug}/${item.slug}`}
                  className="block px-4 py-3 text-sm font-medium text-cardon-navy hover:bg-cardon-light/50 md:px-5"
                >
                  {item.question}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        <Link href="/tro-giup" className="text-sm font-semibold text-cardon-blue hover:underline">
          ← Quay lại Trung tâm trợ giúp
        </Link>
      </div>
    </div>
  );
}
