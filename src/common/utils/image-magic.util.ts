export type DetectedImageKind = 'jpeg' | 'png' | 'webp';

/** Magic-byte sniff for support/KYC image uploads (no GIF). */
export function detectImageKind(buffer: Buffer): DetectedImageKind | null {
  if (!buffer || buffer.length < 3) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function extensionForImageKind(kind: DetectedImageKind): string {
  if (kind === 'jpeg') return '.jpg';
  if (kind === 'png') return '.png';
  return '.webp';
}

export function mimeForImageKind(kind: DetectedImageKind): string {
  if (kind === 'jpeg') return 'image/jpeg';
  if (kind === 'png') return 'image/png';
  return 'image/webp';
}
