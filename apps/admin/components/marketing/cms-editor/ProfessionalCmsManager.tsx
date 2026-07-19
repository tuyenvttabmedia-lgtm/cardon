'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MediaLibraryPicker } from '@/components/marketing/MediaLibraryPicker';
import { RequirePermission } from '@/components/layout/AdminShell';
import { ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { slugifyVi } from '@/lib/slugify-vi';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsCategory, CmsPage, CmsTag } from '@/types/api';
import { GIOI_THIEU_LANDING_HTML } from '@/lib/cms-block-snippets';
import { emptyCmsForm, pageToEditorForm, type CmsEditorFormState, type SaveStatus } from '@/lib/cms-editor-utils';
import {
  defaultPageLayoutForSlug,
  hasLandingBlockMarkup,
  resolveEffectivePageLayout,
} from '@/lib/cms-page-layout';
import {
  deleteForever,
  getLastAutosaveAt,
  getScheduledPublish,
  listRevisions,
  moveToTrash,
  nextDuplicateSlug,
  restoreFromTrash,
  saveRevision,
  setLastAutosaveAt,
  setScheduledPublish,
} from '@/lib/cms-revisions';
import { ProfessionalEditor } from './ProfessionalEditor';
import { EditorMetaSidebar } from './EditorMetaSidebar';
import { EditorRightPanel } from './EditorRightPanel';
import { EditorHeader } from './EditorHeader';
import { ArticlePreviewModal } from './ArticlePreviewModal';
import { ArticleListTable } from './ArticleListTable';
import { StaticPagesListView } from './StaticPagesListView';

interface Props {
  pageType: 'BLOG_POST' | 'PAGE';
  title: string;
}

