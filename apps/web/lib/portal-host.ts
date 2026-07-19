export const PORTAL_HEADER = 'x-cardon-portal';

export type PortalKind = 'public';

/** Single public B2C portal — customer account is embedded at /tai-khoan */
export function resolvePortalHost(_host: string): PortalKind {
  return 'public';
}

export const PUBLIC_ONLY_PREFIXES = [
  '/cards',
  '/nap-cuoc',
  '/nap-data',
  '/checkout',
  '/blog',
  '/tin-tuc',
  '/gioi-thieu',
  '/lien-he',
  '/tro-giup',
  '/tra-cuu-don-hang',
  '/product',
  '/order',
  '/pages',
  '/bao-tri',
];

export function isPublicOnlyPath(_pathname: string): boolean {
  return false;
}
