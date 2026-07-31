export const CONTACT_CHANNEL_KEYS = ['email', 'hotline', 'zalo', 'fanpage', 'address'] as const;

export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number];

export interface ContactChannel {
  key: ContactChannelKey;
  enabled: boolean;
  value: string;
  href?: string;
}

export const CONTACT_CHANNEL_META: Record<ContactChannelKey, { label: string; icon: string }> = {
  email: { label: 'Email', icon: '✉️' },
  hotline: { label: 'Hotline', icon: '📞' },
  zalo: { label: 'Zalo', icon: '💬' },
  fanpage: { label: 'Fanpage', icon: '📘' },
  address: { label: 'Địa chỉ', icon: '📍' },
};

export const DEFAULT_CONTACT_CHANNELS: ContactChannel[] = [
  { key: 'email', enabled: true, value: 'support@cardon.vn', href: 'mailto:support@cardon.vn' },
  { key: 'hotline', enabled: true, value: '0962288857', href: 'tel:0962288857' },
  { key: 'zalo', enabled: true, value: 'Keyon Care', href: 'https://zalo.me/0962288857' },
  { key: 'fanpage', enabled: true, value: 'facebook.com/cardon.vn', href: 'https://facebook.com' },
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
        : (saved?.href ?? defaults.href)?.trim() || defaults.href;
    return {
      key,
      enabled: saved?.enabled !== false,
      value,
      href,
    };
  });
}

export type SpeedDialActionId = 'hotline' | 'zalo' | 'messenger';

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
    actions.push({ id: 'messenger', label: 'Messenger', href, external: true });
  }

  return actions;
}
