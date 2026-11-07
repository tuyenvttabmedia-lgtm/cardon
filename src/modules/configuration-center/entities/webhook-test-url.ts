const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'admin.localhost',
  'partner.localhost',
]);

export function isLocalWebhookHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

export function isProductionCardonHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'cardon.vn' || hostname.toLowerCase().endsWith('.cardon.vn');
}

/** CardOn API inside Docker cannot reach host nginx via http://localhost:80. */
export function resolveLocalWebhookTestUrl(
  url: string,
  internalBase = 'http://127.0.0.1:3000',
): string {
  const parsed = new URL(url);
  if (!isLocalWebhookHost(parsed.hostname)) {
    return url;
  }
  return `${internalBase.replace(/\/$/, '')}${parsed.pathname}${parsed.search}`;
}
