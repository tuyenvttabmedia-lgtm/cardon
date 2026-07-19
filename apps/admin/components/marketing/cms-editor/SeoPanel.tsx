'use client';

import { memo } from 'react';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { Input, Label, Select } from '@/components/ui/Form';
import { buildPublicPageUrl } from '@/lib/public-url';
import type { CmsEditorFormState } from '@/lib/cms-editor-utils';
import { buildSeoChecklist, computeSeoScore } from '@/lib/cms-editor-utils';
import { OpenGraphPreview } from './OpenGraphPreview';
import { SeoScoreBadge } from './CmsBadges';

export function GooglePreview({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[10px] font-medium uppercase text-zinc-400">Google Preview</p>
      <p className="mt-2 truncate text-lg text-[#1a0dab]">{title || 'Tiêu đề SEO'}</p>
      <p className="truncate text-sm text-[#006621]">{url}</p>
      <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{description || 'Mô tả meta…'}</p>
    </div>
  );
}

export const SeoPanel = memo(function SeoPanel({
  form,
  setForm,
  previewPath,
  compact = false,
}: {
  form: CmsEditorFormState;
  setForm: (fn: (prev: CmsEditorFormState) => CmsEditorFormState) => void;
  previewPath: string;
  compact?: boolean;
}) {
  const checklist = buildSeoChecklist(form);
  const score = computeSeoScore(checklist);
  const previewUrl = form.canonicalUrl || buildPublicPageUrl(previewPath);

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4 border-t border-zinc-200 pt-4'}>
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">SEO</p>
          <SeoScoreBadge score={score} />
        </div>
      )}
      {compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">SEO Score</span>
          <SeoScoreBadge score={score} />
        </div>
      )}

      <div>
        <Label>Focus Keyword</Label>
        <Input className="mt-1 text-sm" value={form.focusKeyword} onChange={(e) => setForm((p) => ({ ...p, focusKeyword: e.target.value }))} />
      </div>
      <div>
        <Label>SEO Title</Label>
        <Input className="mt-1 text-sm" value={form.metaTitle} onChange={(e) => setForm((p) => ({ ...p, metaTitle: e.target.value }))} />
      </div>
      <div>
        <Label>Meta Description</Label>
        <Input className="mt-1 text-sm" value={form.metaDescription} onChange={(e) => setForm((p) => ({ ...p, metaDescription: e.target.value }))} />
      </div>
      <div>
        <Label>Slug</Label>
        <Input className="mt-1 text-sm" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value, slugManual: true }))} />
      </div>
      <div>
        <Label>Canonical</Label>
        <Input className="mt-1 text-sm" value={form.canonicalUrl} onChange={(e) => setForm((p) => ({ ...p, canonicalUrl: e.target.value }))} />
      </div>
      <div>
        <Label>Robots</Label>
        <Select className="mt-1 text-sm" value={form.robots} onChange={(e) => setForm((p) => ({ ...p, robots: e.target.value }))}>
          <option value="index,follow">index, follow</option>
          <option value="noindex,nofollow">noindex, nofollow</option>
          <option value="index,nofollow">index, nofollow</option>
        </Select>
      </div>
      <div>
        <Label>OG Title</Label>
        <Input className="mt-1 text-sm" value={form.ogTitle} onChange={(e) => setForm((p) => ({ ...p, ogTitle: e.target.value }))} />
      </div>
      <div>
        <Label>OG Description</Label>
        <Input className="mt-1 text-sm" value={form.ogDescription} onChange={(e) => setForm((p) => ({ ...p, ogDescription: e.target.value }))} />
      </div>
      <MediaImageField label="OG Image" folder="articles" value={form.ogImage} onChange={(url) => setForm((p) => ({ ...p, ogImage: url }))} />

      <GooglePreview title={form.metaTitle || form.title} description={form.metaDescription} url={previewUrl} />
      <OpenGraphPreview
        title={form.ogTitle || form.metaTitle || form.title}
        description={form.ogDescription || form.metaDescription}
        image={form.ogImage || form.featuredImage}
        url={previewUrl}
      />

      <ul className="space-y-1 text-xs">
        {checklist.map((item) => (
          <li key={item.id} className={item.ok ? 'text-emerald-600' : 'text-zinc-500'}>
            {item.ok ? '✓' : '○'} {item.label}
            {!item.ok && item.hint && <span className="text-zinc-400"> — {item.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
});
