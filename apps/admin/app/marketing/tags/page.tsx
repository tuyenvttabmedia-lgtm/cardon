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
  const [locale, setLocale] = useState<'vi' | 'en'>('vi');
  const [english, setEnglish] = useState({ name: '', metaTitle: '', metaDescription: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  async function saveEnglish() {
    if (!editingId) {
      setError('Lưu tag tiếng Việt trước khi thêm bản tiếng Anh.');
      return;
    }
    if (!english.name.trim()) {
      setError('Bản tiếng Anh cần tên tag.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cmsAdminApi.saveTagTranslation(editingId, 'en', {
        name: english.name.trim(),
        metaTitle: english.metaTitle.trim() || undefined,
        metaDescription: english.metaDescription.trim() || undefined,
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
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
    };
    try {
      setError(null);
      if (editingId) await cmsAdminApi.updateTag(editingId, body);
      else await cmsAdminApi.createTag(body);
      setForm(empty);
      setEnglish({ name: '', metaTitle: '', metaDescription: '' });
      setLocale('vi');
      setEditingId(null);
      setNotice('Đã lưu tiếng Việt.');
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
        <h1 className="admin-page-title">Thẻ bài viết</h1>
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
            {locale === 'en' ? (
              <>
                {english.name ? null : (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Chưa có bản dịch tiếng Anh.</p>
                )}
                <div>
                  <Label>Tên tiếng Anh</Label>
                  <Input className="mt-1" value={english.name} onChange={(e) => setEnglish((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>SEO Title</Label>
                  <Input className="mt-1" value={english.metaTitle} onChange={(e) => setEnglish((p) => ({ ...p, metaTitle: e.target.value }))} />
                </div>
                <div>
                  <Label>SEO Description</Label>
                  <Input className="mt-1" value={english.metaDescription} onChange={(e) => setEnglish((p) => ({ ...p, metaDescription: e.target.value }))} />
                </div>
                <p className="text-xs text-slate-500">Slug dùng chung. Tag không có cột mô tả riêng và không có trạng thái nháp.</p>
                <Button disabled={saving} onClick={() => void saveEnglish()}>{saving ? vi.app.loading : 'Lưu tiếng Anh'}</Button>
              </>
            ) : (
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
              <Label>SEO Title</Label>
              <Input className="mt-1" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
            </div>
            <div>
              <Label>SEO Description</Label>
              <Input className="mt-1" value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />
            </div>
            <Button onClick={() => void save()}>{vi.app.save}</Button>
            </>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Danh sách</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 p-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.name}
                      {t.isHidden && <span className="ml-2 text-xs text-amber-600">(Ẩn)</span>}
                    </p>
                    <p className="text-xs text-slate-500">/{t.slug}</p>
                    {(t.usageCount ?? 0) > 0 && (
                      <p className="text-xs text-slate-400">{t.usageCount} bài viết</p>
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
                        setLocale('vi');
                        const en = t.translations?.find((item) => item.locale === 'en');
                        setEnglish({
                          name: en?.name ?? '',
                          metaTitle: en?.metaTitle ?? '',
                          metaDescription: en?.metaDescription ?? '',
                        });
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
