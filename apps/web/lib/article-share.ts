/** Build absolute share URLs for article social buttons. */

export function facebookShareUrl(articleUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`;
}

export function xShareUrl(articleUrl: string, title: string): string {
  const params = new URLSearchParams({ url: articleUrl, text: title });
  return `https://x.com/intent/tweet?${params.toString()}`;
}

export function telegramShareUrl(articleUrl: string, title: string): string {
  const params = new URLSearchParams({ url: articleUrl, text: title });
  return `https://t.me/share/url?${params.toString()}`;
}

/**
 * Zalo web `zalo.me/share?url=` only redirects to login and drops the URL.
 * `zaloapp.com/qr/p/` opens / deep-links into the Zalo app with the link (mobile)
 * and shows a usable landing on desktop.
 */
export function zaloShareUrl(articleUrl: string): string {
  return `https://zaloapp.com/qr/p/?url=${encodeURIComponent(articleUrl)}`;
}

export type ShareNetworkId = 'facebook' | 'x' | 'telegram' | 'zalo';

export const ARTICLE_SHARE_NETWORKS: Array<{
  id: ShareNetworkId;
  labelKey: 'share.facebook' | 'share.x' | 'share.telegram' | 'share.zalo';
  icon: string;
  buildUrl: (articleUrl: string, title: string) => string;
}> = [
  { id: 'facebook', labelKey: 'share.facebook', icon: 'f', buildUrl: (u) => facebookShareUrl(u) },
  { id: 'x', labelKey: 'share.x', icon: '𝕏', buildUrl: (u, t) => xShareUrl(u, t) },
  { id: 'telegram', labelKey: 'share.telegram', icon: '✈', buildUrl: (u, t) => telegramShareUrl(u, t) },
  { id: 'zalo', labelKey: 'share.zalo', icon: 'Z', buildUrl: (u) => zaloShareUrl(u) },
];
