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
  { key: 'hotline', enabled: true, value: '1900 xxxx', href: 'tel:1900' },
  { key: 'zalo', enabled: true, value: 'CardOn.vn', href: 'https://zalo.me' },
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
