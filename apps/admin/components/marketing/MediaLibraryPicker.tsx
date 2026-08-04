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

/**
 * Fast pick UX:
 * - Click a thumbnail → insert immediately (old 1-click behavior)
 * - Upload → insert immediately with optional upload-time alt
 * - Alt for article images is edited on the photo inside TipTap after insert
 *   (no scroll-to-bottom alt panel in this dialog)
 */
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
      setUploadAlt('');
      setError(null);
      void load();
    }
  }, [open, folder, search]);

  function insertMedia(media: Pick<CmsMedia, 'url' | 'alt'>) {
    onSelect({ url: media.url, alt: media.alt ?? null });
    onClose();
  }

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
      // Insert right away — no need to find the new card in a long grid.
      insertMedia(media);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} size="xl">
      <div className="flex max-h-[min(78vh,720px)] flex-col">
        <div className="shrink-0 space-y-3 border-b border-slate-100 pb-4">
          {error && <ErrorMessage message={error} />}
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Nhấn vào ảnh để chèn ngay. Alt Image chỉnh sau khi ảnh đã vào bài (nhấn vào ảnh trong
            editor). Khi tải lên có thể nhập alt sẵn ở ô bên dưới.
          </p>
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
              <Label>Alt Image (tuỳ chọn khi tải lên)</Label>
              <Input
                className="mt-1"
                value={uploadAlt}
                onChange={(e) => setUploadAlt(e.target.value)}
                placeholder="Có thể bỏ trống — chỉnh sau trong bài viết"
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
                {uploading ? 'Đang tải…' : 'Tải lên & chèn'}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                title="Nhấn để chèn ảnh vào bài"
                className="rounded-lg border border-slate-200 p-2 text-left transition hover:border-admin-500 hover:ring-2 hover:ring-admin-100"
                onClick={() => insertMedia(m)}
              >
                <img
                  src={mediaFullUrl(m.thumbnailUrl ?? m.url)}
                  alt={m.alt ?? m.filename}
                  className="h-28 w-full rounded object-cover"
                />
                <p className="mt-2 truncate text-sm font-medium">{m.originalName}</p>
                <p className="truncate text-xs text-slate-500">
                  {m.alt ? `Alt: ${m.alt}` : 'Chưa có alt — chỉnh sau trong bài'}
                </p>
                <p className="text-xs text-slate-500">
                  {m.folder} · {(m.size / 1024).toFixed(1)} KB
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
                </p>
              </button>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-slate-500">Chưa có ảnh trong thư mục này.</p>
            )}
          </div>
        </div>
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
