'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { normalizeThemeSettings } from '@/lib/theme-normalize';
import { CONTACT_CHANNEL_META } from '@/lib/contact-channels';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsThemeSettings } from '@/types/api';

type MenuItem = { label: string; href: string; sortOrder?: number };
type FooterColumn = { title: string; links: Array<{ label: string; href: string }> };
type MobileNavItem = NonNullable<CmsThemeSettings['mobileNav']>[number];

export default function AppearancePage() {
  const [form, setForm] = useState<CmsThemeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    cmsAdminApi
      .getThemeSettings()
      .then((data) => setForm(normalizeThemeSettings(data)))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed))
      .finally(() => setLoading(false));
  }, []);

  function updateMenu(index: number, patch: Partial<MenuItem>) {
    if (!form) return;
    const headerMenu = [...form.headerMenu];
    headerMenu[index] = { ...headerMenu[index], ...patch };
    setForm({ ...form, headerMenu });
  }

  function addMenu() {
    if (!form) return;
    setForm({
      ...form,
      headerMenu: [...form.headerMenu, { label: 'Mục mới', href: '/', sortOrder: form.headerMenu.length }],
    });
  }

  function removeMenu(index: number) {
    if (!form) return;
    setForm({ ...form, headerMenu: form.headerMenu.filter((_, i) => i !== index) });
  }

  function updateMobileNav(index: number, patch: Partial<MobileNavItem>) {
    if (!form) return;
    const mobileNav = [...(form.mobileNav ?? [])];
    mobileNav[index] = { ...mobileNav[index], ...patch };
    setForm({ ...form, mobileNav });
  }

  function addMobileNav() {
    if (!form) return;
    const mobileNav = form.mobileNav ?? [];
    setForm({
      ...form,
      mobileNav: [
        ...mobileNav,
        {
          label: 'Mục mới',
          icon: '📱',
          url: '/',
          sortOrder: mobileNav.length,
          active: true,
        },
      ],
    });
  }

  function removeMobileNav(index: number) {
    if (!form) return;
    setForm({ ...form, mobileNav: (form.mobileNav ?? []).filter((_, i) => i !== index) });
  }

  function updateFooterCol(index: number, patch: Partial<FooterColumn>) {
    if (!form) return;
    const footerColumns = [...form.footerColumns];
    footerColumns[index] = { ...footerColumns[index], ...patch };
    setForm({ ...form, footerColumns });
  }

  function addFooterCol() {
    if (!form) return;
    setForm({
      ...form,
      footerColumns: [...form.footerColumns, { title: 'Cột mới', links: [{ label: 'Liên kết', href: '/' }] }],
    });
  }

  function removeFooterCol(index: number) {
    if (!form) return;
    setForm({ ...form, footerColumns: form.footerColumns.filter((_, i) => i !== index) });
  }

  function moveFooterCol(index: number, direction: -1 | 1) {
    if (!form) return;
    const next = index + direction;
    if (next < 0 || next >= form.footerColumns.length) return;
    const footerColumns = [...form.footerColumns];
    [footerColumns[index], footerColumns[next]] = [footerColumns[next], footerColumns[index]];
    setForm({ ...form, footerColumns });
  }

  function removeFooterLink(colIndex: number, linkIndex: number) {
    if (!form) return;
    const footerColumns = [...form.footerColumns];
    const links = footerColumns[colIndex].links.filter((_, i) => i !== linkIndex);
    footerColumns[colIndex] = { ...footerColumns[colIndex], links: links.length ? links : [{ label: 'Liên kết', href: '/' }] };
    setForm({ ...form, footerColumns });
  }

  async function save() {
    if (!form) return;
    setError(null);
    try {
      const updated = await cmsAdminApi.updateThemeSettings(normalizeThemeSettings(form));
      setForm(normalizeThemeSettings(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  if (loading) {
    return <p className="text-zinc-500">{vi.app.loading}</p>;
  }

  if (!form) {
    return (
      <RequirePermission permission="cms.manage">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{vi.appearance.title}</h1>
          <MarketingNav />
          {error ? <ErrorMessage message={error} /> : <ErrorMessage message={vi.app.requestFailed} />}
        </div>
      </RequirePermission>
    );
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{vi.appearance.title}</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.cms.saved}</p>}

        <Card className="max-w-2xl space-y-4">
          <MediaImageField
            label={vi.appearance.logoDesktop}
            folder="logo"
            value={form.logoDesktop}
            onChange={(url) => setForm({ ...form, logoDesktop: url })}
          />
          <MediaImageField
            label={vi.appearance.logoMobile}
            folder="logo"
            value={form.logoMobile}
            onChange={(url) => setForm({ ...form, logoMobile: url })}
          />
          <MediaImageField
            label={vi.appearance.favicon}
            folder="favicon"
            value={form.favicon}
            onChange={(url) => setForm({ ...form, favicon: url })}
          />
          <MediaImageField
            label={vi.appearance.ogDefault}
            folder="banners"
            value={form.ogDefaultImage}
            onChange={(url) => setForm({ ...form, ogDefaultImage: url })}
          />
        </Card>

        <Card className="max-w-2xl space-y-4">
          <h2 className="font-semibold">Thông tin công ty (Cột 1 footer)</h2>
          <p className="text-sm text-zinc-500">
            Dữ liệu hiển thị ở cột &quot;Thông tin công ty&quot; trên website. Không cần tạo cột riêng trong footer bên dưới.
          </p>
          <Input
            placeholder="Tên công ty"
            value={form.companyInfo?.companyName ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                companyInfo: { ...form.companyInfo, companyName: e.target.value },
              })
            }
          />
          <Input
            placeholder="Mã số thuế"
            value={form.companyInfo?.taxCode ?? ''}
            onChange={(e) =>
              setForm({ ...form, companyInfo: { ...form.companyInfo, taxCode: e.target.value } })
            }
          />
          <Input
            placeholder="Địa chỉ"
            value={form.companyInfo?.address ?? ''}
            onChange={(e) =>
              setForm({ ...form, companyInfo: { ...form.companyInfo, address: e.target.value } })
            }
          />
          <Input
            placeholder="Hotline"
            value={form.companyInfo?.hotline ?? ''}
            onChange={(e) =>
              setForm({ ...form, companyInfo: { ...form.companyInfo, hotline: e.target.value } })
            }
          />
          <Input
            placeholder="Email"
            value={form.companyInfo?.email ?? ''}
            onChange={(e) =>
              setForm({ ...form, companyInfo: { ...form.companyInfo, email: e.target.value } })
            }
          />
        </Card>

        <Card className="max-w-2xl space-y-4">
          <h2 className="font-semibold">Kênh liên hệ (trang /lien-he)</h2>
          <p className="text-sm text-zinc-500">
            Cấu hình khối &quot;Thông tin liên hệ&quot; bên trái trang Liên hệ. Chỉ hỗ trợ 5 kênh mặc định.
          </p>
          {(form.contactChannels ?? []).map((channel, i) => {
            const meta = CONTACT_CHANNEL_META[channel.key];
            return (
              <div key={channel.key} className="rounded border border-zinc-100 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{meta.label}</span>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={channel.enabled !== false}
                      onChange={(e) => {
                        const contactChannels = [...(form.contactChannels ?? [])];
                        contactChannels[i] = { ...contactChannels[i], enabled: e.target.checked };
                        setForm({ ...form, contactChannels });
                      }}
                    />
                    Hiển thị
                  </label>
                </div>
                <Input
                  placeholder="Nội dung hiển thị"
                  value={channel.value}
                  onChange={(e) => {
                    const contactChannels = [...(form.contactChannels ?? [])];
                    contactChannels[i] = { ...contactChannels[i], value: e.target.value };
                    setForm({ ...form, contactChannels });
                  }}
                />
                {channel.key !== 'address' ? (
                  <Input
                    placeholder="Liên kết (mailto:, tel:, https://...)"
                    value={channel.href ?? ''}
                    onChange={(e) => {
                      const contactChannels = [...(form.contactChannels ?? [])];
                      contactChannels[i] = { ...contactChannels[i], href: e.target.value };
                      setForm({ ...form, contactChannels });
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </Card>

        <Card className="max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{vi.appearance.headerMenu}</h2>
            <Button size="sm" variant="secondary" onClick={addMenu}>
              {vi.appearance.addMenuItem}
            </Button>
          </div>
          {form.headerMenu.map((item, i) => (
            <div key={i} className="grid gap-2 rounded border border-zinc-100 p-3 sm:grid-cols-3">
              <Input value={item.label} onChange={(e) => updateMenu(i, { label: e.target.value })} placeholder={vi.appearance.label} />
              <Input value={item.href} onChange={(e) => updateMenu(i, { href: e.target.value })} placeholder={vi.appearance.url} />
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={item.sortOrder ?? i}
                  onChange={(e) => updateMenu(i, { sortOrder: Number(e.target.value) })}
                  placeholder={vi.appearance.sortOrder}
                />
                <Button size="sm" variant="ghost" onClick={() => removeMenu(i)}>
                  {vi.appearance.remove}
                </Button>
              </div>
            </div>
          ))}
        </Card>

        <Card className="max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{vi.appearance.mobileNav}</h2>
            <Button size="sm" variant="secondary" onClick={addMobileNav}>
              {vi.appearance.addNavItem}
            </Button>
          </div>
          {(form.mobileNav ?? []).map((item, i) => (
            <div key={i} className="grid gap-2 rounded border border-zinc-100 p-3 sm:grid-cols-2">
              <Input
                value={item.label}
                onChange={(e) => updateMobileNav(i, { label: e.target.value })}
                placeholder={vi.appearance.label}
              />
              <Input
                value={item.icon}
                onChange={(e) => updateMobileNav(i, { icon: e.target.value })}
                placeholder={vi.appearance.icon}
              />
              <Input
                value={item.url}
                onChange={(e) => updateMobileNav(i, { url: e.target.value })}
                placeholder={vi.appearance.url}
              />
              <Input
                type="number"
                value={item.sortOrder ?? i}
                onChange={(e) => updateMobileNav(i, { sortOrder: Number(e.target.value) })}
                placeholder={vi.appearance.sortOrder}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.requireLogin === true}
                  onChange={(e) => updateMobileNav(i, { requireLogin: e.target.checked })}
                />
                {vi.appearance.requireLogin}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.active !== false}
                  onChange={(e) => updateMobileNav(i, { active: e.target.checked })}
                />
                {vi.appearance.active}
              </label>
              <div className="sm:col-span-2">
                <Button size="sm" variant="ghost" onClick={() => removeMobileNav(i)}>
                  {vi.appearance.remove}
                </Button>
              </div>
            </div>
          ))}
        </Card>

        <Card className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{vi.appearance.footerColumns}</h2>
              <p className="text-sm text-zinc-500">
                Cột liên kết 2–4. Cột 1 lấy từ &quot;Thông tin công ty&quot; ở trên — không cần tạo riêng.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={addFooterCol}>
              {vi.appearance.addColumn}
            </Button>
          </div>
          {form.footerColumns.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
              Chưa có cột liên kết. Nhấn &quot;{vi.appearance.addColumn}&quot; để thêm cột Dịch vụ, Chính sách, Hỗ trợ…
            </p>
          )}
          {form.footerColumns.map((col, ci) => (
            <div key={ci} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-admin-100 px-2 text-xs font-bold text-admin-700">
                  Cột {ci + 2}
                </span>
                <Input
                  className="min-w-[200px] flex-1 bg-white"
                  value={col.title}
                  onChange={(e) => updateFooterCol(ci, { title: e.target.value })}
                  placeholder={vi.appearance.columnTitle}
                />
                <Button size="sm" variant="ghost" disabled={ci === 0} onClick={() => moveFooterCol(ci, -1)} title="Di chuyển lên">
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ci === form.footerColumns.length - 1}
                  onClick={() => moveFooterCol(ci, 1)}
                  title="Di chuyển xuống"
                >
                  ↓
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeFooterCol(ci)}>
                  {vi.appearance.remove}
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Liên kết trong cột</p>
                {col.links.map((link, li) => (
                  <div key={li} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      className="bg-white"
                      value={link.label}
                      onChange={(e) => {
                        const links = [...col.links];
                        links[li] = { ...links[li], label: e.target.value };
                        updateFooterCol(ci, { links });
                      }}
                      placeholder="Nhãn hiển thị"
                    />
                    <Input
                      className="bg-white"
                      value={link.href}
                      onChange={(e) => {
                        const links = [...col.links];
                        links[li] = { ...links[li], href: e.target.value };
                        updateFooterCol(ci, { links });
                      }}
                      placeholder="/duong-dan hoặc https://..."
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeFooterLink(ci, li)} title="Xóa liên kết">
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateFooterCol(ci, { links: [...col.links, { label: 'Liên kết mới', href: '/' }] })}
              >
                {vi.appearance.addLink}
              </Button>
            </div>
          ))}
        </Card>

        <Button onClick={() => void save()}>{vi.app.save}</Button>
      </div>
    </RequirePermission>
  );
}
