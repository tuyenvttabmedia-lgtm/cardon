import { SECRET_FIELD_PATTERNS } from '../entities/audit-log.constants';

const MASK = '********';

function isSecretField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SECRET_FIELD_PATTERNS.some((pattern) =>
    normalized.includes(pattern.replace(/[-_]/g, '')),
  );
}

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  return MASK;
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretField(key)) {
        result[key] = maskValue(nested);
      } else {
        result[key] = sanitizeAuditValue(nested);
      }
    }
    return result;
  }

  return value;
}

export function jsonByteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch {
    return 0;
  }
}
