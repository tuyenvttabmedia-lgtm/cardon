'use client';



import { useEffect, useState } from 'react';

import { MarketingNav } from '@/components/marketing/MarketingNav';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Card, ErrorMessage } from '@/components/ui/Display';

import { Button, Input, Label, Textarea } from '@/components/ui/Form';

import { MediaImageField } from '@/components/marketing/MediaImageField';

import { vi } from '@/lib/i18n/vi';

import { cmsAdminApi, ApiClientError } from '@/services/api-client';

import type { CmsSeoSettings } from '@/types/api';



function FieldHint({ children }: { children: string }) {

  return <p className="mt-1 text-xs leading-relaxed text-zinc-500">{children}</p>;

}



export default function SeoSettingsPage() {

  const [form, setForm] = useState<CmsSeoSettings | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [saved, setSaved] = useState(false);



  useEffect(() => {

    cmsAdminApi

      .getSeoSettings()

      .then(setForm)

      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed))

      .finally(() => setLoading(false));

  }, []);



  async function save() {

    if (!form) return;

    try {

      const updated = await cmsAdminApi.updateSeoSettings(form);

      setForm(updated);

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

          <h1 className="text-2xl font-bold">{vi.cms.seoTitle}</h1>

          <MarketingNav />

          {error ? <ErrorMessage message={error} /> : <ErrorMessage message={vi.app.requestFailed} />}

        </div>

      </RequirePermission>

    );

  }



  return (

    <RequirePermission permission="cms.manage">

      <div className="space-y-6">

        <div>

          <h1 className="text-2xl font-bold">{vi.cms.seoTitle}</h1>

          <p className="mt-1 text-sm text-zinc-500">

            Cài đặt SEO toàn site — áp dụng lên frontend cardon.vn (title/description mặc định, Search Console, robots.txt, sitemap, GA/GTM).

          </p>

        </div>

        <MarketingNav />

        {error && <ErrorMessage message={error} />}

        {saved && <p className="text-sm text-emerald-600">{vi.cms.saved}</p>}

        <Card className="max-w-2xl space-y-4">

          <div>

            <Label>{vi.cms.siteTitle}</Label>

            <Input className="mt-1" value={form.siteTitle} onChange={(e) => setForm({ ...form, siteTitle: e.target.value })} />

            <FieldHint>{vi.cms.siteTitleHint}</FieldHint>

          </div>

          <div>

            <Label>{vi.cms.metaDescription}</Label>

            <Input className="mt-1" value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />

            <FieldHint>{vi.cms.metaDescriptionHint}</FieldHint>

          </div>

          <div>

            <Label>{vi.cms.googleAnalytics}</Label>

            <Input className="mt-1" value={form.googleAnalyticsId} onChange={(e) => setForm({ ...form, googleAnalyticsId: e.target.value })} placeholder="G-XXXXXXXX" />

            <FieldHint>{vi.cms.googleAnalyticsHint}</FieldHint>

          </div>

          <div>

            <Label>{vi.cms.googleTagManager}</Label>

            <Input className="mt-1" value={form.googleTagManagerId} onChange={(e) => setForm({ ...form, googleTagManagerId: e.target.value })} placeholder="GTM-XXXX" />

            <FieldHint>{vi.cms.googleTagManagerHint}</FieldHint>

          </div>

          <div>

            <Label>{vi.cms.searchConsole}</Label>

            <Input

              className="mt-1 font-mono text-sm"

              value={form.searchConsoleVerification}

              onChange={(e) => setForm({ ...form, searchConsoleVerification: e.target.value })}

              placeholder="1KC_nKKpl1wiIOQZNUuoHK4ghVPenrKbjkMC1ZIHeNI"

            />

            <FieldHint>{vi.cms.searchConsoleHint}</FieldHint>

          </div>

          <div>

            <Label>{vi.cms.robotsTxt}</Label>

            <Textarea className="mt-1 min-h-[100px] font-mono text-xs" value={form.robotsTxt} onChange={(e) => setForm({ ...form, robotsTxt: e.target.value })} />

            <FieldHint>{vi.cms.robotsTxtHint}</FieldHint>

          </div>

          <div className="flex items-center gap-2">

            <input

              type="checkbox"

              id="sitemap"

              checked={Boolean(form.sitemapEnabled)}

              onChange={(e) => setForm({ ...form, sitemapEnabled: e.target.checked })}

            />

            <Label htmlFor="sitemap">{vi.cms.sitemapEnabled}</Label>

          </div>

          <FieldHint>{vi.cms.sitemapEnabledHint}</FieldHint>

          <div>

            <Label>{vi.cms.sitemapBaseUrl}</Label>

            <Input className="mt-1" value={form.sitemapBaseUrl} onChange={(e) => setForm({ ...form, sitemapBaseUrl: e.target.value })} placeholder="https://cardon.vn" />

            <FieldHint>{vi.cms.sitemapBaseUrlHint}</FieldHint>

          </div>

          <MediaImageField

            label={vi.cms.ogImage}

            folder="banners"

            value={form.ogImageUrl}

            onChange={(url) => setForm({ ...form, ogImageUrl: url })}

          />

          <FieldHint>{vi.cms.ogImageHint}</FieldHint>

          <Button onClick={() => void save()}>{vi.app.save}</Button>

        </Card>

      </div>

    </RequirePermission>

  );

}

