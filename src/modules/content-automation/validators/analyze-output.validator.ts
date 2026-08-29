import { ContentPlanAction } from '@prisma/client';
import type { GenerationContext } from '../entities/generation-context.types';
import {
  INTELLIGENCE_SNAPSHOT_VERSION,
  type IntelligenceSnapshotV1,
} from '../entities/intelligence-snapshot.types';
import {
  coerceAnalyzePayload,
  summarizeAnalyzePayloadKeys,
} from './analyze-output.normalize';

const VALID_ACTIONS = new Set<string>(Object.values(ContentPlanAction));
const VALID_RISKS = new Set(['NONE', 'LOW', 'HIGH']);

export interface AiAnalyzeOutputPayload {
  relatedContent: Array<{
    pageId: string;
    title: string;
    similarityScore: number;
    reason: string;
  }>;
  cannibalization: {
    risk: 'NONE' | 'LOW' | 'HIGH';
    matches: Array<{
      pageId: string;
      title: string;
      focusKeyword: string | null;
      score: number;
    }>;
  };
  recommendations: Array<{
    action: string;
    pageId: string | null;
    confidence: number;
    reason: string;
  }>;
  internalLinkCandidates: Array<{
    pageId: string;
    title: string;
    relevanceScore: number;
  }>;
  supportingKeywords?: string[];
}

export class AnalyzeOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzeOutputValidationError';
  }
}

export function validateAndBuildAiSnapshot(
  raw: unknown,
  context: GenerationContext,
): IntelligenceSnapshotV1 {
  validateNoHref(raw);
  const coerced = coerceAnalyzePayload(raw);
  const payload = parsePayload(coerced);
  const allowedPageIds = buildAllowedPageIds(context);

  validatePageIds(payload, allowedPageIds);

  return {
    version: INTELLIGENCE_SNAPSHOT_VERSION,
    analyzedAt: new Date().toISOString(),
    source: 'AI',
    input: {
      topic: context.userProvided.topic,
      primaryKeyword: context.userProvided.primaryKeyword,
      supportingKeywords: [
        ...new Set([
          ...(context.userProvided.supportingKeywords ?? []),
          ...(payload.supportingKeywords ?? []),
        ]),
      ].slice(0, 10),
      angle: context.userProvided.angle ?? undefined,
    },
    relatedContent: payload.relatedContent,
    cannibalization: payload.cannibalization,
    recommendations: payload.recommendations.map((r) => ({
      action: r.action as ContentPlanAction,
      pageId: r.pageId,
      confidence: r.confidence,
      reason: r.reason,
    })),
    internalLinkCandidates: payload.internalLinkCandidates,
  };
}

function parsePayload(raw: unknown): AiAnalyzeOutputPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AnalyzeOutputValidationError('AI output must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  if (
    !Array.isArray(obj.relatedContent) ||
    !obj.cannibalization ||
    !Array.isArray(obj.recommendations)
  ) {
    throw new AnalyzeOutputValidationError(
      `Missing required analyze output fields (need relatedContent, cannibalization, recommendations; got keys: ${summarizeAnalyzePayloadKeys(obj)})`,
    );
  }

  const cannibal = obj.cannibalization as Record<string, unknown>;
  const risk = String(cannibal.risk ?? '');
  if (!VALID_RISKS.has(risk)) {
    throw new AnalyzeOutputValidationError(`Invalid cannibalization risk: ${risk}`);
  }

  const relatedContent = obj.relatedContent.map(parseRelated);
  const recommendations = obj.recommendations.map(parseRecommendation);
  const internalLinkCandidates = Array.isArray(obj.internalLinkCandidates)
    ? obj.internalLinkCandidates.map(parseLinkCandidate)
    : [];

  return {
    relatedContent,
    cannibalization: {
      risk: risk as 'NONE' | 'LOW' | 'HIGH',
      matches: Array.isArray(cannibal.matches)
        ? cannibal.matches.map((m: unknown) => parseMatch(m))
        : [],
    },
    recommendations,
    internalLinkCandidates,
    supportingKeywords: Array.isArray(obj.supportingKeywords)
      ? obj.supportingKeywords.filter((k): k is string => typeof k === 'string')
      : undefined,
  };
}

