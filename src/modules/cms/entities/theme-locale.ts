export type ThemeMenuItem = {
  label?: string;
  href?: string;
  sortOrder?: number;
  labelEn?: string;
  navKey?: string;
  [key: string]: unknown;
};

export type ThemeFooterLink = {
  label?: string;
  href?: string;
  labelEn?: string;
  navKey?: string;
  [key: string]: unknown;
};

export type ThemeFooterColumn = {
  title?: string;
  titleEn?: string;
  links?: ThemeFooterLink[];
  [key: string]: unknown;
};

export function cleanOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assignOptional(target: Record<string, unknown>, key: string, value: unknown) {
  const text = cleanOptionalText(value);
  if (text) target[key] = text;
  else delete target[key];
}

export function normalizeHeaderMenuItem(item: ThemeMenuItem, index: number): ThemeMenuItem {
  const href = (item.href ?? '/').trim() || '/';
  const next: ThemeMenuItem = {
    ...item,
    label: (item.label ?? '').trim() || href || `Mục ${index + 1}`,
    href,
    sortOrder: item.sortOrder ?? index,
  };
  assignOptional(next, 'labelEn', item.labelEn);
  assignOptional(next, 'navKey', item.navKey);
  return next;
}

export function normalizeFooterColumn(col: ThemeFooterColumn, index: number): ThemeFooterColumn {
  const next: ThemeFooterColumn = {
    ...col,
    title: (col.title ?? '').trim() || `Cột ${index + 1}`,
    links: (col.links ?? []).map((link, li) => {
      const href = (link.href ?? '/').trim() || '/';
      const normalized: ThemeFooterLink = {
        ...link,
        label: (link.label ?? '').trim() || href || `Liên kết ${li + 1}`,
        href,
      };
      assignOptional(normalized, 'labelEn', link.labelEn);
      assignOptional(normalized, 'navKey', link.navKey);
      return normalized;
    }),
  };
  assignOptional(next, 'titleEn', col.titleEn);
  assignOptional(next, 'description', col.description);
  assignOptional(next, 'descriptionEn', col.descriptionEn);
  return next;
}

export function normalizeMobileNavLabel<T extends { label?: string; labelEn?: string; navKey?: string }>(
  item: T,
): T {
  const next = { ...item };
  assignOptional(next, 'labelEn', item.labelEn);
  assignOptional(next, 'navKey', item.navKey);
  return next;
}
