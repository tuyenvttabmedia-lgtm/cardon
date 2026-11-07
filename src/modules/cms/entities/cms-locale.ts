export type CmsContentLocale = 'vi' | 'en';

export type CmsLocaleMeta = {
  requestedLocale: CmsContentLocale;
  contentLocale: CmsContentLocale;
  fallback: boolean;
};

type TranslationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type PageTranslationSource = {
  locale: CmsContentLocale;
  title: string;
  excerpt?: string | null;
  content: string;
  status: TranslationStatus;
};

export type SeoTranslationSource = {
  locale: CmsContentLocale;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  focusKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  canonicalUrl?: string | null;
};

export type NamedTranslationSource = {
  locale: CmsContentLocale;
  name: string;
  description?: string | null;
  intro?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
};

type SeoSource = {
  metaTitle: string;
  metaDescription: string;
  metaKeywords?: string | null;
  focusKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  robots?: string;
  structuredData?: unknown;
};

export type LocalizablePage = {
  title: string;
  excerpt?: string | null;
  content?: string;
  category?: string | null;
  seo?: SeoSource | null;
  translations?: PageTranslationSource[];
  seoTranslations?: SeoTranslationSource[];
  categoryRel?: ({
    name: string;
    slug: string;
    translations?: NamedTranslationSource[];
  } & Record<string, unknown>) | null;
  pageTags?: Array<{
    tag: { name: string; slug: string; translations?: NamedTranslationSource[] };
  }>;
};

const SEO_TEXT_KEYS = [
  'metaTitle',
  'metaDescription',
  'metaKeywords',
  'focusKeyword',
  'ogTitle',
  'ogDescription',
] as const;

function publishedPageTranslation(rows: PageTranslationSource[] | undefined, locale: CmsContentLocale) {
  return rows?.find((row) => row.locale === locale && row.status === 'PUBLISHED');
}

function namedTranslation(rows: NamedTranslationSource[] | undefined, locale: CmsContentLocale) {
  return rows?.find((row) => row.locale === locale && row.name.trim());
}

