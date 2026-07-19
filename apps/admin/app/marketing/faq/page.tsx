'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { vi } from '@/lib/i18n/vi';
import { faqAdminApi, ApiClientError } from '@/services/api-client';
import type { FaqCategory, FaqItem } from '@/types/api';

const POSITIONS = [
  { value: '', label: 'Tất cả vị trí' },
  { value: 'homepage', label: 'Trang chủ' },
  { value: 'topup', label: 'Nạp cước' },
  { value: 'data', label: 'Nạp data' },
  { value: 'contact', label: 'Liên hệ' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'ACTIVE', label: 'Đang hiển thị' },
  { value: 'INACTIVE', label: 'Ẩn' },
];

export default function FaqListPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [tab, setTab] = useState<'faqs' | 'categories'>('faqs');

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await faqAdminApi.listCategories());
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await faqAdminApi.list({
        q: q.trim() || undefined,
        categoryId: categoryId || undefined,
        position: position && position !== 'homepage' ? position : undefined,
        status: status || undefined,
        featured: featuredOnly || position === 'homepage' || undefined,
        page,
        limit: 20,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [categoryId, featuredOnly, page, position, q, status]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, position, status, featuredOnly, q]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkStatus(next: 'ACTIVE' | 'INACTIVE') {
    if (selected.size === 0) return;
    try {
      await faqAdminApi.bulkUpdate({ ids: [...selected], patch: { status: next } });
      toast.success('Đã cập nhật hàng loạt');
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function bulkFeatured(featured: boolean) {
    if (selected.size === 0) return;
    try {
      await faqAdminApi.bulkUpdate({ ids: [...selected], patch: { featured } });
      toast.success(featured ? 'Đã bật nổi bật' : 'Đã tắt nổi bật');
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Xóa ${selected.size} FAQ đã chọn?`)) return;
    try {
      await Promise.all([...selected].map((id) => faqAdminApi.delete(id)));
      toast.success('Đã xóa');
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function migrateLegacy() {
    setMigrating(true);
    try {
      const res = await faqAdminApi.migrateLegacy();
      toast.success(`Migrate xong: ${res.migrated} FAQ (${res.featured} nổi bật)`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setMigrating(false);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Quản lý FAQ</h1>
            <p className="text-sm text-zinc-500">Trang chủ hiển thị tối đa 10 FAQ nổi bật (⭐)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void migrateLegacy()} disabled={migrating}>
              {migrating ? 'Đang migrate...' : 'Migrate JSON cũ'}
            </Button>
            <Button onClick={() => router.push('/marketing/faq/new')}>+ Thêm FAQ</Button>
          </div>
        </div>

        <MarketingNav />

        <div className="flex gap-2">
          <Button variant={tab === 'faqs' ? 'primary' : 'secondary'} onClick={() => setTab('faqs')}>
            Danh sách FAQ ({total})
          </Button>
          <Button
            variant={tab === 'categories' ? 'primary' : 'secondary'}
            onClick={() => setTab('categories')}
          >
            Danh mục
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        {tab === 'categories' ? (
          <FaqCategoriesPanel categories={categories} onChanged={loadCategories} />
        ) : (
          <>
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <Input placeholder="Tìm câu hỏi..." value={q} onChange={(e) => setQ(e.target.value)} />
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Tất cả danh mục</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {POSITIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={featuredOnly}
                    onChange={(e) => setFeaturedOnly(e.target.checked)}
                  />
                  Chỉ nổi bật TC
                </label>
              </div>
            </Card>

            {selected.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void bulkStatus('ACTIVE')}>
                  Xuất bản
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void bulkStatus('INACTIVE')}>
                  Ẩn
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void bulkFeatured(true)}>
                  ⭐ Bật nổi bật
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void bulkFeatured(false)}>
                  Tắt nổi bật
                </Button>
                <Button size="sm" variant="danger" onClick={() => void deleteSelected()}>
                  Xóa
                </Button>
              </div>
            )}

            {loading ? (
              <p className="text-zinc-500">{vi.app.loading}</p>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="min-w-full text-sm">
                  <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={items.length > 0 && selected.size === items.length}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                      </th>
                      <th className="px-3 py-2">Câu hỏi</th>
                      <th className="px-3 py-2">Danh mục</th>
                      <th className="px-3 py-2">Vị trí</th>
                      <th className="px-3 py-2">⭐</th>
                      <th className="px-3 py-2">TT</th>
                      <th className="px-3 py-2" title="Tự động khi tạo; chỉnh khi sửa">#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-zinc-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleOne(item.id)}
                          />
                        </td>
                        <td className="max-w-md px-3 py-2">
                          <Link
                            href={`/marketing/faq/${item.id}`}
                            className="font-medium text-admin-600 hover:underline"
                          >
                            {item.question}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{item.category.name}</td>
                        <td className="px-3 py-2">
                          {item.positions.length > 0 ? item.positions.join(', ') : '—'}
                        </td>
                        <td className="px-3 py-2">{item.featured ? '⭐' : '—'}</td>
                        <td className="px-3 py-2">
                          {item.status === 'ACTIVE' ? '✓' : item.status === 'DRAFT' ? 'Nháp' : 'Ẩn'}
                        </td>
                        <td className="px-3 py-2">{item.sortOrder}</td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                          Chưa có FAQ.{' '}
                          <button
                            type="button"
                            className="text-admin-600 underline"
                            onClick={() => router.push('/marketing/faq/new')}
                          >
                            Thêm mới
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Trước
                </Button>
                <span className="text-sm text-zinc-600">
                  Trang {page}/{totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </RequirePermission>
  );
}

function FaqCategoriesPanel({
  categories,
  onChanged,
}: {
  categories: FaqCategory[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');

  async function addCategory() {
    if (!name.trim()) return;
    try {
      await faqAdminApi.createCategory({ name: name.trim() });
      setName('');
      toast.success('Đã thêm danh mục');
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Lỗi');
    }
  }

  async function removeCategory(id: string, faqCount: number) {
    if (faqCount > 0) {
      toast.error('Không thể xóa danh mục còn FAQ');
      return;
    }
    if (!window.confirm('Xóa danh mục này?')) return;
    try {
      await faqAdminApi.deleteCategory(id);
      toast.success('Đã xóa');
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Lỗi');
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex gap-2">
        <Input placeholder="Tên danh mục mới" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => void addCategory()}>Thêm</Button>
      </div>
      <ul className="divide-y">
        {categories.map((cat) => (
          <li key={cat.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              <strong>{cat.name}</strong>{' '}
              <span className="text-zinc-400">/{cat.slug}</span> — {cat.faqCount} FAQ
            </span>
            <Button size="sm" variant="danger" onClick={() => void removeCategory(cat.id, cat.faqCount)}>
              Xóa
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
