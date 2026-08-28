export function extractJsonFromText(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  throw new Error('Unable to parse JSON from AI output');
}
