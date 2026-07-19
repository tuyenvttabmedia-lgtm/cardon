'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mediaFullUrl } from '@/components/marketing/MediaLibraryPicker';
import { Button, Input, Select } from '@/components/ui/Form';
import type { CmsCategory, CmsPage, CmsTag } from '@/types/api';
import {
  analyzeMediaCounts,
  buildSeoChecklist,
  computeSeoScore,
  emptyCmsForm,
  sortPages,
  type QuickFilter,
  type SortField,
} from '@/lib/cms-editor-utils';
import {
  getScheduledPublish,
  getViewCount,
  isInTrash,
  listDeletedForeverIds,
  loadArticleFilters,
  saveArticleFilters,
} from '@/lib/cms-revisions';
import { CmsStatusBadge, SeoScoreBadge } from './CmsBadges';

export interface ArticleListFilters {
  q: string;
  categoryId: string;
  tagId: string;
  status: string;
  author: string;
  dateFrom: string;
  dateTo: string;
  quickFilter: QuickFilter;
  sortField: SortField;
  page: number;
  pageSize: 20 | 50 | 100;
}

const DEFAULT_FILTERS: ArticleListFilters = {
  q: '',
  categoryId: '',
  tagId: '',
  status: '',
  author: '',
  dateFrom: '',
  dateTo: '',
  quickFilter: 'all',
  sortField: 'updated',
  page: 1,
  pageSize: 20,
};

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'published', label: 'Đã xuất bản' },
  { id: 'draft', label: 'Bản nháp' },
  { id: 'scheduled', label: 'Đã lên lịch' },
  { id: 'archived', label: 'Đã lưu trữ' },
  { id: 'trash', label: 'Thùng rác' },
];

const ROW_HEIGHT = 56;
const VIRTUAL_THRESHOLD = 1000;

function ThumbnailCell({ src, title }: { src: string | null | undefined; title: string }) {
  const [hover, setHover] = useState(false);
  const url = src ? mediaFullUrl(src) : null;
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-[45px] w-20 rounded object-cover" />
      ) : (
        <div className="flex h-[45px] w-20 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-400">—</div>
      )}
      {hover && url && (
        <div className="absolute left-full top-0 z-30 ml-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} className="max-h-48 max-w-xs object-contain" />
        </div>
      )}
    </div>
  );
}

function MediaIcons({ content }: { content: string }) {
  const m = analyzeMediaCounts(content);
  if (!m.images && !m.videos && !m.tables) return null;
  return (
    <span className="inline-flex gap-1 text-[10px] text-zinc-400">
      {m.images > 0 && <span title={`${m.images} ảnh`}>🖼{m.images}</span>}
      {m.videos > 0 && <span title={`${m.videos} video`}>▶{m.videos}</span>}
      {m.tables > 0 && <span title={`${m.tables} bảng`}>⊞{m.tables}</span>}
    </span>
  );
}

