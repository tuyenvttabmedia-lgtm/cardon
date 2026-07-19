const SENSITIVE_LOG_PATTERNS = [
  /\bpin\b/i,
  /encryptedPin/i,
  /resetToken/i,
  /reset[_-]?token/i,
  /password[_-]?reset/i,
  /secretKey/i,
  /apiKey/i,
];

export function sanitizeNotificationLogContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_LOG_PATTERNS.some((pattern) => pattern.test(key))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string' && containsSensitiveContent(value)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export function containsSensitiveContent(text: string): boolean {
  if (/\b\d{4,}\b/.test(text) && /\bpin\b/i.test(text)) {
    return true;
  }
  return SENSITIVE_LOG_PATTERNS.some((pattern) => pattern.test(text));
}

export function safeEmailLogMeta(params: {
  to: string;
  template: string;
  subject: string;
}): Record<string, string> {
  return {
    to: params.to,
    template: params.template,
    subject: params.subject,
  };
}
