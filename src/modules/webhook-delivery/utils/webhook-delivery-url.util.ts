import { BadRequestException } from '@nestjs/common';
import { WEBHOOK_BLOCKED_HOST_SUFFIXES } from '../entities/webhook-delivery.constants';

export function assertValidWebhookDestination(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestException('Webhook URL không hợp lệ');
  }

  const host = url.hostname.toLowerCase();
  const isLocalDev =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal';

  if (url.protocol !== 'https:' && !isLocalDev) {
    throw new BadRequestException('Webhook URL phải dùng HTTPS');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL phải dùng HTTP hoặc HTTPS');
  }

  for (const blocked of WEBHOOK_BLOCKED_HOST_SUFFIXES) {
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      if (blocked === 'localhost' || blocked === '127.0.0.1') {
        if (isLocalDev) continue;
      }
      throw new BadRequestException('Webhook URL không được trỏ về hệ thống CardOn');
    }
  }

  if (url.pathname.includes('/api/partner/') || url.pathname.includes('/api/v1/payments/webhook')) {
    throw new BadRequestException('Webhook URL không hợp lệ — ngăn vòng lặp callback');
  }

  return url;
}
