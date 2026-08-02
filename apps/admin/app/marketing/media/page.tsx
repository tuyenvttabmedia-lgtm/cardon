'use client';

import { useEffect, useRef, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { mediaFullUrl } from '@/components/marketing/MediaLibraryPicker';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsMedia } from '@/types/api';

const FOLDERS = [
  { value: '', label: 'Tất cả thư mục' },
  { value: 'general', label: 'Chung' },
  { value: 'logo', label: 'Logo' },
  { value: 'favicon', label: 'Favicon' },
  { value: 'banners', label: 'Banner' },
  { value: 'products', label: 'Sản phẩm' },
  { value: 'articles', label: 'Bài viết' },
];

function MediaCard({
  item,
  copied,
  onCopy,
  onRemove,
  onUpdated,
  onError,
}: {
  item: CmsMedia;
  copied: boolean;
  onCopy: () => void;
  onRemove: () => void;
  onUpdated: (media: CmsMedia) => void;
  onError: (message: string) => void;
}) {
  const [alt, setAlt] = useState(item.alt ?? '');
  const [title, setTitle] = useState(item.title ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAlt(item.alt ?? '');
    setTitle(item.title ?? '');
  }, [item.id, item.alt, item.title]);

  async function saveMeta() {
    setSaving(true);
    try {
      const updated = await cmsAdminApi.updateMedia(item.id, { alt, title });
      onUpdated(updated);
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-2">
      <img
        src={mediaFullUrl(item.thumbnailUrl ?? item.url)}
        alt={item.alt ?? item.filename}
        className="h-32 w-full rounded object-cover"
      />
      <p className="truncate text-sm font-medium">{item.title || item.originalName}</p>
      <p className="text-xs text-slate-500">
        {item.folder} · {item.filename}
      </p>
      <p className="text-xs text-slate-500">
        {(item.size / 1024).toFixed(1)} KB · {item.mimeType}
        {item.width && item.height ? ` · ${item.width}×${item.height}px` : ''}
      </p>
      <div>
        <Label>Alt Image</Label>
        <Input
          className="mt-1"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Mô tả ảnh (SEO)"
        />
      </div>
      <div>
        <Label>Tiêu đề</Label>
        <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString('vi-VN')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void saveMeta()} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu alt'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCopy}>
          {copied ? 'Đã copy' : 'Copy URL'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          {vi.app.delete}
        </Button>
      </div>
    </Card>
  );
}

export default function MediaPage() {
  const [items, setItems] = useState<CmsMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState('general');
  const [search, setSearch] = useState('');
  const [mimeFilter, setMimeFilter] = useState('');
  const [alt, setAlt] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setItems(
        await cmsAdminApi.listMedia({
          folder: folder || undefined,
          search: search.trim() || undefined,
          mimeType: mimeFilter || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  useEffect(() => {
    void load();
  }, [folder, search, mimeFilter]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await cmsAdminApi.uploadMedia(file, { alt, title, folder: folder || 'general' });
      setAlt('');
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Xóa media này?')) return;
    try {
      await cmsAdminApi.deleteMedia(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  function copyUrl(item: CmsMedia) {
    const full = mediaFullUrl(item.url);
    void navigator.clipboard.writeText(full);
    setCopied(item.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="admin-page-title">Thư viện ảnh</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}
        <Card className="space-y-3 max-w-3xl">
          <h2 className="font-semibold">Tải ảnh lên</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Thư mục</Label>
              <Select className="mt-1" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {FOLDERS.filter((f) => f.value).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>File ảnh (jpg, png, webp, svg — tối đa 5MB)</Label>
              <input
                ref={fileRef}
                className="mt-1 block w-full text-sm"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Alt Image</Label>
              <Input
                className="mt-1"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Mô tả ảnh cho SEO / accessibility"
              />
            </div>
            <div>
              <Label>Tiêu đề</Label>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <Button disabled={uploading} onClick={() => void upload()}>
            {uploading ? 'Đang tải…' : 'Tải lên'}
          </Button>
        </Card>
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Lọc thư mục</Label>
              <Select className="mt-1" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {FOLDERS.map((f) => (
                  <option key={f.value || 'all'} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tìm kiếm</Label>
              <Input
                className="mt-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tên file, alt…"
              />
            </div>
            <div>
              <Label>Loại file</Label>
              <Select className="mt-1" value={mimeFilter} onChange={(e) => setMimeFilter(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
                <option value="image/svg">SVG</option>
              </Select>
            </div>
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <MediaCard
              key={m.id}
              item={m}
              copied={copied === m.id}
              onCopy={() => copyUrl(m)}
              onRemove={() => void remove(m.id)}
              onUpdated={(updated) =>
                setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
              }
              onError={setError}
            />
          ))}
        </div>
      </div>
    </RequirePermission>
  );
}
