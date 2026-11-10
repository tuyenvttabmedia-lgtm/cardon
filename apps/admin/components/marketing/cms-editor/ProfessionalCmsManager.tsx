'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MediaLibraryPicker } from '@/components/marketing/MediaLibraryPicker';
import { RequirePermission } from '@/components/layout/AdminShell';
import { ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Textarea } from '@/components/ui/Form';
import { slugifyVi } from '@/lib/slugify-vi';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsCategory, CmsPage, CmsTag } from '@/types/api';
import {
  GIOI_THIEU_LANDING_HTML,
  LIEN_HE_INTRO_HTML,
  LIEN_HE_INTRO_HTML_EN,
} from '@/lib/cms-block-snippets';
import {
  emptyCmsForm,
  fromDatetimeLocalValue,
  pageToEditorForm,
  toDatetimeLocalValue,
  type CmsEditorFormState,
  type SaveStatus,
} from '@/lib/cms-editor-utils';
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
import {
  englishDraftFromPage,
  englishPagePayload,
  emptyEnglishPageDraft,
  translationStatusLabel,
  type CmsEditorLocale,
  type EnglishPageDraft,
} from '@/lib/cms-translation';
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
  const searchParams = useSearchParams();
  const deepLinkPageId = searchParams.get('pageId');
  const deepLinkHandled = useRef<string | null>(null);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [items, setItems] = useState<CmsPage[]>([]);
  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [tags, setTags] = useState<CmsTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CmsEditorFormState>(emptyCmsForm());
  const [editorLocale, setEditorLocale] = useState<CmsEditorLocale>('vi');
  const [english, setEnglish] = useState<EnglishPageDraft>(emptyEnglishPageDraft());
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveLabel, setAutosaveLabel] = useState<string | null>(null);
  const [revisions, setRevisions] = useState(listRevisions(editingId ?? 'new'));
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [editorPickResolver, setEditorPickResolver] = useState<
    ((media: { url: string; alt?: string | null } | null) => void) | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [authorLabel, setAuthorLabel] = useState('CardOn');
  const formRef = useRef(form);
  const editorLocaleRef = useRef(editorLocale);
  const englishRef = useRef(english);
  editorLocaleRef.current = editorLocale;
  englishRef.current = english;
  formRef.current = form;
  const savingRef = useRef(false);
  savingRef.current = saving;
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

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
    if (!deepLinkPageId || deepLinkHandled.current === deepLinkPageId) return;
    const page = items.find((p) => p.id === deepLinkPageId);
    if (!page) return;
    deepLinkHandled.current = deepLinkPageId;
    openEditor(page);
  }, [deepLinkPageId, items]);

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
    setEditorLocale('vi');
    setEnglish(englishDraftFromPage(page));
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
    setSaveError(null);
    setView('editor');
  }

  function openSpecialPage(slug: 'gioi-thieu' | 'lien-he') {
    const existing = items.find((p) => p.slug === slug);
    if (existing) {
      openEditor(existing);
      return;
    }

    const presets: Record<
      'gioi-thieu' | 'lien-he',
      {
        title: string;
        excerpt: string;
        content: string;
        pageLayout: 'ARTICLE' | 'LANDING';
        english?: {
          title: string;
          excerpt: string;
          content: string;
          metaTitle: string;
          metaDescription: string;
        };
      }
    > = {
      'gioi-thieu': {
        title: 'Giới thiệu',
        excerpt:
          'Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam.',
        content: GIOI_THIEU_LANDING_HTML,
        pageLayout: 'LANDING',
      },
      'lien-he': {
        title: 'Liên hệ',
        excerpt: 'Chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.',
        content: LIEN_HE_INTRO_HTML,
        pageLayout: 'ARTICLE',
        english: {
          title: 'Contact CardOn',
          excerpt: 'We are here to help.',
          content: LIEN_HE_INTRO_HTML_EN,
          metaTitle: 'Contact CardOn',
          metaDescription: 'Contact CardOn support for cards, top-up, payments and order lookup.',
        },
      },
    };
    const preset = presets[slug];

    setEditingId(null);
    setEditorLocale('vi');
    setEnglish(
      preset.english
        ? {
            ...emptyEnglishPageDraft(),
            ...preset.english,
            status: 'DRAFT',
          }
        : emptyEnglishPageDraft(),
    );
    setForm({
      ...emptyCmsForm(),
      title: preset.title,
      slug,
      slugManual: true,
      excerpt: preset.excerpt,
      content: preset.content,
      pageLayout: preset.pageLayout,
      metaTitle: preset.title,
      metaDescription: preset.excerpt,
    });
    setAuthorLabel('CardOn');
    setLastSavedAt(null);
    setSaveStatus('idle');
    setSaveError(null);
    setView('editor');
  }

  function closeEditor() {
    setEditorLocale('vi');
    setEnglish(emptyEnglishPageDraft());
    setView('list');
    setEditingId(null);
    setForm(emptyCmsForm());
    setSaveStatus('idle');
    setSaveError(null);
  }

  function clearSaveErrorIfNeeded() {
    if (saveStatusRef.current === 'error') {
      setSaveStatus('idle');
      setSaveError(null);
    }
  }

  function updateTitle(titleValue: string) {
    clearSaveErrorIfNeeded();
    setForm((prev) => ({
      ...prev,
      title: titleValue,
      slug: prev.slugManual ? prev.slug : slugifyVi(titleValue),
      metaTitle: prev.metaTitle || titleValue,
    }));
  }

  async function pickImageUrl(): Promise<{ url: string; alt?: string | null } | null> {
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
    const metaTitle = (f.metaTitle || f.title).slice(0, 128);
    const metaDescription = (f.metaDescription || f.excerpt || f.title).slice(0, 256);
    const scheduleIso = fromDatetimeLocalValue(f.scheduledPublishAt);
    const scheduleFuture = !!(scheduleIso && new Date(scheduleIso).getTime() > Date.now());
    let status = statusOverride ?? f.status;
    // Explicit publish-now clears schedule. Future schedule keeps draft until cron runs.
    let scheduledPublishAt: string | null = scheduleIso;
    if (statusOverride === 'PUBLISHED') {
      status = 'PUBLISHED';
      scheduledPublishAt = null;
    } else if (scheduleFuture) {
      status = 'DRAFT';
    }
    return {
      title: f.title.slice(0, 255),
      slug: f.slug.slice(0, 255),
      content: f.content,
      excerpt: f.excerpt ? f.excerpt.slice(0, 512) : undefined,
      featuredImage: f.featuredImage || undefined,
      categoryId: f.categoryId || undefined,
      tagIds: f.tagIds,
      status,
      pageLayout,
      showInNav: f.showInNav,
      navSortOrder: f.navSortOrder || undefined,
      scheduledPublishAt,
      seo: {
        metaTitle,
        metaDescription,
        focusKeyword: f.focusKeyword ? f.focusKeyword.slice(0, 128) : undefined,
        canonicalUrl: f.canonicalUrl ? f.canonicalUrl.slice(0, 512) : undefined,
        robots: f.robots || 'index,follow',
        ogTitle: (f.ogTitle || metaTitle).slice(0, 128),
        ogDescription: (f.ogDescription || metaDescription).slice(0, 256),
        ogImage: (f.ogImage || f.featuredImage || undefined)?.slice(0, 512),
      },
    };
  }

  const persist = useCallback(async (statusOverride?: 'DRAFT' | 'PUBLISHED', silent = false) => {
    if (savingRef.current) return null;
    const body = buildBody(statusOverride);
    if (!body.title?.trim() || !body.slug?.trim()) {
      if (!silent) {
        setError('Vui lòng nhập tiêu đề và slug');
        setSaveStatus('error');
        setSaveError('Vui lòng nhập tiêu đề và slug');
      }
      return null;
    }
    setSaving(true);
    setSaveStatus('saving');
    setSaveError(null);
    if (!silent) setError(null);
    try {
      let saved: CmsPage;
      if (editingId) {
        saved = await cmsAdminApi.updatePage(editingId, body);
      } else {
        saved = await cmsAdminApi.createPage({ ...body, type: pageType });
        setEditingId(saved.id);
      }
      if (statusOverride === 'PUBLISHED' && saved.status !== 'PUBLISHED') {
        saved = await cmsAdminApi.publishPage(saved.id);
      }

      // Mark API success before localStorage side-effects (quota must not flip UI to "Có lỗi").
      const now = new Date().toISOString();
      setForm((prev) => ({
        ...prev,
        status:
          saved.status === 'PUBLISHED'
            ? 'PUBLISHED'
            : statusOverride === 'DRAFT'
              ? 'DRAFT'
              : prev.status,
      }));
      setLastSavedAt(now);
      setLastAutosaveAt(saved.id, now);
      setSaveStatus('saved');
      setSaveError(null);
      if (silent) {
        setAutosaveLabel(`Auto Saved ${new Date().toLocaleTimeString('vi-VN')}`);
      }

      try {
        saveRevision(saved.id, formRef.current, silent ? 'Autosave' : undefined);
        setRevisions(listRevisions(saved.id));
        // Keep local schedule mirror in sync with server (legacy list badges).
        setScheduledPublish(saved.id, saved.scheduledPublishAt ?? null);
        setForm((prev) => ({
          ...prev,
          scheduledPublishAt: toDatetimeLocalValue(saved.scheduledPublishAt),
          status: saved.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        }));
      } catch {
        // local history is best-effort
      }

      // Refresh list only on explicit save — silent autosave should stay lightweight.
      if (!silent) {
        await load();
      }
      return saved;
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : vi.app.requestFailed;
      setSaveStatus('error');
      setSaveError(message);
      if (!silent) setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [editingId, pageType]);

  useEffect(() => {
    if (view !== 'editor') return;
    const timer = setInterval(() => {
      if (editorLocaleRef.current === 'en') return;
      const f = formRef.current;
      if (!f.title.trim() || savingRef.current) return;
      const status = f.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
      void persist(status, true);
    }, 30_000);
    return () => clearInterval(timer);
  }, [view, persist]);

  const contentChangeRef = useRef<(html: string) => void>(() => undefined);
  contentChangeRef.current = (html: string) => {
    clearSaveErrorIfNeeded();
    if (editorLocaleRef.current === 'en') {
      setEnglish((prev) => ({ ...prev, content: html }));
      return;
    }
    setForm((p) => ({ ...p, content: html }));
  };
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

  async function persistEnglish(status: 'DRAFT' | 'PUBLISHED') {
    if (!editingId) {
      setSaveStatus('error');
      setSaveError('Lưu tiếng Việt trước khi thêm bản tiếng Anh.');
      return;
    }
    const draft = englishRef.current;
    if (!draft.title.trim() || !draft.content.trim()) {
      setSaveStatus('error');
      setSaveError('Bản tiếng Anh cần tiêu đề và nội dung.');
      return;
    }
    setSaving(true);
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const saved = await cmsAdminApi.savePageTranslation(editingId, 'en', englishPagePayload(draft, status));
      setEnglish(englishDraftFromPage(saved));
      setSaveStatus('saved');
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : vi.app.requestFailed;
      setSaveStatus('error');
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className={view === 'editor' ? 'fixed inset-0 z-40 flex flex-col bg-white' : 'space-y-6'}>
        {view === 'list' ? (
          <>
            <h1 className="admin-page-title">{title}</h1>
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
              title={editorLocale === 'en' ? english.title : form.title}
              onTitleChange={
                editorLocale === 'en'
                  ? (value) => setEnglish((prev) => ({ ...prev, title: value }))
                  : updateTitle
              }
              onBack={closeEditor}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              saveError={saveError}
              onPreview={() => setPreviewOpen(true)}
              onSaveDraft={() => void (editorLocale === 'en' ? persistEnglish('DRAFT') : persist('DRAFT'))}
              onPublish={() => void (editorLocale === 'en' ? persistEnglish('PUBLISHED') : persist('PUBLISHED'))}
              saving={saving}
            />
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${editorLocale === 'vi' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                onClick={() => setEditorLocale('vi')}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${editorLocale === 'en' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                onClick={() => setEditorLocale('en')}
              >
                English
              </button>
              <span className="text-xs text-slate-500">
                VI: {translationStatusLabel(form.status)}
                {' · '}
                EN: {translationStatusLabel(english.status)}
              </span>
              {editorLocale === 'en' && english.status == null ? (
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Chưa có bản dịch tiếng Anh. Nội dung tiếng Việt không bị sao chép sang đây.
                </span>
              ) : null}
            </div>

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
                locked={editorLocale === 'en'}
              />

              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {error && <div className="px-4 pt-2"><ErrorMessage message={error} /></div>}
                {editorLocale === 'en' ? (
                  <div className="grid shrink-0 gap-3 border-b border-slate-200 p-4 md:grid-cols-2">
                    <div>
                      <Label>Excerpt</Label>
                      <Textarea className="mt-1" rows={2} value={english.excerpt} onChange={(e) => setEnglish((prev) => ({ ...prev, excerpt: e.target.value }))} />
                    </div>
                    <div>
                      <Label>SEO Title</Label>
                      <Input className="mt-1" value={english.metaTitle} onChange={(e) => setEnglish((prev) => ({ ...prev, metaTitle: e.target.value }))} />
                    </div>
                    <div>
                      <Label>SEO Description</Label>
                      <Input className="mt-1" value={english.metaDescription} onChange={(e) => setEnglish((prev) => ({ ...prev, metaDescription: e.target.value }))} />
                    </div>
                    <div>
                      <Label>SEO Keywords</Label>
                      <Input className="mt-1" value={english.metaKeywords} onChange={(e) => setEnglish((prev) => ({ ...prev, metaKeywords: e.target.value }))} />
                    </div>
                    <div>
                      <Label>OG Title</Label>
                      <Input className="mt-1" value={english.ogTitle} onChange={(e) => setEnglish((prev) => ({ ...prev, ogTitle: e.target.value }))} />
                    </div>
                    <div>
                      <Label>OG Description</Label>
                      <Input className="mt-1" value={english.ogDescription} onChange={(e) => setEnglish((prev) => ({ ...prev, ogDescription: e.target.value }))} />
                    </div>
                  </div>
                ) : null}
                <ProfessionalEditor
                  value={editorLocale === 'en' ? english.content : form.content}
                  onChange={stableContentChange}
                  onPickImage={pickImageUrl}
                  linkTargets={linkTargets}
                  pageLayout={form.pageLayout}
                  templateKey={
                    form.slug === 'gioi-thieu'
                      ? 'gioi-thieu-full'
                      : form.slug === 'lien-he'
                        ? 'lien-he-intro'
                        : undefined
                  }
                />
              </main>

              {editorLocale === 'vi' ? <EditorRightPanel
                form={form}
                setForm={setForm}
                previewPath={previewPath}
                authorLabel={authorLabel}
                revisions={revisions}
                onRestoreRevision={(r) => setForm(r.snapshot)}
                autosaveLabel={autosaveLabel}
                onSave={() => void persist('DRAFT')}
                onPublish={() => void persist('PUBLISHED')}
                onSchedule={() => void persist('DRAFT')}
                saving={saving}
              /> : null}
            </div>
          </>
        )}

        <MediaLibraryPicker
          open={imagePickerOpen}
          onClose={() => { editorPickResolver?.(null); setEditorPickResolver(null); setImagePickerOpen(false); }}
          onSelect={(media) => { editorPickResolver?.(media); setEditorPickResolver(null); setImagePickerOpen(false); }}
          defaultFolder="articles"
          title="Chọn ảnh"
        />
        <MediaLibraryPicker
          open={featuredPickerOpen}
          onClose={() => setFeaturedPickerOpen(false)}
          onSelect={(media) => { setForm((p) => ({ ...p, featuredImage: media.url })); setFeaturedPickerOpen(false); }}
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
