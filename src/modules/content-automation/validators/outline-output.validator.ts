import type { OutlineV1 } from '../entities/outline.types';
import { OUTLINE_VERSION } from '../entities/outline.types';

export class OutlineOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutlineOutputValidationError';
  }
}

export function validateAndBuildOutline(raw: unknown, source: 'AI' | 'HEURISTIC'): OutlineV1 {
  validateNoHref(raw);
  const payload = parsePayload(raw);

  return {
    version: OUTLINE_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    title: payload.title,
    excerpt: payload.excerpt,
    sections: payload.sections,
    seoNotes: payload.seoNotes,
  };
}

function parsePayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new OutlineOutputValidationError('Outline output must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;
  const title = requireString(obj.title, 'title');
  const sections = Array.isArray(obj.sections) ? obj.sections.map(parseSection) : [];
  if (sections.length < 1) {
    throw new OutlineOutputValidationError('Outline must have at least one section');
  }

  const seoNotesRaw = obj.seoNotes;
  let seoNotes: OutlineV1['seoNotes'];
  if (seoNotesRaw && typeof seoNotesRaw === 'object' && !Array.isArray(seoNotesRaw)) {
    const s = seoNotesRaw as Record<string, unknown>;
    seoNotes = {
      metaTitleHint: optionalString(s.metaTitleHint),
      metaDescriptionHint: optionalString(s.metaDescriptionHint),
    };
  }

  return {
    title,
    excerpt: optionalString(obj.excerpt),
    sections,
    seoNotes,
  };
}

function parseSection(item: unknown, index: number) {
  if (!item || typeof item !== 'object') {
    throw new OutlineOutputValidationError(`Invalid section at index ${index}`);
  }
  const row = item as Record<string, unknown>;
  const level = row.level;
  if (level !== 2 && level !== 3) {
    throw new OutlineOutputValidationError(`Section ${index}: level must be 2 or 3`);
  }

  const keyPoints = Array.isArray(row.keyPoints)
    ? row.keyPoints.filter((k): k is string => typeof k === 'string')
    : [];

  return {
    id: requireString(row.id, `sections[${index}].id`),
    heading: requireString(row.heading, `sections[${index}].heading`),
    level: level as 2 | 3,
    summary: requireString(row.summary, `sections[${index}].summary`),
    keyPoints,
    targetWordCount:
      typeof row.targetWordCount === 'number' ? row.targetWordCount : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OutlineOutputValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validateNoHref(raw: unknown): void {
  const json = JSON.stringify(raw);
  if (/href\s*[:=]/i.test(json) || /https?:\/\//i.test(json)) {
    throw new OutlineOutputValidationError('Outline output must not contain href or URLs');
  }
}