function parseRelated(item: unknown) {
  if (!item || typeof item !== 'object') {
    throw new AnalyzeOutputValidationError('Invalid relatedContent item');
  }
  const row = item as Record<string, unknown>;
  return {
    pageId: requireString(row.pageId, 'relatedContent.pageId'),
    title: requireString(row.title, 'relatedContent.title'),
    similarityScore: requireNumber(row.similarityScore, 'relatedContent.similarityScore'),
    reason: requireString(row.reason, 'relatedContent.reason'),
  };
}

function parseMatch(item: unknown) {
  if (!item || typeof item !== 'object') {
    throw new AnalyzeOutputValidationError('Invalid cannibalization match');
  }
  const row = item as Record<string, unknown>;
  return {
    pageId: requireString(row.pageId, 'cannibalization.pageId'),
    title: requireString(row.title, 'cannibalization.title'),
    focusKeyword:
      row.focusKeyword === null || row.focusKeyword === undefined
        ? null
        : String(row.focusKeyword),
    score: requireNumber(row.score, 'cannibalization.score'),
  };
}

function parseRecommendation(item: unknown) {
  if (!item || typeof item !== 'object') {
    throw new AnalyzeOutputValidationError('Invalid recommendation');
  }
  const row = item as Record<string, unknown>;
  const action = requireString(row.action, 'recommendation.action');
  if (!VALID_ACTIONS.has(action)) {
    throw new AnalyzeOutputValidationError(`Invalid recommendation action: ${action}`);
  }
  return {
    action,
    pageId:
      row.pageId === null || row.pageId === undefined ? null : String(row.pageId),
    confidence: requireNumber(row.confidence, 'recommendation.confidence'),
    reason: requireString(row.reason, 'recommendation.reason'),
  };
}

function parseLinkCandidate(item: unknown) {
  if (!item || typeof item !== 'object') {
    throw new AnalyzeOutputValidationError('Invalid internalLinkCandidate');
  }
  const row = item as Record<string, unknown>;
  return {
    pageId: requireString(row.pageId, 'internalLinkCandidate.pageId'),
    title: requireString(row.title, 'internalLinkCandidate.title'),
    relevanceScore: requireNumber(row.relevanceScore, 'internalLinkCandidate.relevanceScore'),
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnalyzeOutputValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new AnalyzeOutputValidationError(`${field} must be a number`);
  }
  return value;
}

function buildAllowedPageIds(context: GenerationContext): Set<string> {
  const ids = new Set<string>();
  for (const item of context.existingContent) ids.add(item.pageId);
  for (const link of context.internalLinkCandidates) {
    if (link.validated) ids.add(link.targetPageId);
  }
  return ids;
}

function validatePageIds(payload: AiAnalyzeOutputPayload, allowed: Set<string>): void {
  const check = (pageId: string, field: string) => {
    if (!allowed.has(pageId)) {
      throw new AnalyzeOutputValidationError(`${field} pageId not in allowed context: ${pageId}`);
    }
  };

  for (const row of payload.relatedContent) check(row.pageId, 'relatedContent');
  for (const row of payload.cannibalization.matches) check(row.pageId, 'cannibalization');
  for (const row of payload.recommendations) {
    if (row.pageId) check(row.pageId, 'recommendation');
  }
  for (const row of payload.internalLinkCandidates) check(row.pageId, 'internalLinkCandidate');
}

function validateNoHref(raw: unknown): void {
  const json = JSON.stringify(raw);
  if (/href\s*[:=]/i.test(json) || /https?:\/\//i.test(json)) {
    throw new AnalyzeOutputValidationError('AI output must not contain href or URLs');
  }
}
