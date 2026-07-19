import type { CmsEditorFormState } from './cms-editor-utils';

export interface CmsRevision {
  id: string;
  pageId: string;
  savedAt: string;
  label: string;
  snapshot: CmsEditorFormState;
}

const STORAGE_KEY = 'cardon-cms-revisions';
const TRASH_KEY = 'cardon-cms-trash';
const DELETED_FOREVER_KEY = 'cardon-cms-deleted-forever';
const FILTERS_KEY = 'cardon-cms-article-filters';
const MAX_REVISIONS = 20;

function readAll(): Record<string, CmsRevision[]> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, CmsRevision[]>;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, CmsRevision[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readIdSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function listRevisions(pageId: string): CmsRevision[] {
  return readAll()[pageId] ?? [];
}

export function saveRevision(pageId: string, snapshot: CmsEditorFormState, label?: string): CmsRevision {
  const all = readAll();
  const entry: CmsRevision = {
    id: crypto.randomUUID(),
    pageId,
    savedAt: new Date().toISOString(),
    label: label ?? `Bản lưu ${new Date().toLocaleString('vi-VN')}`,
    snapshot: { ...snapshot },
  };
  const list = [entry, ...(all[pageId] ?? [])].slice(0, MAX_REVISIONS);
  all[pageId] = list;
  writeAll(all);
  return entry;
}

export function getScheduledPublish(pageId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`cardon-cms-schedule-${pageId}`);
}

export function setScheduledPublish(pageId: string, iso: string | null) {
  if (!iso) localStorage.removeItem(`cardon-cms-schedule-${pageId}`);
  else localStorage.setItem(`cardon-cms-schedule-${pageId}`, iso);
}

export function getViewCount(pageId: string): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(`cardon-cms-views-${pageId}`) ?? '0', 10) || 0;
}

export function isInTrash(pageId: string): boolean {
  return readIdSet(TRASH_KEY).has(pageId);
}

export function isDeletedForever(pageId: string): boolean {
  return readIdSet(DELETED_FOREVER_KEY).has(pageId);
}

export function moveToTrash(pageId: string) {
  const s = readIdSet(TRASH_KEY);
  s.add(pageId);
  writeIdSet(TRASH_KEY, s);
}

export function restoreFromTrash(pageId: string) {
  const s = readIdSet(TRASH_KEY);
  s.delete(pageId);
  writeIdSet(TRASH_KEY, s);
}

export function deleteForever(pageId: string) {
  restoreFromTrash(pageId);
  const s = readIdSet(DELETED_FOREVER_KEY);
  s.add(pageId);
  writeIdSet(DELETED_FOREVER_KEY, s);
}

export function listTrashIds(): Set<string> {
  return readIdSet(TRASH_KEY);
}

export function listDeletedForeverIds(): Set<string> {
  return readIdSet(DELETED_FOREVER_KEY);
}

export function getLastAutosaveAt(pageId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`cardon-cms-autosave-${pageId}`);
}

export function setLastAutosaveAt(pageId: string, iso: string) {
  localStorage.setItem(`cardon-cms-autosave-${pageId}`, iso);
}

export function loadArticleFilters<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveArticleFilters<T>(filters: T) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
}

export function formatSavedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 5) return 'vừa xong';
  if (sec < 60) return `${sec} giây trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  return `${Math.floor(min / 60)} giờ trước`;
}

export function nextDuplicateSlug(baseSlug: string, existing: string[]): string {
  const set = new Set(existing);
  const first = `${baseSlug}-copy`;
  if (!set.has(first)) return first;
  let n = 2;
  while (set.has(`${baseSlug}-copy-${n}`)) n++;
  return `${baseSlug}-copy-${n}`;
}
