export interface CmsEditorFormState {
  title: string;
  slug: string;
  slugManual: boolean;
  content: string;
  excerpt: string;
  featuredImage: string;
  categoryId: string;
  tagIds: string[];
  status: 'DRAFT' | 'PUBLISHED';
  pageLayout: 'ARTICLE' | 'LANDING' | 'POLICY';
  scheduledPublishAt: string;
  showInNav: boolean;
  navSortOrder: number;
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

import { defaultPageLayoutForSlug } from '@/lib/cms-page-layout';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type SeoRating = 'Excellent' | 'Good' | 'Need Improve' | 'Poor';

export interface ContentStatistics {
  words: number;
  characters: number;
  paragraphs: number;
  images: number;
  tables: number;
  links: number;
  videos: number;
  readingTimeMinutes: number;
}

export interface MediaCounts {
  images: number;
  videos: number;
  tables: number;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function countWords(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function countCharacters(html: string): number {
  return stripHtml(html).length;
}

export function countParagraphs(html: string): number {
  const matches = html.match(/<p[\s>]/gi);
  return matches?.length ?? 0;
}

export function countImages(html: string): number {
  return (html.match(/<img[\s>]/gi) ?? []).length;
}

export function countTables(html: string): number {
  return (html.match(/<table[\s>]/gi) ?? []).length;
}

export function countLinks(html: string): number {
  return (html.match(/<a[\s>]/gi) ?? []).length;
}

export function countVideos(html: string): number {
  const yt = (html.match(/data-youtube-video|youtube\.com|youtu\.be/gi) ?? []).length;
  const iframe = (html.match(/<iframe[\s>]/gi) ?? []).length;
  return Math.max(yt, iframe);
}

export function estimateReadingTimeMinutes(html: string): number {
  const words = countWords(html);
  return Math.max(1, Math.ceil(words / 200));
}

export function analyzeContent(html: string): ContentStatistics {
  return {
    words: countWords(html),
    characters: countCharacters(html),
    paragraphs: countParagraphs(html),
    images: countImages(html),
    tables: countTables(html),
    links: countLinks(html),
    videos: countVideos(html),
    readingTimeMinutes: estimateReadingTimeMinutes(html),
  };
}

export function analyzeMediaCounts(html: string): MediaCounts {
  return {
    images: countImages(html),
    videos: countVideos(html),
    tables: countTables(html),
  };
}

export function hasH1(html: string): boolean {
  return /<h1[\s>]/i.test(html);
}

export function countInternalLinks(html: string): number {
  return (html.match(/href="(\/|https?:\/\/[^"]*cardon)/gi) ?? []).length;
}

export function countExternalLinks(html: string): number {
  return (html.match(/href="https?:\/\/(?!.*cardon)/gi) ?? []).length;
}

export function imagesMissingAlt(html: string): number {
  const imgs = html.match(/<img[^>]*>/gi) ?? [];
  return imgs.filter((tag) => !/\balt="[^"]+"/i.test(tag)).length;
}

export interface SeoCheckItem {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
}

export function buildSeoChecklist(form: CmsEditorFormState): SeoCheckItem[] {
  const words = countWords(form.content);
  return [
    { id: 'h1', label: 'H1', ok: hasH1(form.content) || Boolean(form.title.trim()), hint: 'Thêm H1 hoặc tiêu đề' },
    { id: 'meta', label: 'Meta', ok: form.metaDescription.trim().length >= 50, hint: 'Meta ≥ 50 ký tự' },
    { id: 'keyword', label: 'Focus Keyword', ok: Boolean(form.focusKeyword.trim()), hint: 'Nhập focus keyword' },
    { id: 'alt', label: 'Alt Image', ok: imagesMissingAlt(form.content) === 0 && Boolean(form.featuredImage), hint: 'Thêm alt cho ảnh' },
    { id: 'internal', label: 'Internal Links', ok: countInternalLinks(form.content) >= 1, hint: 'Thêm liên kết nội bộ' },
    { id: 'external', label: 'External Links', ok: countExternalLinks(form.content) >= 0, hint: 'Tùy chọn' },
    { id: 'words', label: 'Word Count', ok: words >= 300, hint: `Hiện ${words} từ (≥ 300)` },
    { id: 'slug', label: 'Slug', ok: Boolean(form.slug.trim()), hint: 'Nhập slug' },
    { id: 'canonical', label: 'Canonical', ok: Boolean(form.canonicalUrl.trim()) || Boolean(form.slug.trim()), hint: 'Canonical hoặc slug' },
  ];
}

export function computeSeoScore(checklist: SeoCheckItem[]): number {
  const required = checklist.filter((c) => c.id !== 'external');
  const passed = required.filter((c) => c.ok).length;
  return Math.round((passed / required.length) * 100);
}

export function seoRating(score: number): SeoRating {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Need Improve';
  return 'Poor';
}

export function seoRatingStyles(rating: SeoRating): string {
  switch (rating) {
    case 'Excellent':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Good':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'Need Improve':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Poor':
      return 'bg-rose-100 text-rose-800 border-rose-200';
  }
}

export function pageToEditorForm(
  page: {
    title: string;
    slug: string;
    content: string;
    excerpt?: string | null;
    featuredImage?: string | null;
    categoryId?: string | null;
    categoryRel?: { id: string } | null;
    pageTags?: Array<{ tag: { id: string } }>;
    status: string;
    showInNav?: boolean;
    navSortOrder?: number;
    pageLayout?: 'ARTICLE' | 'LANDING' | 'POLICY';
    seo?: {
      focusKeyword?: string | null;
      metaTitle?: string | null;
      metaDescription?: string | null;
      canonicalUrl?: string | null;
      robots?: string | null;
      ogTitle?: string | null;
      ogDescription?: string | null;
      ogImage?: string | null;
    } | null;
  },
  scheduledPublishAt = '',
): CmsEditorFormState {
  return {
    title: page.title,
    slug: page.slug,
    slugManual: true,
    content: page.content,
    excerpt: page.excerpt ?? '',
    featuredImage: page.featuredImage ?? '',
    categoryId: page.categoryId ?? page.categoryRel?.id ?? '',
    tagIds: page.pageTags?.map((pt) => pt.tag.id) ?? [],
    status: page.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    pageLayout: page.pageLayout ?? defaultPageLayoutForSlug(page.slug),
    scheduledPublishAt,
    showInNav: page.showInNav ?? false,
    navSortOrder: page.navSortOrder ?? 0,
    focusKeyword: page.seo?.focusKeyword ?? '',
    metaTitle: page.seo?.metaTitle ?? page.title,
    metaDescription: page.seo?.metaDescription ?? '',
    canonicalUrl: page.seo?.canonicalUrl ?? '',
    robots: page.seo?.robots ?? 'index,follow',
    ogTitle: page.seo?.ogTitle ?? '',
    ogDescription: page.seo?.ogDescription ?? '',
    ogImage: page.seo?.ogImage ?? '',
  };
}

export const emptyCmsForm = (): CmsEditorFormState => ({
  title: '',
  slug: '',
  slugManual: false,
  content: '',
  excerpt: '',
  featuredImage: '',
  categoryId: '',
  tagIds: [],
  status: 'DRAFT',
  pageLayout: 'ARTICLE',
  scheduledPublishAt: '',
  showInNav: false,
  navSortOrder: 0,
  focusKeyword: '',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  robots: 'index,follow',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
});

export type SortField = 'title' | 'views' | 'seo' | 'published' | 'updated';
export type QuickFilter = 'all' | 'published' | 'draft' | 'scheduled' | 'archived' | 'trash';

export function sortPages<T extends { id: string; title: string; updatedAt: string; publishedAt?: string | null }>(
  items: T[],
  field: SortField,
  scores: Record<string, number>,
  views: Record<string, number>,
): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    switch (field) {
      case 'title':
        return a.title.localeCompare(b.title, 'vi');
      case 'views':
        return (views[b.id] ?? 0) - (views[a.id] ?? 0);
      case 'seo':
        return (scores[b.id] ?? 0) - (scores[a.id] ?? 0);
      case 'published':
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      case 'updated':
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
  return copy;
}
