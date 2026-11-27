import { describe, expect, it } from 'vitest';
import {
  facebookShareUrl,
  telegramShareUrl,
  xShareUrl,
  zaloShareUrl,
} from './article-share';

const ARTICLE = 'https://cardon.vn/tin-tuc/kien-thuc-esim/demo-post';
const TITLE = 'eSIM Nhật Bản: hướng dẫn';

describe('article share urls', () => {
  it('builds Facebook sharer with encoded article url', () => {
    expect(facebookShareUrl(ARTICLE)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ARTICLE)}`,
    );
  });

  it('builds X intent on x.com (not the legacy twitter host)', () => {
    const href = xShareUrl(ARTICLE, TITLE);
    expect(href.startsWith('https://x.com/intent/tweet?')).toBe(true);
    expect(href).toContain(`url=${encodeURIComponent(ARTICLE)}`);
    expect(href).toContain('text=');
    expect(href).not.toContain('twitter.com');
  });

  it('builds Telegram share url', () => {
    const href = telegramShareUrl(ARTICLE, TITLE);
    expect(href.startsWith('https://t.me/share/url?')).toBe(true);
    expect(href).toContain(`url=${encodeURIComponent(ARTICLE)}`);
  });

  it('builds Zalo via zaloapp QR deep-link, not the broken zalo.me/share login redirect', () => {
    const href = zaloShareUrl(ARTICLE);
    expect(href).toBe(`https://zaloapp.com/qr/p/?url=${encodeURIComponent(ARTICLE)}`);
    expect(href).not.toContain('zalo.me/share');
  });
});
