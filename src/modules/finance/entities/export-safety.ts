const SENSITIVE_EXPORT_PATTERNS = [
  /apiKeyHash/i,
  /secretKeyEncrypted/i,
  /encryptedPin/i,
  /encryptedSerial/i,
  /api_key/i,
  /secret_key/i,
  /passwordHash/i,
  /privateKey/i,
];

export function assertExportCsvSafe(csv: string): void {
  for (const pattern of SENSITIVE_EXPORT_PATTERNS) {
    if (pattern.test(csv)) {
      throw new Error(`CSV export must not contain sensitive field matching ${pattern}`);
    }
  }
}

export function sanitizeExportField(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/[\r\n"]/g, ' ').trim();
}
