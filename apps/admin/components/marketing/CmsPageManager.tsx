'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { ArticleEditor, GooglePreview } from '@/components/marketing/ArticleEditor';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { MediaLibraryPicker } from '@/components/marketing/MediaLibraryPicker';
import { slugifyVi } from '@/lib/slugify-vi';
import { buildPublicPageUrl } from '@/lib/public-url';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsCategory, CmsPage, CmsTag } from '@/types/api';

interface Props {
  pageType: 'BLOG_POST' | 'PAGE';
  title: string;
}

const emptyForm = {
  title: '',
  slug: '',
  slugManual: false,
  content: '',
  excerpt: '',
  featuredImage: '',
  categoryId: '',
  tagIds: [] as string[],
  status: 'DRAFT' as 'DRAFT' | 'PUBLISHED',
  focusKeyword: '',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
};

export function CmsPageManager({ pageType, title }: Props) {
  const [items, setItems] = useState<CmsPage[]>([]);
  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [tags, setTags] = useState<CmsTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [editorPickResolver, setEditorPickResolver] = useState<
    ((url: string | null) => void) | null
  >(null);

  async function load() {
    try {
      setItems(await cmsAdminApi.listPages({ type: pageType }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  useEffect(() => {
    void load();
    if (pageType === 'BLOG_POST') {
      void cmsAdminApi.listCategories().then(setCategories).catch(() => undefined);
      void cmsAdminApi.listTags().then(setTags).catch(() => undefined);
    }
  }, [pageType]);

  function startEdit(p: CmsPage) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      slug: p.slug,
      slugManual: true,
      content: p.content,
      excerpt: p.excerpt ?? '',
      featuredImage: p.featuredImage ?? '',
      categoryId: p.categoryId ?? p.categoryRel?.id ?? '',
      tagIds: p.pageTags?.map((pt) => pt.tag.id) ?? [],
      status: p.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      focusKeyword: p.seo?.focusKeyword ?? '',
      metaTitle: p.seo?.metaTitle ?? p.title,
      metaDescription: p.seo?.metaDescription ?? '',
      canonicalUrl: p.seo?.canonicalUrl ?? '',
      ogTitle: p.seo?.ogTitle ?? '',
      ogDescription: p.seo?.ogDescription ?? '',
      ogImage: p.seo?.ogImage ?? '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateTitle(titleValue: string) {
    setForm((prev) => ({
      ...prev,
      title: titleValue,
      slug: prev.slugManual ? prev.slug : slugifyVi(titleValue),
      metaTitle: prev.metaTitle || titleValue,
    }));
  }

  async function pickImageUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      setEditorPickResolver(() => resolve);
      setImagePickerOpen(true);
    });
  }

  function handleEditorImagePick(url: string) {
    editorPickResolver?.(url);
    setEditorPickResolver(null);
    setImagePickerOpen(false);
  }

  function closeEditorImagePicker() {
    editorPickResolver?.(null);
    setEditorPickResolver(null);
    setImagePickerOpen(false);
  }

  async function save() {
    const body: Record<string, unknown> = {
      title: form.title,
      slug: form.slug,
      content: form.content,
      excerpt: form.excerpt || undefined,
      featuredImage: form.featuredImage || undefined,
      categoryId: form.categoryId || undefined,
      tagIds: form.tagIds,
      status: form.status,
      seo: {
        metaTitle: form.metaTitle || form.title,
        metaDescription: form.metaDescription || form.title,
        focusKeyword: form.focusKeyword || undefined,
        canonicalUrl: form.canonicalUrl || undefined,
        ogTitle: form.ogTitle || form.metaTitle || form.title,
        ogDescription: form.ogDescription || form.metaDescription,
        ogImage: form.ogImage || form.featuredImage || undefined,
      },
    };
    if (!editingId) {
      body.type = pageType;
    }
    try {
      if (editingId) {
        await cmsAdminApi.updatePage(editingId, body);
      } else {
        await cmsAdminApi.createPage(body);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function publish(id: string) {
    try {
      await cmsAdminApi.publishPage(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  function toggleTag(tagId: string) {
    setForm((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((id) => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  }

  const previewUrl = buildPublicPageUrl(
    pageType === 'BLOG_POST'
      ? form.categoryId
        ? `/tin-tuc/${categories.find((c) => c.id === form.categoryId)?.slug ?? 'danh-muc'}/${form.slug || '...'}`
        : `/${form.slug || '...'}`
      : `/${form.slug || '...'}`,
  );

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h2 className="font-semibold">{editingId ? vi.app.edit : vi.app.create}</h2>
            <div className="mt-4 space-y-3">
              <div>
                <Label>{vi.cms.fieldTitle}</Label>
                <Input className="mt-1" value={form.title} onChange={(e) => updateTitle(e.target.value)} />
              </div>
              <div>
                <Label>{vi.products.slug}</Label>
                <Input
                  className="mt-1"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value, slugManual: true })}
                />
              </div>
              <div>
                <Label>{vi.cms.content}</Label>
                <div className="mt-1">
                  <ArticleEditor
                    value={form.content}
                    onChange={(html) => setForm({ ...form, content: html })}
                    onPickImage={pickImageUrl}
                  />
                </div>
              </div>
              <div>
                <Label>Trích dẫn (excerpt)</Label>
                <Input className="mt-1" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
              </div>
              <MediaImageField
                label={vi.cms.thumbnail}
                folder="articles"
                value={form.featuredImage}
                onChange={(url) => setForm({ ...form, featuredImage: url })}
              />
              {pageType === 'BLOG_POST' && (
                <>
                  <div>
                    <Label>{vi.cms.category}</Label>
                    <Select
                      className="mt-1"
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    >
                      <option value="">— Chọn danh mục —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>{vi.cms.tags}</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            form.tagIds.includes(t.id)
                              ? 'bg-admin-600 text-white'
                              : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 space-y-3">
                <p className="text-sm font-semibold">SEO</p>
                <div>
                  <Label>Focus keyword</Label>
                  <Input className="mt-1" value={form.focusKeyword} onChange={(e) => setForm({ ...form, focusKeyword: e.target.value })} />
                </div>
                <div>
                  <Label>{vi.cms.fieldSeoTitle}</Label>
                  <Input className="mt-1" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
                </div>
                <div>
                  <Label>{vi.cms.seoDescription}</Label>
                  <Input className="mt-1" value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />
                </div>
                <div>
                  <Label>Canonical URL</Label>
                  <Input className="mt-1" value={form.canonicalUrl} onChange={(e) => setForm({ ...form, canonicalUrl: e.target.value })} />
                </div>
                <div>
                  <Label>OG Title</Label>
                  <Input className="mt-1" value={form.ogTitle} onChange={(e) => setForm({ ...form, ogTitle: e.target.value })} />
                </div>
                <div>
                  <Label>OG Description</Label>
                  <Input className="mt-1" value={form.ogDescription} onChange={(e) => setForm({ ...form, ogDescription: e.target.value })} />
                </div>
                <MediaImageField
                  label={vi.cms.ogImage}
                  folder="articles"
                  value={form.ogImage}
                  onChange={(url) => setForm({ ...form, ogImage: url })}
                />
                <GooglePreview
                  title={form.metaTitle || form.title}
                  description={form.metaDescription}
                  url={form.canonicalUrl || previewUrl}
                />
              </div>
              <div>
                <Label>Trạng thái</Label>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'DRAFT' | 'PUBLISHED' })}>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="PUBLISHED">Xuất bản</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void save()}>{vi.app.save}</Button>
                {editingId && (
                  <Button variant="ghost" onClick={resetForm}>{vi.app.cancel}</Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold">Danh sách</h2>
            <ul className="mt-3 max-h-[48rem] space-y-2 overflow-y-auto text-sm">
              {items.map((p) => (
                <li key={p.id} className="rounded-lg border border-zinc-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge tone={statusTone(p.status)} status={p.status} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">/{p.slug}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>{vi.app.edit}</Button>
                    {p.status !== 'PUBLISHED' && (
                      <Button size="sm" onClick={() => void publish(p.id)}>{vi.app.publish}</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <MediaLibraryPicker
          open={imagePickerOpen}
          onClose={closeEditorImagePicker}
          onSelect={handleEditorImagePick}
          defaultFolder="articles"
          title="Chọn ảnh cho bài viết"
        />
      </div>
    </RequirePermission>
  );
}
