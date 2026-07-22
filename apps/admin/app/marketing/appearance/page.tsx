'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { normalizeThemeSettings } from '@/lib/theme-normalize';
import { CONTACT_CHANNEL_META } from '@/lib/contact-channels';
import { extractGoogleMapsEmbedUrl } from '@/lib/google-map';
import { cmsAdminApi, ApiClientError } from '@/services/api-client';
import type { CmsThemeSettings } from '@/types/api';

type MenuItem = { label: string; href: string; sortOrder?: number };
type FooterColumn = { title: string; links: Array<{ label: string; href: string }> };
type MobileNavItem = NonNullable<CmsThemeSettings['mobileNav']>[number];

const SECTIONS = [
  { id: 'logos', label: 'Logo' },
  { id: 'company', label: 'Công ty' },
  { id: 'compliance', label: 'BCT & Map' },
  { id: 'contact', label: 'Liên hệ' },
  { id: 'header-menu', label: 'Menu' },
  { id: 'mobile-nav', label: 'Mobile' },
  { id: 'footer', label: 'Footer' },
] as const;

export default function AppearancePage() {
  const [form, setForm] = useState<CmsThemeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

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
    footerColumns[colIndex] = {
      ...footerColumns[colIndex],
      links: links.length ? links : [{ label: 'Liên kết', href: '/' }],
    };
    setForm({ ...form, footerColumns });
  }

  async function save() {
    if (!form) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await cmsAdminApi.updateThemeSettings(normalizeThemeSettings(form));
      setForm(normalizeThemeSettings(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
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

  const mapUrlInvalid =
    form.companyInfo?.googleMapEnabled === true &&
    Boolean((form.companyInfo?.googleMapEmbedUrl ?? '').trim()) &&
    !extractGoogleMapsEmbedUrl(form.companyInfo.googleMapEmbedUrl);

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-5 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{vi.appearance.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Logo, công ty, liên hệ, menu và footer — chỉnh trên lưới 2 cột để bớt cuộn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-sm text-emerald-600">{vi.cms.saved}</span> : null}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Đang lưu…' : vi.app.save}
            </Button>
          </div>
        </div>

        <MarketingNav />
        {error ? <ErrorMessage message={error} /> : null}

        <nav
          className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur"
          aria-label="Nhảy tới mục"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <Card id="logos" className="scroll-mt-16 space-y-4 xl:col-span-2">
            <div>
              <h2 className="font-semibold">Logo & ảnh mặc định</h2>
              <p className="mt-0.5 text-sm text-zinc-500">Logo site, favicon và ảnh Open Graph mặc định.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>
          </Card>

          <Card id="company" className="scroll-mt-16 space-y-4">
            <div>
              <h2 className="font-semibold">Thông tin công ty (Cột 1 footer)</h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                Tên, MST, địa chỉ, email, giờ làm việc. Hotline hiện ở cột Hỗ trợ.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Tên công ty</Label>
                <Input
                  className="mt-1"
                  placeholder="Công Ty TNHH …"
                  value={form.companyInfo?.companyName ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, companyName: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Mã số thuế</Label>
                <Input
                  className="mt-1"
                  placeholder="MST"
                  value={form.companyInfo?.taxCode ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, companyInfo: { ...form.companyInfo, taxCode: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label>Hotline</Label>
                <Input
                  className="mt-1"
                  placeholder="0962…"
                  value={form.companyInfo?.hotline ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, companyInfo: { ...form.companyInfo, hotline: e.target.value } })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">Cột Hỗ trợ (Hotline: …)</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Địa chỉ</Label>
                <Input
                  className="mt-1"
                  placeholder="Địa chỉ trụ sở"
                  value={form.companyInfo?.address ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, companyInfo: { ...form.companyInfo, address: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  placeholder="support@cardon.vn"
                  value={form.companyInfo?.email ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, companyInfo: { ...form.companyInfo, email: e.target.value } })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">Cột 1 footer (Email: …)</p>
              </div>
              <div>
                <Label>Thời gian làm việc</Label>
                <Input
                  className="mt-1"
                  placeholder="08:00 - 22:00 (T2-CN)"
                  value={form.companyInfo?.workingHours ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, workingHours: e.target.value },
                    })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">Cột 1 footer (Thời gian làm việc: …)</p>
              </div>
            </div>
          </Card>

          <div id="compliance" className="scroll-mt-16 space-y-5">
            <Card className="space-y-4">
              <div>
                <h2 className="font-semibold">Logo Bộ Công Thương</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Hiện dưới cột cuối footer (thường là Hỗ trợ).</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.companyInfo?.boCongThuongEnabled === true}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, boCongThuongEnabled: e.target.checked },
                    })
                  }
                />
                Hiển thị logo đã thông báo Bộ Công Thương
              </label>
              <MediaImageField
                label="Ảnh logo / huy hiệu"
                folder="banners"
                value={form.companyInfo?.boCongThuongImageUrl ?? ''}
                onChange={(url) =>
                  setForm({
                    ...form,
                    companyInfo: { ...form.companyInfo, boCongThuongImageUrl: url },
                  })
                }
              />
              <div>
                <Label>Link khi click logo</Label>
                <Input
                  className="mt-1"
                  placeholder="https://…"
                  value={form.companyInfo?.boCongThuongLinkUrl ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, boCongThuongLinkUrl: e.target.value },
                    })
                  }
                />
              </div>
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="font-semibold">Google Map (/lien-he)</h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Google Maps → Chia sẻ → Nhúng bản đồ → dán URL <code className="rounded bg-zinc-100 px-1">src</code>{' '}
                  hoặc cả iframe.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.companyInfo?.googleMapEnabled === true}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, googleMapEnabled: e.target.checked },
                    })
                  }
                />
                Hiển thị Google Map trên trang Liên hệ
              </label>
              <div>
                <Label>Embed URL / HTML iframe</Label>
                <textarea
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  rows={3}
                  placeholder="https://www.google.com/maps/embed?pb=…"
                  value={form.companyInfo?.googleMapEmbedUrl ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyInfo: { ...form.companyInfo, googleMapEmbedUrl: e.target.value },
                    })
                  }
                />
                {mapUrlInvalid ? (
                  <p className="mt-1 text-xs text-amber-600">
                    URL chưa hợp lệ — cần link embed Google Maps (có /maps/embed).
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">Chỉ chấp nhận HTTPS embed từ Google Maps.</p>
                )}
              </div>
            </Card>
          </div>

          <Card id="contact" className="scroll-mt-16 space-y-4 xl:col-span-2">
            <div>
              <h2 className="font-semibold">Kênh liên hệ (trang /lien-he)</h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                Khối &quot;Thông tin liên hệ&quot; bên trái trang Liên hệ — 5 kênh cố định.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(form.contactChannels ?? []).map((channel, i) => {
                const meta = CONTACT_CHANNEL_META[channel.key];
                return (
                  <div key={channel.key} className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {meta.icon} {meta.label}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={channel.enabled !== false}
                          onChange={(e) => {
                            const contactChannels = [...(form.contactChannels ?? [])];
                            contactChannels[i] = { ...contactChannels[i], enabled: e.target.checked };
                            setForm({ ...form, contactChannels });
                          }}
                        />
                        Hiện
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
                        placeholder="mailto: / tel: / https://…"
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
            </div>
          </Card>

          <Card id="header-menu" className="scroll-mt-16 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{vi.appearance.headerMenu}</h2>
              <Button size="sm" variant="secondary" onClick={addMenu}>
                {vi.appearance.addMenuItem}
              </Button>
            </div>
            <div className="space-y-2">
              {form.headerMenu.map((item, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-zinc-100 p-2.5 sm:grid-cols-[1fr_1fr_5rem_auto]">
                  <Input
                    value={item.label}
                    onChange={(e) => updateMenu(i, { label: e.target.value })}
                    placeholder={vi.appearance.label}
                  />
                  <Input
                    value={item.href}
                    onChange={(e) => updateMenu(i, { href: e.target.value })}
                    placeholder={vi.appearance.url}
                  />
                  <Input
                    type="number"
                    value={item.sortOrder ?? i}
                    onChange={(e) => updateMenu(i, { sortOrder: Number(e.target.value) })}
                    placeholder="#"
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeMenu(i)}>
                    {vi.appearance.remove}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card id="mobile-nav" className="scroll-mt-16 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{vi.appearance.mobileNav}</h2>
              <Button size="sm" variant="secondary" onClick={addMobileNav}>
                {vi.appearance.addNavItem}
              </Button>
            </div>
            <div className="space-y-2">
              {(form.mobileNav ?? []).map((item, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-zinc-100 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-[1fr_4rem_1fr_4rem]">
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
                      placeholder="#"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={item.requireLogin === true}
                        onChange={(e) => updateMobileNav(i, { requireLogin: e.target.checked })}
                      />
                      {vi.appearance.requireLogin}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={item.active !== false}
                        onChange={(e) => updateMobileNav(i, { active: e.target.checked })}
                      />
                      {vi.appearance.active}
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeMobileNav(i)}>
                      {vi.appearance.remove}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card id="footer" className="scroll-mt-16 space-y-4 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{vi.appearance.footerColumns}</h2>
                <p className="text-sm text-zinc-500">
                  Cột liên kết 2–4. Cột 1 lấy từ &quot;Thông tin công ty&quot; — không tạo riêng.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={addFooterCol}>
                {vi.appearance.addColumn}
              </Button>
            </div>
            {form.footerColumns.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                Chưa có cột liên kết. Nhấn &quot;{vi.appearance.addColumn}&quot; để thêm.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {form.footerColumns.map((col, ci) => (
                  <div key={ci} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-admin-100 px-2 text-xs font-bold text-admin-700">
                        Cột {ci + 2}
                      </span>
                      <Input
                        className="min-w-0 flex-1 bg-white"
                        value={col.title}
                        onChange={(e) => updateFooterCol(ci, { title: e.target.value })}
                        placeholder={vi.appearance.columnTitle}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ci === 0}
                        onClick={() => moveFooterCol(ci, -1)}
                        title="Di chuyển trái"
                      >
                        ←
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ci === form.footerColumns.length - 1}
                        onClick={() => moveFooterCol(ci, 1)}
                        title="Di chuyển phải"
                      >
                        →
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeFooterCol(ci)}>
                        {vi.appearance.remove}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Liên kết</p>
                      {col.links.map((link, li) => (
                        <div key={li} className="grid gap-1.5">
                          <Input
                            className="bg-white"
                            value={link.label}
                            onChange={(e) => {
                              const links = [...col.links];
                              links[li] = { ...links[li], label: e.target.value };
                              updateFooterCol(ci, { links });
                            }}
                            placeholder="Nhãn"
                          />
                          <div className="flex gap-1.5">
                            <Input
                              className="flex-1 bg-white"
                              value={link.href}
                              onChange={(e) => {
                                const links = [...col.links];
                                links[li] = { ...links[li], href: e.target.value };
                                updateFooterCol(ci, { links });
                              }}
                              placeholder="/path hoặc https://…"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFooterLink(ci, li)}
                              title="Xóa liên kết"
                            >
                              ×
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        updateFooterCol(ci, { links: [...col.links, { label: 'Liên kết mới', href: '/' }] })
                      }
                    >
                      {vi.appearance.addLink}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
            <p className="hidden text-sm text-zinc-500 sm:block">
              {saved ? vi.cms.saved : 'Nhớ lưu sau khi chỉnh logo, công ty, menu hoặc footer.'}
            </p>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Đang lưu…' : vi.app.save}
            </Button>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
