export const CONTACT_CHANNEL_KEYS = [
  'email',
  'hotline',
  'zalo',
  'fanpage',
  'telegram',
  'address',
] as const;

export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number];

export interface ContactChannel {
  key: ContactChannelKey;
  enabled: boolean;
  value: string;
  /** Optional English value (e.g. address). Empty keeps `value` on /en. */
  valueEn?: string;
  href?: string;
  /** Optional Vietnamese label. Empty keeps the built-in label. */
  label?: string;
  /** Optional English label. Empty keeps the built-in English label. */
  labelEn?: string;
}

export const CONTACT_CHANNEL_META: Record<
  ContactChannelKey,
  { label: string; icon: string; labelKey?: 'contact.address' | 'contact.email' | 'contact.hours' }
> = {
  email: { label: 'Email', icon: '✉️', labelKey: 'contact.email' },
  hotline: { label: 'Hotline', icon: '📞' },
  zalo: { label: 'Zalo', icon: '💬' },
  fanpage: { label: 'Fanpage', icon: '📘' },
  telegram: { label: 'Telegram', icon: '✈️' },
  address: { label: 'Địa chỉ', icon: '📍', labelKey: 'contact.address' },
};

export const DEFAULT_CONTACT_CHANNELS: ContactChannel[] = [
  { key: 'email', enabled: true, value: 'support@cardon.vn', href: 'mailto:support@cardon.vn' },
  { key: 'hotline', enabled: true, value: '0984877066', href: 'tel:0984877066' },
  { key: 'zalo', enabled: true, value: 'Keyon Care', href: 'https://zalo.me/0984877066' },
  { key: 'fanpage', enabled: true, value: 'facebook.com/cardon.vn', href: 'https://facebook.com' },
  { key: 'telegram', enabled: false, value: 'Telegram', href: '' },
  { key: 'address', enabled: true, value: 'Hà Nội, Việt Nam' },
];

export function normalizeContactChannels(
  channels: Partial<ContactChannel>[] | undefined | null,
): ContactChannel[] {
  const byKey = new Map<ContactChannelKey, Partial<ContactChannel>>();
  for (const item of channels ?? []) {
    if (item?.key && (CONTACT_CHANNEL_KEYS as readonly string[]).includes(item.key)) {
      byKey.set(item.key as ContactChannelKey, item);
    }
  }

  return CONTACT_CHANNEL_KEYS.map((key) => {
    const saved = byKey.get(key);
    const defaults = DEFAULT_CONTACT_CHANNELS.find((c) => c.key === key)!;
    const value = (saved?.value ?? defaults.value).trim() || defaults.value;
    const href =
      key === 'address'
        ? undefined
        : key === 'telegram'
          ? (saved?.href?.trim() || defaults.href?.trim() || undefined)
          : ((saved?.href ?? defaults.href)?.trim() || defaults.href || undefined);
    const label = saved?.label?.trim();
    const labelEn = saved?.labelEn?.trim();
    const valueEn = saved?.valueEn?.trim();
    // Respect per-channel defaults (Telegram starts disabled until admin fills a link).
    const enabled = (saved?.enabled ?? defaults.enabled) !== false;
    return {
      key,
      enabled,
      value,
      href,
      ...(label ? { label } : {}),
      ...(labelEn ? { labelEn } : {}),
      ...(valueEn ? { valueEn } : {}),
    };
  });
}

export function resolveContactChannelLabel(
  channel: Pick<ContactChannel, 'label' | 'labelEn'>,
  locale: 'vi' | 'en',
  fallback: string,
): string {
  if (locale === 'en') return channel.labelEn?.trim() || fallback;
  return channel.label?.trim() || fallback;
}

export function resolveContactChannelValue(
  channel: Pick<ContactChannel, 'value' | 'valueEn'>,
  locale: 'vi' | 'en',
): string {
  if (locale === 'en' && channel.valueEn?.trim()) return channel.valueEn.trim();
  return channel.value.trim();
}

export type SpeedDialActionId = 'hotline' | 'zalo' | 'messenger' | 'telegram';

export interface SpeedDialAction {
  id: SpeedDialActionId;
  label: string;
  href: string;
  external: boolean;
}

/** Prefer m.me deep link when the fanpage URL is a normal Facebook page. */
export function resolveMessengerHref(fanpageHref: string): string {
  const raw = fanpageHref.trim();
  if (!raw) return raw;
  if (/m\.me\//i.test(raw)) {
    return raw.startsWith('http') ? raw : `https://${raw}`;
  }

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'facebook.com' && host !== 'fb.com') {
      return raw.startsWith('http') ? raw : `https://${raw}`;
    }
    const slug = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    if (slug && slug !== 'profile.php' && slug !== 'pages') {
      return `https://m.me/${slug}`;
    }
  } catch {
    /* keep original */
  }

  return raw.startsWith('http') ? raw : `https://${raw}`;
}

/** Normalize t.me / telegram.me links for the speed dial. */
export function resolveTelegramHref(rawHref: string): string {
  const raw = rawHref.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('t.me/') || raw.startsWith('telegram.me/')) return `https://${raw}`;
  if (raw.startsWith('@')) return `https://t.me/${raw.slice(1)}`;
  return `https://t.me/${raw.replace(/^\/+/, '')}`;
}

export function buildSpeedDialActions(channels: ContactChannel[]): SpeedDialAction[] {
  const actions: SpeedDialAction[] = [];
  const byKey = new Map(channels.map((c) => [c.key, c]));

  const hotline = byKey.get('hotline');
  if (hotline?.enabled) {
    const href =
      hotline.href?.trim() ||
      (hotline.value.trim() ? `tel:${hotline.value.replace(/[^\d+]/g, '')}` : '');
    if (href) {
      actions.push({ id: 'hotline', label: 'Gọi điện', href, external: false });
    }
  }

  const zalo = byKey.get('zalo');
  if (zalo?.enabled && zalo.href?.trim()) {
    actions.push({ id: 'zalo', label: 'Zalo', href: zalo.href.trim(), external: true });
  }

  const fanpage = byKey.get('fanpage');
  if (fanpage?.enabled && fanpage.href?.trim()) {
    const href = resolveMessengerHref(fanpage.href);
    actions.push({ id: 'messenger', label: 'Facebook', href, external: true });
  }

  const telegram = byKey.get('telegram');
  if (telegram?.enabled && telegram.href?.trim()) {
    const href = resolveTelegramHref(telegram.href);
    if (href) {
      actions.push({ id: 'telegram', label: 'Telegram', href, external: true });
    }
  }

  return actions;
}
