'use client';

import { useEffect, useState } from 'react';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { cmsAdminApi } from '@/services/api-client';
import type { CmsMedia, CmsThemeSettings } from '@/types/api';

export type HomeBackgrounds = NonNullable<CmsThemeSettings['homeBackgrounds']>;

const FIELDS: Array<{ key: keyof HomeBackgrounds; label: string; note: string }> = [
  {
    key: 'homeHeroBg',
    label: 'Hero trang chủ',
    note: 'Gỡ ảnh để quay về banner-header-4.png mặc định.',
  },
  {
    key: 'hubHeroGameBg',
    label: 'Hero Thẻ game',
    note: 'Nền full-bleed /the-game. Gỡ ảnh để dùng banner-header-1.png.',
  },
  {
    key: 'hubHeroPhoneBg',
    label: 'Hero Thẻ điện thoại',
    note: 'Nền full-bleed /the-dien-thoai. Gỡ ảnh để dùng banner-header-2.png.',
  },
  {
    key: 'hubHeroTopupBg',
    label: 'Hero Nạp cước',
    note: 'Nền full-bleed /nap-cuoc (và /nap-data). Gỡ ảnh để dùng banner-header-3.png.',
  },
  {
    key: 'hubHeroEsimBg',
    label: 'Hero eSIM',
    note: 'Nền full-bleed /esim. Gỡ ảnh để dùng /images/esim/hero.png.',
  },
  {
    key: 'homeCategoryGameBg',
    label: 'Ô danh mục Thẻ game (trang chủ)',
    note: 'Ảnh minh họa thẻ danh mục trên trang chủ — không phải hero hub.',
  },
  {
    key: 'homeCategoryPhoneCardBg',
    label: 'Ô danh mục Thẻ điện thoại (trang chủ)',
    note: 'Ảnh minh họa thẻ danh mục trên trang chủ — không phải hero hub.',
  },
  {
    key: 'homeCategoryTopupBg',
    label: 'Ô danh mục Nạp cước (trang chủ)',
    note: 'Ảnh minh họa thẻ danh mục trên trang chủ — không phải hero hub.',
  },
  {
    key: 'homeCategoryEsimBg',
    label: 'Ô danh mục eSIM (trang chủ)',
    note: 'Ảnh minh họa thẻ danh mục trên trang chủ — không phải hero hub.',
  },
  {
    key: 'siteFooterBg',
    label: 'Footer trang chủ',
    note: 'Gỡ ảnh để quay về file mặc định footer.jpg. Dải sáng nằm ở mép dưới.',
  },
];

function filenameOf(url: string) {
  const clean = url.split('?')[0] ?? url;
  return clean.split('/').pop() || url;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HomeBackgroundFields({
  value,
  onChange,
}: {
  value: HomeBackgrounds;
  onChange: (next: HomeBackgrounds) => void;
}) {
  const [media, setMedia] = useState<CmsMedia[]>([]);

  useEffect(() => {
    void cmsAdminApi
      .listMedia({ folder: 'banners' })
      .then(setMedia)
      .catch(() => setMedia([]));
  }, [value]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {FIELDS.map((field) => {
        const url = value[field.key] ?? '';
        const match = media.find((item) => item.url === url);
        return (
          <div key={field.key} className="rounded-xl border border-slate-200 p-3">
            <MediaImageField
              label={field.label}
              folder="banners"
              value={url}
              onChange={(next) => onChange({ ...value, [field.key]: next })}
            />
            <p className="mt-2 text-xs text-slate-500">{field.note}</p>
            {url ? (
              <p className="mt-1 text-xs text-slate-600">
                {match?.originalName || filenameOf(url)}
                {match ? ` · ${formatSize(match.size)}` : ''}
                {match?.width && match?.height ? ` · ${match.width}×${match.height}` : ''}
                {match?.createdAt
                  ? ` · ${new Date(match.createdAt).toLocaleString('vi-VN')}`
                  : ''}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Đang dùng nền mặc định.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
