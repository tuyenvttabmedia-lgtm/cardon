'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { slugifyVi } from '@/lib/slugify-vi';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsTag } from '@/types/api';

const empty = { name: '', slug: '', slugManual: false, metaTitle: '', metaDescription: '' };

export default function TagsPage() {
  const [items, setItems] = useState<CmsTag[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await cmsAdminApi.listTags());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const body = {
      name: form.name,
      slug: form.slug,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
    };
    try {
      setError(null);
      if (editingId) await cmsAdminApi.updateTag(editingId, body);
      else await cmsAdminApi.createTag(body);
      setForm(empty);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function remove(tag: CmsTag) {
    if ((tag.usageCount ?? 0) > 0) {
      setError(`Tag đang được sử dụng bởi ${tag.usageCount} bài viết.`);
      return;
    }
    if (!window.confirm(`Xóa tag "${tag.name}"?`)) return;
    try {
      setError(null);
      await cmsAdminApi.deleteTag(tag.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function toggleVisibility(tag: CmsTag) {
    try {
      setError(null);
      await cmsAdminApi.toggleTagVisibility(tag.id, !tag.isHidden);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Thẻ bài viết</h1>
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
              <Label>SEO Title</Label>
              <Input className="mt-1" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
            </div>
            <div>
              <Label>SEO Description</Label>
              <Input className="mt-1" value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />
            </div>
            <Button onClick={() => void save()}>{vi.app.save}</Button>
          </Card>
          <Card>
            <h2 className="font-semibold">Danh sách</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 p-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.name}
                      {t.isHidden && <span className="ml-2 text-xs text-amber-600">(Ẩn)</span>}
                    </p>
                    <p className="text-xs text-zinc-500">/{t.slug}</p>
                    {(t.usageCount ?? 0) > 0 && (
                      <p className="text-xs text-zinc-400">{t.usageCount} bài viết</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => void toggleVisibility(t)}>
                      {t.isHidden ? 'Hiện' : 'Ẩn'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(t.id);
                        setForm({
                          name: t.name,
                          slug: t.slug,
                          slugManual: true,
                          metaTitle: t.metaTitle ?? '',
                          metaDescription: t.metaDescription ?? '',
                        });
                      }}
                    >
                      {vi.app.edit}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(t)}>
                      {vi.app.delete}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </RequirePermission>
  );
}
