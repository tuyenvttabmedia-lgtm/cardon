import { detectImageKind } from './image-magic.util';

describe('detectImageKind', () => {
  it('detects JPEG / PNG / WEBP', () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(
      detectImageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe('png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    expect(detectImageKind(webp)).toBe('webp');
  });

  it('rejects GIF and random bytes (MIME spoof)', () => {
    expect(detectImageKind(Buffer.from('GIF89a............'))).toBeNull();
    expect(detectImageKind(Buffer.from('not-an-image!!!!'))).toBeNull();
  });
});
