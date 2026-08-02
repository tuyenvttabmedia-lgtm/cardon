'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorMessage } from '@/components/ui/Display';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsMedia } from '@/types/api';
import { getApiBaseUrl } from '@/lib/utils';

const FOLDERS = [
  { value: 'general', label: 'Chung' },
  { value: 'logo', label: 'Logo' },
  { value: 'favicon', label: 'Favicon' },
  { value: 'banners', label: 'Banner' },
  { value: 'products', label: 'Sản phẩm' },
  { value: 'articles', label: 'Bài viết' },
];

export function mediaFullUrl(url: string) {
  if (url.startsWith('http')) return url;
  const base = getApiBaseUrl().replace(/\/api\/v1$/, '');
  return `${base}${url}`;
}

/** Result when picking an image from the media library (includes alt for SEO). */
export type MediaPickResult = {
  url: string;
  alt?: string | null;
};

interface MediaLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: MediaPickResult) => void;
  defaultFolder?: string;
  title?: string;
}

export function MediaLibraryPicker({
  open,
  onClose,
  onSelect,
  defaultFolder = 'general',
  title = 'Chọn ảnh từ thư viện',
}: MediaLibraryPickerProps) {
  const [items, setItems] = useState<CmsMedia[]>([]);
  const [folder, setFolder] = useState(defaultFolder);
  const [search, setSearch] = useState('');
  const [uploadAlt, setUploadAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAlt, setSelectedAlt] = useState('');
  const [savingAlt, setSavingAlt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setItems(
        await cmsAdminApi.listMedia({
          folder: folder || undefined,
          search: search.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không tải được thư viện');
    }
  }

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSelectedAlt('');
      setUploadAlt('');
      void load();
    }
  }, [open, folder, search]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const media = await cmsAdminApi.uploadMedia(file, {
        folder,
        alt: uploadAlt.trim() || undefined,
      });
      if (fileRef.current) fileRef.current.value = '';
      setUploadAlt('');
      await load();
      setSelectedId(media.id);
      setSelectedAlt(media.alt ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  }

  function selectItem(m: CmsMedia) {
    setSelectedId(m.id);
    setSelectedAlt(m.alt ?? '');
  }

  async function saveSelectedAlt() {
    if (!selectedId) return;
    setSavingAlt(true);
    setError(null);
    try {
      const updated = await cmsAdminApi.updateMedia(selectedId, { alt: selectedAlt });
      setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không lưu được alt');
    } finally {
      setSavingAlt(false);
    }
  }

  async function confirmSelect() {
    const item = items.find((m) => m.id === selectedId);
    if (!item) return;
    const nextAlt = selectedAlt.trim();
    if (nextAlt !== (item.alt ?? '')) {
      try {
        await cmsAdminApi.updateMedia(item.id, { alt: nextAlt });
      } catch {
        // Still insert into editor even if library metadata save fails.
      }
    }
    onSelect({ url: item.url, alt: nextAlt || item.alt || null });
    onClose();
  }

  const selected = items.find((m) => m.id === selectedId) ?? null;

  return (
    <Dialog open={open} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col">
        <div className="space-y-3 border-b border-slate-100 pb-4">
          {error && <ErrorMessage message={error} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Thư mục</Label>
              <Select className="mt-1" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {FOLDERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Tìm kiếm</Label>
              <Input
                className="mt-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tên file, alt, tiêu đề…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label>Alt Image (khi tải lên)</Label>
              <Input
                className="mt-1"
                value={uploadAlt}
                onChange={(e) => setUploadAlt(e.target.value)}
                placeholder="Mô tả ảnh cho SEO / accessibility"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="text-sm"
              />
              <Button size="sm" disabled={uploading} onClick={() => void upload()}>
                {uploading ? 'Đang tải…' : 'Tải lên'}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`rounded-lg border p-2 text-left transition ${
                selectedId === m.id
                  ? 'border-admin-500 ring-2 ring-admin-200'
                  : 'border-slate-200 hover:border-admin-500'
              }`}
              onClick={() => selectItem(m)}
            >
              <img
                src={mediaFullUrl(m.thumbnailUrl ?? m.url)}
                alt={m.alt ?? m.filename}
                className="h-28 w-full rounded object-cover"
              />
              <p className="mt-2 truncate text-sm font-medium">{m.originalName}</p>
              <p className="truncate text-xs text-slate-500">
                {m.alt ? `Alt: ${m.alt}` : 'Chưa có alt'}
              </p>
              <p className="text-xs text-slate-500">
                {m.folder} · {(m.size / 1024).toFixed(1)} KB
                {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
              </p>
            </button>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-500">Chưa có ảnh trong thư mục này.</p>}
        </div>

        {selected && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <Label>Alt Image — Thêm alt cho ảnh</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[220px] flex-1"
                value={selectedAlt}
                onChange={(e) => setSelectedAlt(e.target.value)}
                placeholder="Mô tả nội dung ảnh"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={savingAlt}
                onClick={() => void saveSelectedAlt()}
              >
                {savingAlt ? 'Đang lưu…' : 'Lưu alt'}
              </Button>
              <Button size="sm" onClick={() => void confirmSelect()}>
                Chèn ảnh
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

interface MediaPickButtonProps {
  label?: string;
  folder?: string;
  onSelect: (url: string) => void;
}

export function MediaPickButton({ label = 'Chọn từ thư viện', folder, onSelect }: MediaPickButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <MediaLibraryPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(media) => onSelect(media.url)}
        defaultFolder={folder}
      />
    </>
  );
}