function QuickEditModal({
  page,
  categories,
  onClose,
  onSave,
}: {
  page: CmsPage;
  categories: CmsCategory[];
  onClose: () => void;
  onSave: (data: { title: string; status: CmsPage['status']; categoryId: string }) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState(page.status);
  const [categoryId, setCategoryId] = useState(page.categoryId ?? page.categoryRel?.id ?? '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <h3 className="font-semibold">Quick Edit</h3>
        <div className="mt-3 space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as CmsPage['status'])}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Danh mục —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onSave({ title, status, categoryId })}>Lưu</Button>
        </div>
      </div>
    </div>
  );
}

export const ArticleListTable = memo(function ArticleListTable({
  items,
  categories,
  tags,
  onEdit,
  onPreview,
  onDuplicate,
  onTrash,
  onRestore,
  onDeleteForever,
  onBulk,
  onCreate,
  onQuickEdit,
}: {
  items: CmsPage[];
  categories: CmsCategory[];
  tags: CmsTag[];
  onEdit: (page: CmsPage) => void;
  onPreview: (page: CmsPage) => void;
  onDuplicate: (page: CmsPage) => void;
  onTrash: (page: CmsPage) => void;
  onRestore: (page: CmsPage) => void;
  onDeleteForever: (page: CmsPage) => void;
  onBulk: (action: string, ids: string[], extra?: { categoryId?: string; tagIds?: string[] }) => void;
  onCreate: () => void;
  onQuickEdit: (page: CmsPage, data: { title: string; status: CmsPage['status']; categoryId: string }) => void;
}) {
  const [filters, setFilters] = useState<ArticleListFilters>(() => loadArticleFilters<ArticleListFilters>() ?? DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [quickEditPage, setQuickEditPage] = useState<CmsPage | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    saveArticleFilters(filters);
  }, [filters]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of items) {
      const id = p.categoryId ?? p.categoryRel?.id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const seoScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const p of items) {
      const form = {
        ...emptyCmsForm(),
        title: p.title,
        slug: p.slug,
        content: p.content,
        featuredImage: p.featuredImage ?? '',
        focusKeyword: p.seo?.focusKeyword ?? '',
        metaDescription: p.seo?.metaDescription ?? '',
        canonicalUrl: p.seo?.canonicalUrl ?? '',
      };
      scores[p.id] = computeSeoScore(buildSeoChecklist(form));
    }
    return scores;
  }, [items]);

  const viewsMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of items) m[p.id] = getViewCount(p.id);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const deleted = listDeletedForeverIds();
    return items.filter((p) => {
      if (deleted.has(p.id)) return false;
      const inTrash = isInTrash(p.id);
      const scheduled = getScheduledPublish(p.id);
      const isScheduled = scheduled && new Date(scheduled) > new Date();

      if (filters.quickFilter === 'trash') return inTrash;
      if (inTrash) return false;

      switch (filters.quickFilter) {
        case 'published':
          if (p.status !== 'PUBLISHED' || isScheduled) return false;
          break;
        case 'draft':
          if (p.status !== 'DRAFT' || isScheduled) return false;
          break;
        case 'scheduled':
          if (!isScheduled) return false;
          break;
        case 'archived':
          if (p.status !== 'ARCHIVED') return false;
          break;
        default:
          if (p.status === 'ARCHIVED') return false;
      }

      const q = filters.q.trim().toLowerCase();
      if (q) {
        const tagNames = p.pageTags?.map((pt) => pt.tag.name).join(' ') ?? '';
        const hay = `${p.title} ${p.slug} ${p.seo?.focusKeyword ?? ''} ${p.seo?.metaTitle ?? ''} ${p.seo?.metaDescription ?? ''} ${p.categoryRel?.name ?? ''} ${tagNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.categoryId && p.categoryId !== filters.categoryId && p.categoryRel?.id !== filters.categoryId) return false;
      if (filters.tagId && !p.pageTags?.some((pt) => pt.tag.id === filters.tagId)) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.author && !(p as CmsPage & { author?: { email?: string } }).author?.email?.toLowerCase().includes(filters.author.toLowerCase())) return false;
      if (filters.dateFrom && p.updatedAt < filters.dateFrom) return false;
      if (filters.dateTo && p.updatedAt > `${filters.dateTo}T23:59:59`) return false;
      return true;
    });
  }, [items, filters]);

  const sorted = useMemo(
    () => sortPages(filtered, filters.sortField, seoScores, viewsMap),
    [filtered, filters.sortField, seoScores, viewsMap],
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const pageStart = (page - 1) * filters.pageSize;
  const pageEnd = Math.min(total, pageStart + filters.pageSize);
  const paged = sorted.slice(pageStart, pageEnd);

  const useVirtual = total > VIRTUAL_THRESHOLD;
  const virtualStart = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5) : 0;
  const virtualEnd = useVirtual
    ? Math.min(paged.length, virtualStart + Math.ceil(containerHeight / ROW_HEIGHT) + 15)
    : paged.length;
  const visibleRows = useVirtual ? paged.slice(virtualStart, virtualEnd) : paged;
  const paddingTop = useVirtual ? virtualStart * ROW_HEIGHT : 0;
  const paddingBottom = useVirtual ? Math.max(0, (paged.length - virtualEnd) * ROW_HEIGHT) : 0;

  const setFilter = useCallback((patch: Partial<ArticleListFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }, []);

  const allSelected = paged.length > 0 && paged.every((p) => selected.has(p.id));

  if (items.filter((p) => !isInTrash(p.id) && p.status !== 'ARCHIVED').length === 0 && filters.quickFilter === 'all') {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-16 text-center">
        <p className="text-lg font-medium text-zinc-700">Bạn chưa có bài viết.</p>
        <Button className="mt-4" onClick={onCreate}>Tạo bài đầu tiên</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap lg:gap-3">
        <Button onClick={onCreate} className="shrink-0">+ Bài viết mới</Button>
        <Input placeholder="Search title, slug, keyword, meta…" className="min-w-[140px] flex-1" value={filters.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <Select className="min-w-[120px]" value={filters.categoryId} onChange={(e) => setFilter({ categoryId: e.target.value })}>
          <option value="">Danh mục</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({categoryCounts[c.id] ?? 0})</option>)}
        </Select>
        <Select className="min-w-[100px]" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">Trạng thái</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Input placeholder="Tác giả" className="min-w-[100px]" value={filters.author} onChange={(e) => setFilter({ author: e.target.value })} />
        <Input type="date" className="min-w-[130px]" value={filters.dateFrom} onChange={(e) => setFilter({ dateFrom: e.target.value })} title="Từ ngày" />
        <Input type="date" className="min-w-[130px]" value={filters.dateTo} onChange={(e) => setFilter({ dateTo: e.target.value })} title="Đến ngày" />
        <Button variant="secondary" onClick={() => setFilter(DEFAULT_FILTERS)}>Lọc</Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {QUICK_FILTERS.map((qf) => (
          <button
            key={qf.id}
            type="button"
            onClick={() => setFilter({ quickFilter: qf.id })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filters.quickFilter === qf.id ? 'bg-admin-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {qf.label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-admin-200 bg-admin-50 px-3 py-2 text-sm">
          <span>{selected.size} đã chọn</span>
          <Button size="sm" onClick={() => { onBulk('publish', [...selected]); setSelected(new Set()); }}>Publish</Button>
          <Button size="sm" variant="secondary" onClick={() => { onBulk('draft', [...selected]); setSelected(new Set()); }}>Draft</Button>
          <Button size="sm" variant="secondary" onClick={() => { onBulk('archive', [...selected]); setSelected(new Set()); }}>Archive</Button>
          <Button size="sm" variant="ghost" onClick={() => { onBulk('trash', [...selected]); setSelected(new Set()); }}>Delete</Button>
          <Select className="text-sm" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Chuyển danh mục…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!bulkCategory} onClick={() => { onBulk('category', [...selected], { categoryId: bulkCategory }); setSelected(new Set()); }}>Áp dụng</Button>
          <select multiple className="max-h-20 rounded border text-xs" value={bulkTags} onChange={(e) => setBulkTags(Array.from(e.target.selectedOptions, (o) => o.value))}>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!bulkTags.length} onClick={() => { onBulk('tags', [...selected], { tagIds: bulkTags }); setSelected(new Set()); }}>Replace Tag</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
        <div className="flex items-center gap-2">
          <span>Showing {total === 0 ? 0 : pageStart + 1}–{pageEnd} / {total}</span>
          <Select className="text-sm" value={filters.pageSize} onChange={(e) => setFilter({ pageSize: Number(e.target.value) as 20 | 50 | 100, page: 1 })}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </Select>
          <span>/ trang</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">Sort:</span>
          <Select className="text-sm" value={filters.sortField} onChange={(e) => setFilter({ sortField: e.target.value as SortField })}>
            <option value="updated">Updated</option>
            <option value="title">Title</option>
            <option value="views">Views</option>
            <option value="seo">SEO</option>
            <option value="published">Published</option>
          </Select>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setFilter({ page: page - 1 })}>←</Button>
          <span>{page}/{totalPages}</span>
          <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setFilter({ page: page + 1 })}>→</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <div
          ref={scrollRef}
          className={useVirtual ? 'max-h-[70vh] overflow-y-auto' : undefined}
          onScroll={useVirtual ? (e) => setScrollTop((e.target as HTMLDivElement).scrollTop) : undefined}
        >
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2"><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(paged.map((p) => p.id)) : new Set())} /></th>
                <th className="px-2 py-2">Ảnh</th>
                <th className="px-2 py-2">Tiêu đề</th>
                <th className="hidden px-2 py-2 md:table-cell">Danh mục</th>
                <th className="hidden px-2 py-2 lg:table-cell">Tag</th>
                <th className="hidden px-2 py-2 xl:table-cell">Author</th>
                <th className="px-2 py-2">Views</th>
                <th className="px-2 py-2">SEO</th>
                <th className="px-2 py-2">Status</th>
                <th className="hidden px-2 py-2 lg:table-cell">Updated</th>
                <th className="hidden px-2 py-2 md:table-cell">Publish</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {useVirtual && paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={12} /></tr>}
              {visibleRows.map((p) => {
                const author = (p as CmsPage & { author?: { email?: string } }).author?.email ?? '—';
                const score = seoScores[p.id] ?? 0;
                const scheduled = getScheduledPublish(p.id);
                const inTrash = isInTrash(p.id);
                const views = viewsMap[p.id] ?? 0;
                return (
                  <tr key={p.id} className="group border-t border-zinc-100 hover:bg-zinc-50/80" style={{ height: ROW_HEIGHT }}>
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        setSelected(next);
                      }} />
                    </td>
                    <td className="px-2 py-1"><ThumbnailCell src={p.featuredImage} title={p.title} /></td>
                    <td className="max-w-[180px] px-2 py-1">
                      <div className="truncate font-medium">{p.title}</div>
                      <MediaIcons content={p.content} />
                    </td>
                    <td className="hidden px-2 py-1 text-zinc-600 md:table-cell">{p.categoryRel?.name ?? '—'}</td>
                    <td className="hidden max-w-[100px] truncate px-2 py-1 text-xs text-zinc-500 lg:table-cell">
                      {p.pageTags?.map((pt) => pt.tag.name).join(', ') || '—'}
                    </td>
                    <td className="hidden px-2 py-1 text-xs xl:table-cell">{author}</td>
                    <td className="px-2 py-1 text-zinc-500">
                      <span title="Views">{views}</span>
                      <span className="ml-1 text-[10px] text-zinc-300" title="Comments (placeholder)">💬—</span>
                      <span className="text-[10px] text-zinc-300" title="Shares (placeholder)">↗—</span>
                    </td>
                    <td className="px-2 py-1"><SeoScoreBadge score={score} showLabel={false} /></td>
                    <td className="px-2 py-1"><CmsStatusBadge status={p.status} scheduledAt={scheduled} /></td>
                    <td className="hidden px-2 py-1 text-xs text-zinc-500 lg:table-cell">{new Date(p.updatedAt).toLocaleDateString('vi-VN')}</td>
                    <td className="hidden px-2 py-1 text-xs text-zinc-500 md:table-cell">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('vi-VN') : '—'}</td>
                    <td className="px-2 py-1">
                      <div className="flex gap-0.5 opacity-100 transition group-hover:opacity-100 lg:opacity-0">
                        <Button size="sm" variant="secondary" onClick={() => onEdit(p)}>Sửa</Button>
                        <Button size="sm" variant="ghost" onClick={() => onPreview(p)}>Preview</Button>
                        {!inTrash && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setQuickEditPage(p)}>Quick Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => onDuplicate(p)}>Duplicate</Button>
                            <Button size="sm" variant="ghost" onClick={() => onTrash(p)}>Delete</Button>
                          </>
                        )}
                        {inTrash && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => onRestore(p)}>Restore</Button>
                            <Button size="sm" variant="ghost" onClick={() => onDeleteForever(p)}>Delete Forever</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {useVirtual && paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={12} /></tr>}
            </tbody>
          </table>
        </div>
        {paged.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">Không có bài viết phù hợp</p>}
      </div>

      {quickEditPage && (
        <QuickEditModal
          page={quickEditPage}
          categories={categories}
          onClose={() => setQuickEditPage(null)}
          onSave={(data) => {
            onQuickEdit(quickEditPage, data);
            setQuickEditPage(null);
          }}
        />
      )}
    </div>
  );
});
