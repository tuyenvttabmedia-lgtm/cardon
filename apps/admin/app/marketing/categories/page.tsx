'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Textarea } from '@/components/ui/Form';
import { slugifyVi } from '@/lib/slugify-vi';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsCategory } from '@/types/api';

const empty = {
  name: '',
  slug: '',
  slugManual: false,
  description: '',
  intro: '',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogImageUrl: '',
  sortOrder: 0,
};

export default function CategoriesPage() {
  const [items, setItems] = useState<CmsCategory[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [locale, setLocale] = useState<'vi' | 'en'>('vi');
  const [english, setEnglish] = useState({ name: '', description: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setItems(await cmsAdminApi.listCategories());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveEnglish() {
    if (!editingId) {
      setError('Lưu danh mục tiếng Việt trước khi thêm bản tiếng Anh.');
      return;
    }
    if (!english.name.trim()) {
      setError('Bản tiếng Anh cần tên danh mục.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cmsAdminApi.saveCategoryTranslation(editingId, 'en', {
        name: english.name.trim(),
        description: english.description.trim() || undefined,
      });
      setNotice('Đã lưu bản tiếng Anh.');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      intro: form.intro || undefined,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      canonicalUrl: form.canonicalUrl || undefined,
      ogImageUrl: form.ogImageUrl || undefined,
      sortOrder: form.sortOrder,
    };
    try {
      if (editingId) await cmsAdminApi.updateCategory(editingId, body);
      else await cmsAdminApi.createCategory(body);
      setForm(empty);
      setEnglish({ name: '', description: '' });
      setLocale('vi');
      setEditingId(null);
      setNotice('Đã lưu tiếng Việt.');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Xóa danh mục này?')) return;
    try {
      await cmsAdminApi.deleteCategory(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="admin-page-title">Danh mục bài viết</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{editingId ? vi.app.edit : vi.app.create}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant={locale === 'vi' ? 'primary' : 'secondary'} onClick={() => setLocale('vi')}>Tiếng Việt</Button>
                <Button size="sm" variant={locale === 'en' ? 'primary' : 'secondary'} onClick={() => setLocale('en')}>English</Button>
              </div>
            </div>
            {locale === 'en' && !english.name ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Chưa có bản dịch tiếng Anh. Tên và mô tả tiếng Việt không bị sao chép.</p>
            ) : null}
            {locale === 'en' ? (
              <>
                <div>
                  <Label>Tên tiếng Anh</Label>
                  <Input className="mt-1" value={english.name} onChange={(e) => setEnglish((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Mô tả tiếng Anh</Label>
                  <Input className="mt-1" value={english.description} onChange={(e) => setEnglish((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <p className="text-xs text-slate-500">Slug dùng chung. Danh mục không có trạng thái nháp riêng; lưu là bản public đọc được.</p>
                <Button disabled={saving} onClick={() => void saveEnglish()}>{saving ? vi.app.loading : 'Lưu tiếng Anh'}</Button>
              </>
            ) : null}
            {locale === 'vi' ? (
            <>
            <div>
              <Label>Tên</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    name: e.target.value,
                    slug: p.slugManual ? p.slug : slugifyVi(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                className="mt-1"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value, slugManual: true }))}
              />
            </div>
            <div>
              <Label>Mô tả ngắn</Label>
              <Input className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Intro (hiển thị trang danh mục)</Label>
              <Textarea className="mt-1" rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
            </div>
            <div>
              <Label>SEO Title</Label>
              <Input className="mt-1" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
            </div>
            <div>
              <Label>Meta Description</Label>
              <Input className="mt-1" value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />
            </div>
            <div>
              <Label>Canonical URL</Label>
              <Input className="mt-1" value={form.canonicalUrl} onChange={(e) => setForm({ ...form, canonicalUrl: e.target.value })} placeholder="https://cardon.vn/tin-tuc/the-game" />
            </div>
            <div>
              <Label>OG Image URL</Label>
              <Input className="mt-1" value={form.ogImageUrl} onChange={(e) => setForm({ ...form, ogImageUrl: e.target.value })} />
            </div>
            <Button onClick={() => void save()}>{vi.app.save}</Button>
            </>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-semibold">Danh sách</h2>
            {loading ? (
              <p className="mt-3 text-slate-500">{vi.app.loading}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded border border-slate-100 p-2">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-500">/tin-tuc/{c.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(c.id);
                          setLocale('vi');
                          const en = c.translations?.find((item) => item.locale === 'en');
                          setEnglish({ name: en?.name ?? '', description: en?.description ?? '' });
                          setForm({
                            name: c.name,
                            slug: c.slug,
                            slugManual: true,
                            description: c.description ?? '',
                            intro: c.intro ?? '',
                            metaTitle: c.metaTitle ?? '',
                            metaDescription: c.metaDescription ?? '',
                            canonicalUrl: c.canonicalUrl ?? '',
                            ogImageUrl: c.ogImageUrl ?? '',
                            sortOrder: c.sortOrder,
                          });
                        }}
                      >
                        {vi.app.edit}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(c.id)}>
                        {vi.app.delete}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </RequirePermission>
  );
}
