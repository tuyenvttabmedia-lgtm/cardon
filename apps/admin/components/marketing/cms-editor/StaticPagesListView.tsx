'use client';

import { useMemo, useState } from 'react';
import { CmsStatusBadge } from '@/components/marketing/cms-editor/CmsBadges';
import { Button, Input } from '@/components/ui/Form';
import { buildPublicPageUrl } from '@/lib/public-url';
import { CMS_PAGE_LAYOUT_LABELS } from '@/lib/cms-page-layout';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsPage } from '@/types/api';

interface Props {
  items: CmsPage[];
  onCreate: () => void;
  onEdit: (page: CmsPage) => void;
  onOpenSpecial: (slug: 'gioi-thieu' | 'lien-he') => void;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}

const SPECIAL_PAGES: Array<{
  slug: 'gioi-thieu' | 'lien-he';
  title: string;
  description: string;
  path: string;
  layoutLabel: string;
}> = [
  {
    slug: 'gioi-thieu',
    title: 'Giới thiệu',
    description: 'Trang landing hero + block card, thống kê, CTA.',
    path: '/gioi-thieu',
    layoutLabel: CMS_PAGE_LAYOUT_LABELS.LANDING,
  },
  {
    slug: 'lien-he',
    title: 'Liên hệ',
    description: 'Nội dung giới thiệu + kênh liên hệ (cấu hình ở Giao diện).',
    path: '/lien-he',
    layoutLabel: CMS_PAGE_LAYOUT_LABELS.ARTICLE,
  },
];

function formatUpdatedAt(value: string): string {
  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function StaticPagesListView({ items, onCreate, onEdit, onOpenSpecial, onReload, onError }: Props) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visiblePages = useMemo(
    () =>
      items
        .filter((p) => p.status !== 'ARCHIVED')
        .filter((p) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items, query],
  );

  const navItems = useMemo(
    () =>
      items
        .filter((p) => p.showInNav && p.status === 'PUBLISHED')
        .sort((a, b) => (a.navSortOrder ?? 0) - (b.navSortOrder ?? 0)),
    [items],
  );

  const publishedCount = items.filter((p) => p.status === 'PUBLISHED').length;

  async function persistNavOrder(ordered: CmsPage[]) {
    await Promise.all(
      ordered.map((page, index) =>
        cmsAdminApi.updatePage(page.id, { navSortOrder: index + 1 }),
      ),
    );
  }

  async function moveNavItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= navItems.length) return;
    const ordered = [...navItems];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const id = ordered[target].id;
    setBusyId(id);
    onError(null);
    try {
      await persistNavOrder(ordered);
      await onReload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : 'Không thể sắp xếp menu');
    } finally {
      setBusyId(null);
    }
  }

  async function setNavVisibility(page: CmsPage, showInNav: boolean) {
    setBusyId(page.id);
    onError(null);
    try {
      await cmsAdminApi.updatePage(page.id, { showInNav });
      await onReload();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : 'Không thể cập nhật menu');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white shadow-sm">
        <div className="border-b border-amber-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Trang đặc biệt</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Các trang cố định trên menu chính — tạo hoặc chỉnh sửa nhanh tại đây.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {SPECIAL_PAGES.map((special) => {
            const page = items.find((p) => p.slug === special.slug);
            const published = page?.status === 'PUBLISHED';

            return (
              <div
                key={special.slug}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-zinc-900">{special.title}</h3>
                    {page ? <CmsStatusBadge status={page.status} /> : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        Chưa tạo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{special.description}</p>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {special.path} · Layout: {special.layoutLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => onOpenSpecial(special.slug)}>
                    {page ? 'Chỉnh sửa' : 'Tạo trang'}
                  </Button>
                  {published ? (
                    <a
                      href={buildPublicPageUrl(special.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
                    >
                      Xem trên web
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Menu sidebar — Trang thông tin</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Thứ tự và danh sách hiển thị ở sidebar các trang chính sách trên cardon.vn.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            {navItems.length} mục đang hiển thị
          </span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[220px_1fr] lg:items-start">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Xem trước
            </p>
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Trang thông tin
            </p>
            {navItems.length > 0 ? (
              <ul className="space-y-1">
                {navItems.map((page) => (
                  <li
                    key={page.id}
                    className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700"
                  >
                    {page.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">
                Chưa có trang nào trong menu
              </p>
            )}
          </div>

          <div className="min-w-0">
            {navItems.length > 0 ? (
              <ol className="space-y-2">
                {navItems.map((page, index) => (
                  <li
                    key={page.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-zinc-500 shadow-sm">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{page.title}</p>
                      <p className="truncate text-xs text-zinc-400">/{page.slug}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === page.id || index === 0}
                        onClick={() => void moveNavItem(index, -1)}
                        aria-label="Lên"
                        title="Lên"
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === page.id || index === navItems.length - 1}
                        onClick={() => void moveNavItem(index, 1)}
                        aria-label="Xuống"
                        title="Xuống"
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === page.id}
                        onClick={() => void setNavVisibility(page, false)}
                      >
                        Bỏ khỏi menu
                      </Button>
                      <a
                        href={buildPublicPageUrl(`/${page.slug}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
                      >
                        Xem
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center">
                <p className="text-sm text-zinc-600">Chưa có trang nào trong menu sidebar.</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Bật cột &quot;Menu&quot; cho các trang đã xuất bản ở bảng bên dưới.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Tất cả trang tĩnh</h2>
            <p className="text-xs text-zinc-500">
              {visiblePages.length} trang · {publishedCount} đã xuất bản
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-52"
              placeholder="Tìm theo tiêu đề, slug..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={onCreate}>+ Trang mới</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 font-semibold">Trang</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Menu sidebar</th>
                <th className="px-4 py-2.5 font-semibold">Cập nhật</th>
                <th className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visiblePages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                    {query ? 'Không tìm thấy trang phù hợp.' : 'Chưa có trang tĩnh nào.'}
                  </td>
                </tr>
              ) : (
                visiblePages.map((page) => {
                  const inMenu = !!page.showInNav && page.status === 'PUBLISHED';
                  const menuDisabled = page.status !== 'PUBLISHED';
                  const navRank = inMenu
                    ? navItems.findIndex((p) => p.id === page.id) + 1
                    : 0;

                  return (
                    <tr key={page.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{page.title}</p>
                        <p className="text-xs text-zinc-400">/{page.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <CmsStatusBadge status={page.status} />
                      </td>
                      <td className="px-4 py-3">
                        <label
                          className={`inline-flex items-center gap-2 ${menuDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                          title={
                            menuDisabled
                              ? 'Chỉ trang đã xuất bản mới thêm vào menu'
                              : inMenu
                                ? `Vị trí #${navRank} trong menu`
                                : 'Thêm vào menu sidebar'
                          }
                        >
                          <input
                            type="checkbox"
                            className="rounded border-zinc-300 text-admin-600 focus:ring-admin-500"
                            checked={inMenu}
                            disabled={menuDisabled || busyId === page.id}
                            onChange={(e) => void setNavVisibility(page, e.target.checked)}
                          />
                          <span className="text-xs text-zinc-600">
                            {inMenu ? `Vị trí #${navRank}` : menuDisabled ? '—' : 'Chưa thêm'}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {formatUpdatedAt(page.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => onEdit(page)}>
                          Sửa
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
