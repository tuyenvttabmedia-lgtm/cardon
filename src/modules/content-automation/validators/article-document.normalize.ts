/**
 * Coerce provider JSON into ArticleDocument shape.
 * Models often emit outline-like `type: "section"` blocks or snake_case keys.
 */

export function coerceArticleDocument(raw: unknown): unknown {
  let value = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return raw;
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  let root = camelizeKeys(value as Record<string, unknown>);

  for (const key of ['data', 'result', 'article', 'output', 'payload', 'document', 'content']) {
    const inner = root[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const candidate = camelizeKeys(inner as Record<string, unknown>);
      if (candidate.title || candidate.sections || candidate.seo) {
        root = candidate;
        break;
      }
    }
  }

  if (Array.isArray(root.sections)) {
    root.sections = expandSectionBlocks(root.sections);
  }

  return root;
}

export function summarizeArticlePayloadKeys(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return typeof raw;
  }
  return Object.keys(raw as object).slice(0, 20).join(', ') || '(empty object)';
}

function expandSectionBlocks(items: unknown[]): unknown[] {
  const out: unknown[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      out.push(item);
      continue;
    }

    const row = camelizeKeys(item as Record<string, unknown>);
    const type = String(row.type ?? '')
      .trim()
      .toLowerCase();

    const nested =
      (Array.isArray(row.blocks) && row.blocks) ||
      (Array.isArray(row.children) && row.children) ||
      (Array.isArray(row.content) && row.content) ||
      null;

    const looksLikeOutlineSection =
      type === 'section' ||
      type === 'heading' ||
      type === 'outline_section' ||
      (!type && (row.heading != null || row.keyPoints != null || row.summary != null));

    if (looksLikeOutlineSection) {
      const idBase = String(row.id ?? `sec-${i + 1}`).trim() || `sec-${i + 1}`;
      const level = Number(row.level) === 3 ? 3 : 2;
      const heading = firstNonEmptyString(row.heading, row.title, type === 'heading' ? row.text : null);

      if (heading) {
        out.push({
          id: `${idBase}-h`,
          type: level === 3 ? 'h3' : 'h2',
          text: heading,
        });
      }

      if (nested) {
        out.push(...expandSectionBlocks(nested));
      } else {
        const body = firstNonEmptyString(
          row.summary,
          row.body,
          typeof row.content === 'string' ? row.content : null,
          heading ? null : row.text,
        );
        if (body) {
          out.push({
            id: `${idBase}-p`,
            type: 'paragraph',
            text: body,
          });
        }

        if (Array.isArray(row.keyPoints)) {
          const points = row.keyPoints.filter(
            (p): p is string => typeof p === 'string' && p.trim().length > 0,
          );
          if (points.length) {
            out.push({
              id: `${idBase}-ul`,
              type: 'ul',
              items: points,
            });
          }
        }
      }
      continue;
    }

    if (!row.id) {
      row.id = `blk-${i + 1}`;
    }

    // Common aliases
    if (type === 'p' || type === 'text') row.type = 'paragraph';
    if (type === 'heading_2' || type === 'header') row.type = 'h2';
    if (type === 'heading_3') row.type = 'h3';
    if (type === 'bullet' || type === 'bullets' || type === 'list') row.type = 'ul';
    if (type === 'numbered' || type === 'numbered_list') row.type = 'ol';

    out.push(row);
  }

  return out;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function camelizeKeys(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    if (Array.isArray(value)) {
      out[camel] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? camelizeKeys(item as Record<string, unknown>)
          : item,
      );
    } else if (value && typeof value === 'object') {
      out[camel] = camelizeKeys(value as Record<string, unknown>);
    } else {
      out[camel] = value;
    }
  }
  return out;
}
