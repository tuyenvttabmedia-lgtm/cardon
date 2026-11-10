import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/services/notification.service';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';

export function readAiraloLowDataIccid(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const root = body as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : undefined;
  const sim =
    nested?.sim && typeof nested.sim === 'object'
      ? (nested.sim as Record<string, unknown>)
      : root.sim && typeof root.sim === 'object'
        ? (root.sim as Record<string, unknown>)
        : undefined;
  const raw = root.iccid ?? nested?.iccid ?? sim?.iccid;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length >= 10 && trimmed.length <= 32 ? trimmed : undefined;
}

export function readAiraloRemainingData(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const root = body as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : undefined;
  const raw =
    root.remaining ??
    root.remaining_data ??
    root.data_remaining ??
    nested?.remaining ??
    nested?.remaining_data ??
    nested?.data_remaining;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

/**
 * Airalo low-data webhook handler (checklist item 10).
 * HEAD must 200; POST notifies the owning customer to top up.
 */
@Injectable()
export class EsimAiraloWebhookService {
  private readonly logger = new Logger(EsimAiraloWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async handleLowData(body: unknown): Promise<{ ok: true; matched: boolean }> {
    const iccid = readAiraloLowDataIccid(body);
    if (!iccid) {
      this.logger.warn('Airalo low-data webhook missing ICCID');
      return { ok: true, matched: false };
    }
    const profile = await this.prisma.esimProfile.findUnique({
      where: { iccid },
      select: {
        id: true,
        orderItem: {
          select: {
            order: {
              select: {
                id: true,
                orderCode: true,
                userId: true,
                guestEmail: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!profile?.orderItem?.order) {
      this.logger.warn(`Airalo low-data webhook unmatched ICCID suffix=${iccid.slice(-6)}`);
      return { ok: true, matched: false };
    }
    const order = profile.orderItem.order;
    const remaining = readAiraloRemainingData(body);
    try {
      await this.notifications?.notifyEsimLowData(order.id, {
        remaining,
        iccidSuffix: iccid.slice(-6),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Airalo low-data notify failed order=${order.orderCode}: ${message}`);
    }
    return { ok: true, matched: true };
  }

  async findProfileOrderByIccid(iccid: string): Promise<{ orderId: string; orderCode: string } | null> {
    const trimmed = iccid.trim();
    if (trimmed.length < 10) return null;
    const profile = await this.prisma.esimProfile.findFirst({
      where: { iccid: trimmed, orderItem: { order: ACTIVE_ORDER_WHERE } },
      select: {
        orderItem: { select: { order: { select: { id: true, orderCode: true } } } },
      },
    });
    const order = profile?.orderItem?.order;
    return order ? { orderId: order.id, orderCode: order.orderCode } : null;
  }
}
