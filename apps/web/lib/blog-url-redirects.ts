/**
 * Collapse mistaken duplicate-slug blog URLs that historically 404'd in GSC:
 * `/tin-tuc/{category}/{slug}/{slug}` → `/tin-tuc/{category}/{slug}`
 */
export function collapseDuplicateBlogSlugPath(pathname: string): string | null {
  const bare = pathname.split(/[?#]/)[0] || '/';
  const parts = bare.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 4 && parts[0] === 'tin-tuc' && parts[2] === parts[3] && parts[2].length > 0) {
    return `/tin-tuc/${parts[1]}/${parts[2]}`;
  }
  return null;
}
