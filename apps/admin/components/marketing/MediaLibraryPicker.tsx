'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Label, Select } from '@/components/ui/Form';
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

interface MediaLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
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
    if (open) void load();
  }, [open, folder, search]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await cmsAdminApi.uploadMedia(file, { folder });
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <div className="space-y-3 border-b border-zinc-100 p-4">
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
              <Input className="mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên file, alt, tiêu đề…" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="text-sm" />
            <Button size="sm" disabled={uploading} onClick={() => void upload()}>
              {uploading ? 'Đang tải…' : 'Tải lên'}
            </Button>
          </div>
        </div>
        <div className="grid flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded-lg border border-zinc-200 p-2 text-left hover:border-admin-500"
              onClick={() => {
                onSelect(m.url);
                onClose();
              }}
            >
              <img
                src={mediaFullUrl(m.thumbnailUrl ?? m.url)}
                alt={m.alt ?? m.filename}
                className="h-28 w-full rounded object-cover"
              />
              <p className="mt-2 truncate text-sm font-medium">{m.originalName}</p>
              <p className="text-xs text-zinc-500">
                {m.folder} · {(m.size / 1024).toFixed(1)} KB
                {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
              </p>
            </button>
          ))}
          {items.length === 0 && <p className="text-sm text-zinc-500">Chưa có ảnh trong thư mục này.</p>}
        </div>
      </div>
    </div>
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
        onSelect={onSelect}
        defaultFolder={folder}
      />
    </>
  );
}
