'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { vi } from '@/lib/i18n/vi';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsBanner } from '@/types/api';

const POSITIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'HOME_HERO', label: 'HOME_HERO', hint: 'Banner đầu trang chủ (hero)' },
  { value: 'HOME_PROMOTION', label: 'HOME_PROMOTION', hint: 'Khuyến mãi trên trang chủ' },
  { value: 'SIDEBAR', label: 'SIDEBAR', hint: 'Cột phụ trang chủ / danh mục' },
  { value: 'MOBILE_HOME', label: 'MOBILE_HOME', hint: 'Banner mobile trang chủ' },
  { value: 'HOME_SIDEBAR', label: 'HOME_SIDEBAR (legacy)', hint: 'Sidebar trang chủ' },
  { value: 'CATEGORY_TOP', label: 'CATEGORY_TOP', hint: 'Đầu trang danh mục' },
];

const emptyForm = {
  title: '',
  imageUrl: '',
  linkUrl: '',
  position: 'HOME_HERO',
  sortOrder: '0',
  status: 'ACTIVE',
};

export default function BannersPage() {
  const [banners, setBanners] = useState<CmsBanner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try {
      setBanners(await cmsAdminApi.listBanners());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(b: CmsBanner) {
    setEditingId(b.id);
    setForm({
      title: b.title,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl ?? '',
      position: b.position,
      sortOrder: String(b.sortOrder ?? 0),
      status: b.status,
    });
  }

  async function save() {
    if (!form.title.trim() || !form.imageUrl.trim()) {
      setError('Vui lòng nhập tên và chọn ảnh banner');
      return;
    }
    setError(null);
    const body = {
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      linkUrl: form.linkUrl.trim() || undefined,
      position: form.position,
      sortOrder: Number(form.sortOrder) || 0,
      status: form.status,
    };
    try {
      if (editingId) {
        await cmsAdminApi.updateBanner(editingId, body);
      } else {
        await cmsAdminApi.createBanner(body);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function removeBanner(b: CmsBanner) {
    if (!window.confirm(`Xóa vĩnh viễn banner "${b.title}"? Hành động này không thể hoàn tác.`)) return;
    setError(null);
    try {
      await cmsAdminApi.deleteBanner(b.id);
      if (editingId === b.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  const positionHint = POSITIONS.find((p) => p.value === form.position)?.hint ?? '';

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{vi.cms.bannersTitle}</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}

        <Card>
          <h2 className="font-semibold">{editingId ? vi.app.edit : vi.app.create}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Tên banner</Label>
              <Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>{vi.cms.position}</Label>
              <Select className="mt-1" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              {positionHint && <p className="mt-1 text-xs text-zinc-500">{positionHint}</p>}
            </div>
            <MediaImageField
              label={vi.cms.bannerImage}
              folder="banners"
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
            />
            <div>
              <Label>{vi.cms.bannerLink}</Label>
              <Input className="mt-1" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/cards hoặc https://..." />
            </div>
            <div>
              <Label>{vi.appearance.sortOrder}</Label>
              <Input className="mt-1" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
            <div>
              <Label>Trạng thái</Label>
              <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void save()}>{vi.app.save}</Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                {vi.app.cancel}
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <ul className="space-y-2 text-sm">
            {banners.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 p-3">
                <span>
                  {b.title} · {b.position} · sort {b.sortOrder}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(b.status)} status={b.status} />
                  <Button size="sm" variant="secondary" onClick={() => startEdit(b)}>
                    {vi.app.edit}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void removeBanner(b)}>
                    {vi.app.delete}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </RequirePermission>
  );
}
