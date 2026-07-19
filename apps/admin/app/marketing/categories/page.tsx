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
      setEditingId(null);
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
        <h1 className="text-2xl font-bold">Danh mục bài viết</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-semibold">{editingId ? vi.app.edit : vi.app.create}</h2>
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
          </Card>
          <Card>
            <h2 className="font-semibold">Danh sách</h2>
            {loading ? (
              <p className="mt-3 text-zinc-500">{vi.app.loading}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded border border-zinc-100 p-2">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-zinc-500">/tin-tuc/{c.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(c.id);
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
