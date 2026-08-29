/**
 * Coerce provider JSON into the camelCase analyze payload shape.
 * Models often wrap the object or emit snake_case keys.
 */
export function coerceAnalyzePayload(raw: unknown): unknown {
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

  const root = camelizeKeys(value as Record<string, unknown>);
  if (hasAnalyzeShape(root)) {
    return root;
  }

  for (const key of [
    'data',
    'result',
    'analysis',
    'output',
    'payload',
    'intelligenceSnapshot',
    'snapshot',
    'content',
  ]) {
    const inner = root[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const normalized = camelizeKeys(inner as Record<string, unknown>);
      if (hasAnalyzeShape(normalized)) {
        return normalized;
      }
    }
  }

  return root;
}

export function summarizeAnalyzePayloadKeys(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return typeof raw;
  }
  return Object.keys(raw as object).slice(0, 20).join(', ') || '(empty object)';
}

function hasAnalyzeShape(obj: Record<string, unknown>): boolean {
  return (
    Array.isArray(obj.relatedContent) ||
    (obj.cannibalization != null && typeof obj.cannibalization === 'object') ||
    Array.isArray(obj.recommendations)
  );
}

function camelizeKeys(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const camel = snakeToCamel(key);
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

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
