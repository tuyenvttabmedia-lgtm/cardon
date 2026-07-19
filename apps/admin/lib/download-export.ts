export function downloadTextExport(
  res: Record<string, unknown>,
  fallbackName = 'export.txt',
  fallbackMime = 'text/plain',
) {
  if (!res.content || typeof res.content !== 'string') return false;
  const mime = typeof res.mimeType === 'string' ? res.mimeType : fallbackMime;
  const blob = new Blob([res.content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = String(res.filename ?? fallbackName);
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
