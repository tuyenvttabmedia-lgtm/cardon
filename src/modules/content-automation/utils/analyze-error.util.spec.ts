import { AiProviderError } from '../providers/ai-provider.interface';
import { AnalyzeOutputValidationError } from '../validators/analyze-output.validator';
import { isAnalyzeJobRetryable } from './analyze-error.util';

describe('isAnalyzeJobRetryable', () => {
  it('returns false for validation errors', () => {
    expect(isAnalyzeJobRetryable(new AnalyzeOutputValidationError('bad pageId'))).toBe(false);
  });

  it('returns false for non-retryable provider errors', () => {
    expect(isAnalyzeJobRetryable(new AiProviderError('auth', 'AUTH', false))).toBe(false);
    expect(
      isAnalyzeJobRetryable(new AiProviderError('malformed', 'MALFORMED_OUTPUT', false)),
    ).toBe(false);
    expect(
      isAnalyzeJobRetryable(new AiProviderError('invalid', 'INVALID_REQUEST', false)),
    ).toBe(false);
  });

  it('returns true for retryable provider errors', () => {
    expect(isAnalyzeJobRetryable(new AiProviderError('timeout', 'TIMEOUT', true))).toBe(true);
    expect(isAnalyzeJobRetryable(new AiProviderError('rate', 'RATE_LIMIT', true))).toBe(true);
    expect(
      isAnalyzeJobRetryable(new AiProviderError('down', 'PROVIDER_UNAVAILABLE', true)),
    ).toBe(true);
  });

  it('returns false for unknown errors', () => {
    expect(isAnalyzeJobRetryable(new Error('unexpected'))).toBe(false);
  });
});
