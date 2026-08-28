/** User-provided metadata stored in content_plans.references (JSON). */
export interface PlanReferences {
  supportingKeywords?: string[];
  angle?: string;
  factVariantIds?: string[];
  adminNotes?: string;
}

export function parsePlanReferences(raw: unknown): PlanReferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  return {
    supportingKeywords: Array.isArray(obj.supportingKeywords)
      ? obj.supportingKeywords.filter((k): k is string => typeof k === 'string')
      : undefined,
    angle: typeof obj.angle === 'string' ? obj.angle : undefined,
    factVariantIds: Array.isArray(obj.factVariantIds)
      ? obj.factVariantIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    adminNotes: typeof obj.adminNotes === 'string' ? obj.adminNotes : undefined,
  };
}
