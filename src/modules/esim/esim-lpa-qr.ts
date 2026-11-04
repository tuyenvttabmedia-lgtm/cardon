import QRCode from 'qrcode';
import { lpaForDisplay } from './esim-delivery.view';

/**
 * SVG QR for an LPA string. Never log the payload.
 */
export function renderLpaQrSvg(secret: string): string | null {
  const payload = lpaForDisplay(secret).trim();
  if (!payload.startsWith('LPA:1$')) return null;
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const rects: string[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (qr.modules.get(row, col)) {
          rects.push(`<rect x="${col}" y="${row}" width="1" height="1"/>`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
  } catch {
    return null;
  }
}
