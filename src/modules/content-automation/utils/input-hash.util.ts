import { createHash } from 'crypto';

export function buildInputHash(systemPrompt: string, userPrompt: string): string {
  return createHash('sha256')
    .update(`${systemPrompt}\n---\n${userPrompt}`)
    .digest('hex')
    .slice(0, 64);
}

export function estimateCostUsd(
  model: string,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null || tokensOut == null) {
    return null;
  }

  const rates = resolveModelRates(model);
  const cost = (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output;
  return cost.toFixed(6);
}

function resolveModelRates(model: string): { input: number; output: number } {
  const normalized = model.toLowerCase();
  if (normalized.includes('gpt-4.1-mini')) {
    return { input: 0.4, output: 1.6 };
  }
  if (normalized.includes('gpt-4o-mini')) {
    return { input: 0.15, output: 0.6 };
  }
  return { input: 0.4, output: 1.6 };
}
