'use client';

import { useState } from 'react';
import { sanitizeCmsHtml } from '@/lib/sanitize-cms-html';
import type { CmsPageLayoutValue } from '@/lib/cms-page-layout';

function SafeHtml({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeCmsHtml(html);
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}

type PreviewMode = 'desktop' | 'tablet' | 'mobile';

const WIDTH: Record<PreviewMode, string> = {
  desktop: 'max-w-4xl',
  tablet: 'max-w-xl',
  mobile: 'max-w-sm',
};

export function ArticlePreviewModal({
  open,
  onClose,
  title,
  content,
  featuredImage,
  excerpt = '',
  pageLayout = 'ARTICLE',
  slug = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  featuredImage: string;
  excerpt?: string;
  pageLayout?: CmsPageLayoutValue;
  slug?: string;
}) {
  const [mode, setMode] = useState<PreviewMode>('desktop');

  if (!open) return null;

  const heroSubtitle =
    excerpt?.trim() ||
    'Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam.';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-900/90" onClick={onClose}>
      <div
        className="flex items-center justify-between border-b border-zinc-700 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white">Xem trước (không cần xuất bản)</p>
        <div className="flex gap-2">
          {(['desktop', 'tablet', 'mobile'] as PreviewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${mode === m ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              {m}
            </button>
          ))}
          <button type="button" className="ml-4 text-sm text-zinc-300 hover:text-white" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className={`w-full ${WIDTH[mode]}`}>
          {pageLayout === 'LANDING' ? (
            <div className="overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 px-6 py-10 text-center text-white md:px-10 md:py-14">
                <h1 className="text-2xl font-bold md:text-3xl">{title || 'Giới thiệu'}</h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-blue-100 md:text-base">{heroSubtitle}</p>
              </div>
              <SafeHtml html={content || '<p></p>'} className="cms-prose cms-landing max-w-none px-4 py-8 md:px-8" />
            </div>
          ) : pageLayout === 'POLICY' ? (
            <div className="grid gap-4 rounded-xl bg-zinc-100 p-4 md:grid-cols-[180px_1fr]">
              <nav className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Trang thông tin
                </p>
                <ul className="space-y-1 text-xs">
                  <li className="rounded-lg bg-blue-600 px-2 py-1.5 font-medium text-white">{title || 'Trang'}</li>
                  <li className="rounded-lg px-2 py-1.5 text-zinc-500">…</li>
                </ul>
              </nav>
              <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-bold text-zinc-900">{title || 'Tiêu đề trang'}</h1>
                <SafeHtml html={content || '<p></p>'} className="cms-prose mt-4 max-w-none" />
              </article>
            </div>
          ) : (
            <article className="rounded-xl bg-white p-6 shadow-xl">
              {featuredImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featuredImage} alt="" className="mb-4 aspect-video w-full rounded-lg object-cover" />
              ) : null}
              <h1 className="text-2xl font-bold text-zinc-900">{title || 'Tiêu đề bài viết'}</h1>
              {excerpt ? <p className="mt-2 text-sm text-zinc-500">{excerpt}</p> : null}
              <SafeHtml html={content || '<p></p>'} className="cms-prose mt-4 max-w-none" />
              {slug === 'gioi-thieu' ? (
                <p className="mt-4 text-xs text-amber-600">
                  Gợi ý: chọn layout &quot;Landing (Giới thiệu)&quot; và dùng chế độ HTML để giữ block layout.
                </p>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