function filled(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function vietnameseBody(page: LocalizablePage) {
  const row = publishedPageTranslation(page.translations, 'vi');
  if (row) {
    return {
      title: row.title,
      excerpt: row.excerpt ?? null,
      content: row.content,
      fromTranslation: true,
    };
  }
  return {
    title: page.title,
    excerpt: page.excerpt ?? null,
    content: page.content ?? '',
    fromTranslation: false,
  };
}

function mergeSeo(
  base: SeoSource | null | undefined,
  translation: SeoTranslationSource | undefined,
  contentLocale: CmsContentLocale,
  body: { title: string; excerpt: string | null },
): SeoSource | null {
  if (!base && !translation) return null;
  const source = base ?? {
    metaTitle: body.title,
    metaDescription: body.excerpt ?? body.title,
    metaKeywords: null,
    focusKeyword: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    canonicalUrl: null,
    robots: 'index,follow',
    structuredData: null,
  };
  const next: SeoSource = {
    ...source,
    ogImage: base?.ogImage ?? null,
    robots: base?.robots ?? source.robots ?? 'index,follow',
    structuredData: base?.structuredData ?? null,
  };
  const allowOriginalText = contentLocale === 'vi';
  for (const key of SEO_TEXT_KEYS) {
    const translated = filled(translation?.[key]);
    if (translated) {
      next[key] = translated;
      continue;
    }
    if (allowOriginalText) continue;
    if (key === 'metaTitle' || key === 'ogTitle') next[key] = body.title;
    else if (key === 'metaDescription' || key === 'ogDescription') next[key] = body.excerpt ?? body.title;
    else next[key] = null;
  }
  return next;
}

function localizeName(
  original: string,
  rows: NamedTranslationSource[] | undefined,
  contentLocale: CmsContentLocale,
): string {
  if (contentLocale === 'en') {
    return namedTranslation(rows, 'en')?.name ?? original;
  }
  return namedTranslation(rows, 'vi')?.name ?? original;
}

export function hasPublishedEnglishTranslation(
  translations: Array<{ locale: string; status: string }> | undefined,
): boolean {
  return Boolean(translations?.some((row) => row.locale === 'en' && row.status === 'PUBLISHED'));
}

export function hasEnglishCategoryName(
  translations: Array<{ locale: string; name?: string | null }> | undefined,
): boolean {
  return Boolean(translations?.some((row) => row.locale === 'en' && (row.name ?? '').trim().length > 0));
}

export function resolvePublicPageLocale<T extends LocalizablePage>(
  page: T,
  requested: CmsContentLocale | undefined,
): { page: T; meta: CmsLocaleMeta | null } {
  if (!requested) return { page, meta: null };

  const vietnamese = vietnameseBody(page);
  const english = publishedPageTranslation(page.translations, 'en');
  const useEnglish = requested === 'en' && Boolean(english);
  const body = useEnglish
    ? {
        title: english!.title,
        excerpt: english!.excerpt ?? null,
        content: english!.content,
      }
    : {
        title: vietnamese.title,
        excerpt: vietnamese.excerpt,
        content: vietnamese.content,
      };
  const contentLocale: CmsContentLocale = useEnglish ? 'en' : 'vi';
  const fallback = requested === 'en' ? !useEnglish : !vietnamese.fromTranslation;
  const seoTranslation = page.seoTranslations?.find((row) => row.locale === contentLocale);

  const categoryRel = page.categoryRel
    ? {
        ...page.categoryRel,
        name: localizeName(page.categoryRel.name, page.categoryRel.translations, contentLocale),
      }
    : page.categoryRel;

  const pageTags = page.pageTags?.map((link) => ({
    ...link,
    tag: {
      ...link.tag,
      name: localizeName(link.tag.name, link.tag.translations, contentLocale),
    },
  }));

  return {
    page: {
      ...page,
      title: body.title,
      excerpt: body.excerpt,
      ...(page.content !== undefined || useEnglish ? { content: body.content } : {}),
      seo: mergeSeo(page.seo, seoTranslation, contentLocale, body),
      categoryRel,
      pageTags,
      category: categoryRel?.name ?? page.category ?? null,
    },
    meta: {
      requestedLocale: requested,
      contentLocale,
      fallback,
    },
  };
}

export type LocalizableCategory = {
  name: string;
  description?: string | null;
  intro?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  translations?: NamedTranslationSource[];
};

export function resolvePublicCategoryLocale<T extends LocalizableCategory>(
  category: T,
  requested: CmsContentLocale | undefined,
): { category: T; meta: CmsLocaleMeta | null } {
  if (!requested) return { category, meta: null };
  const row = namedTranslation(category.translations, requested);
  if (!row) {
    const vietnamese = namedTranslation(category.translations, 'vi');
    const source = requested === 'vi' && vietnamese ? vietnamese : null;
    return {
      category: source
        ? {
            ...category,
            name: source.name,
            description: filled(source.description) ?? category.description ?? null,
            intro: filled(source.intro) ?? category.intro ?? null,
            metaTitle: filled(source.metaTitle) ?? category.metaTitle ?? null,
            metaDescription: filled(source.metaDescription) ?? category.metaDescription ?? null,
            canonicalUrl: category.canonicalUrl ?? null,
          }
        : category,
      meta: {
        requestedLocale: requested,
        contentLocale: 'vi',
        fallback: !(requested === 'vi' && vietnamese),
      },
    };
  }
  const allowOriginal = requested === 'vi';
  return {
    category: {
      ...category,
      name: row.name,
      description: filled(row.description) ?? (allowOriginal ? (category.description ?? null) : null),
      intro: filled(row.intro) ?? (allowOriginal ? (category.intro ?? null) : null),
      metaTitle: filled(row.metaTitle) ?? (allowOriginal ? (category.metaTitle ?? null) : null),
      metaDescription: filled(row.metaDescription) ?? (allowOriginal ? (category.metaDescription ?? null) : null),
      canonicalUrl: category.canonicalUrl ?? null,
      ogImageUrl: category.ogImageUrl ?? null,
    },
    meta: {
      requestedLocale: requested,
      contentLocale: requested,
      fallback: false,
    },
  };
}
