import {
  coerceAnalyzePayload,
  summarizeAnalyzePayloadKeys,
} from './analyze-output.normalize';

describe('analyze-output.normalize', () => {
  it('camelizes snake_case keys recursively', () => {
    const out = coerceAnalyzePayload({
      related_content: [{ page_id: 'p1', similarity_score: 1 }],
      cannibalization: { risk: 'NONE', matches: [] },
      recommendations: [],
    }) as Record<string, unknown>;

    expect(out.relatedContent).toEqual([{ pageId: 'p1', similarityScore: 1 }]);
  });

  it('unwraps nested result wrappers', () => {
    const out = coerceAnalyzePayload({
      result: {
        relatedContent: [],
        cannibalization: { risk: 'LOW', matches: [] },
        recommendations: [],
      },
    }) as Record<string, unknown>;

    expect(out.cannibalization).toEqual({ risk: 'LOW', matches: [] });
  });

  it('parses double-encoded JSON strings', () => {
    const out = coerceAnalyzePayload(
      JSON.stringify({
        relatedContent: [],
        cannibalization: { risk: 'NONE', matches: [] },
        recommendations: [],
      }),
    ) as Record<string, unknown>;

    expect(Array.isArray(out.relatedContent)).toBe(true);
  });

  it('summarizes keys for diagnostics', () => {
    expect(summarizeAnalyzePayloadKeys({ foo: 1, bar: 2 })).toBe('foo, bar');
  });
});
