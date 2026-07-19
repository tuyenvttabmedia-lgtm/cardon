import { MAX_AUDIT_JSON_BYTES } from '../entities/audit-log.constants';
import { jsonByteSize, sanitizeAuditValue } from './audit-sanitize.util';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function computeJsonDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown>; fields: string[] } {
  const oldObj = before ?? {};
  const newObj = after ?? {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const oldDiff: Record<string, unknown> = {};
  const newDiff: Record<string, unknown> = {};
  const fields: string[] = [];

  for (const key of keys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (!valuesEqual(oldVal, newVal)) {
      fields.push(key);
      oldDiff[key] = oldVal;
      newDiff[key] = newVal;
    }
  }

  return { oldValue: oldDiff, newValue: newDiff, fields };
}

export function prepareAuditPayload(
  before: unknown,
  after: unknown,
): {
  oldValue: unknown;
  newValue: unknown;
  fieldName: string | null;
} {
  const beforeObj = isPlainObject(before) ? before : { value: before };
  const afterObj = isPlainObject(after) ? after : { value: after };
  const { oldValue, newValue, fields } = computeJsonDiff(beforeObj, afterObj);

  if (fields.length === 0) {
    return { oldValue: null, newValue: null, fieldName: null };
  }

  let sanitizedOld = sanitizeAuditValue(oldValue);
  let sanitizedNew = sanitizeAuditValue(newValue);

  const combinedSize =
    jsonByteSize(sanitizedOld) + jsonByteSize(sanitizedNew);

  if (combinedSize > MAX_AUDIT_JSON_BYTES) {
    sanitizedOld = sanitizeAuditValue(oldValue);
    sanitizedNew = sanitizeAuditValue(newValue);
  }

  const fieldName =
    fields.length === 1
      ? fields[0]
      : fields.length <= 3
        ? fields.join(', ')
        : 'multiple';

  return {
    oldValue: sanitizedOld,
    newValue: sanitizedNew,
    fieldName,
  };
}

export function resolveEnableDisableAction(
  fields: string[],
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
): 'ENABLE' | 'DISABLE' | null {
  const toggleFields = ['enabled', 'maintenanceMode', 'customerTopupEnabled', 'customerDataEnabled'];
  const key = toggleFields.find((field) => fields.includes(field));
  if (!key) {
    return null;
  }

  const oldFlag = Boolean(oldValue[key]);
  const newFlag = Boolean(newValue[key]);

  if (oldFlag === newFlag) {
    return null;
  }

  return newFlag ? 'ENABLE' : 'DISABLE';
}
