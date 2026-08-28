import { AiProviderError } from '../providers/ai-provider.interface';
import { AnalyzeOutputValidationError } from '../validators/analyze-output.validator';
import { ArticleDocumentValidationError } from '../validators/article-document.validator';
import { OutlineOutputValidationError } from '../validators/outline-output.validator';

/**
 * BullMQ retries failed jobs when the handler throws.
 * Non-retryable AI errors must return without rethrowing.
 */
export function isAnalyzeJobRetryable(err: unknown): boolean {
  if (
    err instanceof AnalyzeOutputValidationError ||
    err instanceof OutlineOutputValidationError ||
    err instanceof ArticleDocumentValidationError
  ) {
    return false;
  }

  if (err instanceof AiProviderError) {
    return err.retryable;
  }

  return false;
}
