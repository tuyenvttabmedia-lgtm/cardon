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
  valueEn?: string;
  href?: string;
  label?: string;
  labelEn?: string;
}

export const CONTACT_CHANNEL_META: Record<ContactChannelKey, { label: string; icon: string }> = {
  email: { label: 'Email', icon: '✉️' },
  hotline: { label: 'Hotline', icon: '📞' },
  zalo: { label: 'Zalo', icon: '💬' },
  fanpage: { label: 'Fanpage', icon: '📘' },
  telegram: { label: 'Telegram', icon: '✈️' },
  address: { label: 'Địa chỉ', icon: '📍' },
};

/** Channels that can appear on the floating quick-support speed dial. */
export const SPEED_DIAL_CHANNEL_KEYS = ['hotline', 'zalo', 'fanpage', 'telegram'] as const;

export type SpeedDialChannelKey = (typeof SPEED_DIAL_CHANNEL_KEYS)[number];

export function isSpeedDialChannel(key: ContactChannelKey): key is SpeedDialChannelKey {
  return (SPEED_DIAL_CHANNEL_KEYS as readonly string[]).includes(key);
}

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