export function ProfessionalCmsManager({ pageType, title }: Props) {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [items, setItems] = useState<CmsPage[]>([]);
  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [tags, setTags] = useState<CmsTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CmsEditorFormState>(emptyCmsForm());
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveLabel, setAutosaveLabel] = useState<string | null>(null);
  const [revisions, setRevisions] = useState(listRevisions(editingId ?? 'new'));
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [editorPickResolver, setEditorPickResolver] = useState<((url: string | null) => void) | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [authorLabel, setAuthorLabel] = useState('CardOn');
  const formRef = useRef(form);
  formRef.current = form;
  const savingRef = useRef(false);
  savingRef.current = saving;

  const showTaxonomy = pageType === 'BLOG_POST';

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

  useEffect(() => {
    if (editingId) {
      setRevisions(listRevisions(editingId));
      setLastSavedAt(getLastAutosaveAt(editingId));
    } else {
      setLastSavedAt(null);
    }
  }, [editingId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of items) {
      const id = p.categoryId ?? p.categoryRel?.id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const linkTargets = useMemo(() => {
    const targets: Array<{ label: string; href: string; type: string }> = [];
    for (const p of items) {
      if (p.type === 'BLOG_POST') {
        const cat = p.categoryRel?.slug;
        targets.push({
          label: p.title,
          href: cat ? `/tin-tuc/${cat}/${p.slug}` : `/${p.slug}`,
          type: 'Bài viết',
        });
      } else {
        targets.push({ label: p.title, href: `/${p.slug}`, type: 'Trang tĩnh' });
      }
    }
    for (const c of categories) {
      targets.push({ label: c.name, href: `/tin-tuc/${c.slug}`, type: 'Danh mục' });
    }
    return targets;
  }, [items, categories]);

  const previewPath =
    pageType === 'BLOG_POST'
      ? form.categoryId
        ? `/tin-tuc/${categories.find((c) => c.id === form.categoryId)?.slug ?? 'danh-muc'}/${form.slug || '...'}`
        : `/${form.slug || '...'}`
      : `/${form.slug || '...'}`;

  function openEditor(page?: CmsPage) {
    if (page) {
      setEditingId(page.id);
      setForm(pageToEditorForm(page, getScheduledPublish(page.id) ?? ''));
      const author = (page as CmsPage & { author?: { email?: string } }).author?.email;
      if (author) setAuthorLabel(author);
      setLastSavedAt(getLastAutosaveAt(page.id));
    } else {
      setEditingId(null);
      setForm(emptyCmsForm());
      setAuthorLabel('CardOn');
      setLastSavedAt(null);
    }
    setSaveStatus('idle');
    setView('editor');
  }

  function openSpecialPage(slug: 'gioi-thieu' | 'lien-he') {
    const existing = items.find((p) => p.slug === slug);
    if (existing) {
      openEditor(existing);
      return;
    }

    const presets = {
      'gioi-thieu': {
        title: 'Giới thiệu',
        excerpt:
          'Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam.',
        content: GIOI_THIEU_LANDING_HTML,
        pageLayout: 'LANDING' as const,
      },
      'lien-he': {
        title: 'Liên hệ',
        excerpt: 'Chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.',
        content: '<p>Liên hệ CardOn.vn — chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.</p>',
        pageLayout: 'ARTICLE' as const,
      },
    }[slug];

    setEditingId(null);
    setForm({
      ...emptyCmsForm(),
      title: presets.title,
      slug,
      slugManual: true,
      excerpt: presets.excerpt,
      content: presets.content,
      pageLayout: presets.pageLayout,
      metaTitle: presets.title,
      metaDescription: presets.excerpt,
    });
    setAuthorLabel('CardOn');
    setLastSavedAt(null);
    setSaveStatus('idle');
    setView('editor');
  }

  function closeEditor() {
    setView('list');
    setEditingId(null);
    setForm(emptyCmsForm());
    setSaveStatus('idle');
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

  function pickFeaturedImage() {
    setFeaturedPickerOpen(true);
  }

  async function handleCreateTag(name: string) {
    try {
      const tag = await cmsAdminApi.createTag({ name, slug: slugifyVi(name) });
      setTags((prev) => [...prev, tag]);
      setForm((p) => ({ ...p, tagIds: [...p.tagIds, tag.id] }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  function buildBody(statusOverride?: 'DRAFT' | 'PUBLISHED') {
    const f = formRef.current;
    const pageLayout = resolveEffectivePageLayout(f.slug, f.pageLayout, {
      inNav: f.showInNav,
      content: f.content,
    });
    return {
      title: f.title,
      slug: f.slug,
      content: f.content,
      excerpt: f.excerpt || undefined,
      featuredImage: f.featuredImage || undefined,
      categoryId: f.categoryId || undefined,
      tagIds: f.tagIds,
      status: statusOverride ?? f.status,
      pageLayout,
      showInNav: f.showInNav,
      navSortOrder: f.navSortOrder || undefined,
      seo: {
        metaTitle: f.metaTitle || f.title,
        metaDescription: f.metaDescription || f.title,
        focusKeyword: f.focusKeyword || undefined,
        canonicalUrl: f.canonicalUrl || undefined,
        robots: f.robots || 'index,follow',
        ogTitle: f.ogTitle || f.metaTitle || f.title,
        ogDescription: f.ogDescription || f.metaDescription,
        ogImage: f.ogImage || f.featuredImage || undefined,
      },
    };
  }

  const persist = useCallback(async (statusOverride?: 'DRAFT' | 'PUBLISHED', silent = false) => {
    const body = buildBody(statusOverride);
    if (!body.title?.trim() || !body.slug?.trim()) {
      if (!silent) {
        setError('Vui lòng nhập tiêu đề và slug');
        setSaveStatus('error');
      }
      return null;
    }
    setSaving(true);
    setSaveStatus('saving');
    if (!silent) setError(null);
    try {
      let saved: CmsPage;
      if (editingId) {
        saved = await cmsAdminApi.updatePage(editingId, body);
        saveRevision(editingId, formRef.current, silent ? 'Autosave' : undefined);
        setRevisions(listRevisions(editingId));
      } else {
        saved = await cmsAdminApi.createPage({ ...body, type: pageType });
        setEditingId(saved.id);
        saveRevision(saved.id, formRef.current);
        setRevisions(listRevisions(saved.id));
      }
      if (statusOverride === 'PUBLISHED') {
        saved = await cmsAdminApi.publishPage(saved.id);
      }
      setForm((prev) => ({
        ...prev,
        status:
          saved.status === 'PUBLISHED'
            ? 'PUBLISHED'
            : statusOverride === 'DRAFT'
              ? 'DRAFT'
              : prev.status,
      }));
      const now = new Date().toISOString();
      setLastSavedAt(now);
      setLastAutosaveAt(saved.id, now);
      if (formRef.current.scheduledPublishAt) {
        setScheduledPublish(saved.id, formRef.current.scheduledPublishAt);
      }
      await load();
      setSaveStatus('saved');
      if (silent) {
        setAutosaveLabel(`Auto Saved ${new Date().toLocaleTimeString('vi-VN')}`);
      }
      return saved;
    } catch (err) {
      setSaveStatus('error');
      if (!silent) setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
      return null;
    } finally {
      setSaving(false);
    }
  }, [editingId, pageType]);

  useEffect(() => {
    if (view !== 'editor') return;
    const timer = setInterval(() => {
      const f = formRef.current;
      if (!f.title.trim() || savingRef.current) return;
      const status = f.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
      void persist(status, true);
    }, 30_000);
    return () => clearInterval(timer);
  }, [view, persist]);

  const contentChangeRef = useRef<(html: string) => void>(() => undefined);
  contentChangeRef.current = (html: string) => setForm((p) => ({ ...p, content: html }));
  const stableContentChange = useCallback((html: string) => contentChangeRef.current(html), []);

  async function handleBulk(action: string, ids: string[], extra?: { categoryId?: string; tagIds?: string[] }) {
    try {
      for (const id of ids) {
        if (action === 'publish') await cmsAdminApi.publishPage(id);
        else if (action === 'draft') await cmsAdminApi.updatePage(id, { status: 'DRAFT' });
        else if (action === 'archive') await cmsAdminApi.updatePage(id, { status: 'ARCHIVED' });
        else if (action === 'trash') moveToTrash(id);
        else if (action === 'category' && extra?.categoryId) await cmsAdminApi.updatePage(id, { categoryId: extra.categoryId });
        else if (action === 'tags' && extra?.tagIds) await cmsAdminApi.updatePage(id, { tagIds: extra.tagIds });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function duplicate(page: CmsPage) {
    try {
      const slugs = items.map((p) => p.slug);
      const newSlug = nextDuplicateSlug(page.slug, slugs);
      await cmsAdminApi.createPage({
        type: pageType,
        title: page.title,
        slug: newSlug,
        content: page.content,
        excerpt: page.excerpt ?? undefined,
        featuredImage: page.featuredImage ?? undefined,
        categoryId: page.categoryId ?? undefined,
        tagIds: page.pageTags?.map((pt) => pt.tag.id) ?? [],
        status: 'DRAFT',
        pageLayout: page.pageLayout ?? defaultPageLayoutForSlug(page.slug),
        seo: page.seo
          ? {
              metaTitle: page.seo.metaTitle,
              metaDescription: page.seo.metaDescription,
              focusKeyword: page.seo.focusKeyword ?? undefined,
              canonicalUrl: page.seo.canonicalUrl ?? undefined,
              ogTitle: page.seo.ogTitle ?? undefined,
              ogDescription: page.seo.ogDescription ?? undefined,
              ogImage: page.seo.ogImage ?? undefined,
            }
          : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function handleQuickEdit(page: CmsPage, data: { title: string; status: CmsPage['status']; categoryId: string }) {
    try {
      await cmsAdminApi.updatePage(page.id, {
        title: data.title,
        status: data.status,
        categoryId: data.categoryId || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  function handleTrash(page: CmsPage) {
    moveToTrash(page.id);
    void load();
  }

  function handleRestore(page: CmsPage) {
    restoreFromTrash(page.id);
    void load();
  }

  function handleDeleteForever(page: CmsPage) {
    deleteForever(page.id);
    void cmsAdminApi.updatePage(page.id, { status: 'ARCHIVED' }).catch(() => undefined);
    void load();
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className={view === 'editor' ? 'fixed inset-0 z-40 flex flex-col bg-white' : 'space-y-6'}>
        {view === 'list' ? (
          <>
            <h1 className="text-2xl font-bold">{title}</h1>
            <MarketingNav />
            {error && <ErrorMessage message={error} />}
            {pageType === 'BLOG_POST' ? (
              <ArticleListTable
                items={items}
                categories={categories}
                tags={tags}
                onCreate={() => openEditor()}
                onEdit={openEditor}
                onPreview={(p) => { setForm(pageToEditorForm(p, getScheduledPublish(p.id) ?? '')); setPreviewOpen(true); }}
                onDuplicate={(p) => void duplicate(p)}
                onTrash={handleTrash}
                onRestore={handleRestore}
                onDeleteForever={handleDeleteForever}
                onBulk={handleBulk}
                onQuickEdit={(p, data) => void handleQuickEdit(p, data)}
              />
            ) : (
              <StaticPagesListView
                items={items}
                onCreate={() => openEditor()}
                onEdit={openEditor}
                onOpenSpecial={openSpecialPage}
                onReload={load}
                onError={setError}
              />
            )}
          </>
        ) : (
          <>
            <EditorHeader
              title={form.title}
              onTitleChange={updateTitle}
              onBack={closeEditor}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              onPreview={() => setPreviewOpen(true)}
              onSaveDraft={() => void persist('DRAFT')}
              onPublish={() => void persist('PUBLISHED')}
              saving={saving}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <EditorMetaSidebar
                form={form}
                setForm={setForm}
                categories={categories}
                tags={tags}
                showTaxonomy={showTaxonomy}
                showPageNav={pageType === 'PAGE'}
                categoryCounts={categoryCounts}
                onPickFeaturedImage={pickFeaturedImage}
                onCreateTag={handleCreateTag}
              />

              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {error && <div className="px-4 pt-2"><ErrorMessage message={error} /></div>}
                <ProfessionalEditor
                  value={form.content}
                  onChange={stableContentChange}
                  onPickImage={pickImageUrl}
                  linkTargets={linkTargets}
                  pageLayout={form.pageLayout}
                />
              </main>

              <EditorRightPanel
                form={form}
                setForm={setForm}
                previewPath={previewPath}
                authorLabel={authorLabel}
                revisions={revisions}
                onRestoreRevision={(r) => setForm(r.snapshot)}
                autosaveLabel={autosaveLabel}
                onSave={() => void persist('DRAFT')}
                onPublish={() => void persist('PUBLISHED')}
                saving={saving}
              />
            </div>
          </>
        )}

        <MediaLibraryPicker
          open={imagePickerOpen}
          onClose={() => { editorPickResolver?.(null); setEditorPickResolver(null); setImagePickerOpen(false); }}
          onSelect={(url) => { editorPickResolver?.(url); setEditorPickResolver(null); setImagePickerOpen(false); }}
          defaultFolder="articles"
          title="Chọn ảnh"
        />
        <MediaLibraryPicker
          open={featuredPickerOpen}
          onClose={() => setFeaturedPickerOpen(false)}
          onSelect={(url) => { setForm((p) => ({ ...p, featuredImage: url })); setFeaturedPickerOpen(false); }}
          defaultFolder="articles"
          title="Ảnh đại diện"
        />
        <ArticlePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={form.title}
          content={form.content}
          featuredImage={form.featuredImage}
          excerpt={form.excerpt}
          pageLayout={resolveEffectivePageLayout(form.slug, form.pageLayout, {
            inNav: form.showInNav,
            content: form.content,
          })}
          slug={form.slug}
        />
      </div>
    </RequirePermission>
  );
}
