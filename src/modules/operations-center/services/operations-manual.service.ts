import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminOrderService } from '../../admin/services/admin-order.service';
import { WebhookMonitorService } from '../../webhook-monitor/services/webhook-monitor.service';
import { ManualOperationAction } from '../entities/operations-center.constants';
import { OperationsCenterService } from './operations-center.service';

@Injectable()
export class OperationsManualService {
  constructor(
    private readonly operationsService: OperationsCenterService,
    private readonly adminOrderService: AdminOrderService,
    private readonly webhookMonitorService: WebhookMonitorService,
  ) {}

  assertCanManage(user: AuthenticatedUser) {
    const allowed: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN / ADMIN được phép thao tác thủ công');
    }
  }

  async execute(
    user: AuthenticatedUser,
    action: ManualOperationAction,
    body: {
      orderId?: string;
      webhookId?: string;
      note?: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    this.assertCanManage(user);

    const ctx = {
      ipAddress: body.ipAddress ?? null,
      userAgent: body.userAgent ?? null,
      sessionId: null,
      correlationId: null,
    };

    switch (action) {
      case 'recheck_provider':
      case 'cancel_safely': {
        if (!body.orderId) throw new BadRequestException('orderId required');
        const result = await this.adminOrderService.retryFulfillment(user.id, body.orderId);
        this.operationsService.logActivity(user.id, user.email, action, { orderId: body.orderId, result });
        return { ok: true, action, result };
      }
      case 'resend_email': {
        if (!body.orderId) throw new BadRequestException('orderId required');
        await this.adminOrderService.resendDeliveryEmail(user.id, body.orderId);
        this.operationsService.logActivity(user.id, user.email, action, { orderId: body.orderId });
        return { ok: true, action };
      }
      case 'replay_webhook': {
        if (!body.webhookId) throw new BadRequestException('webhookId required');
        await this.webhookMonitorService.retryWebhook(body.webhookId, user, ctx);
        this.operationsService.logActivity(user.id, user.email, action, { webhookId: body.webhookId });
        return { ok: true, action };
      }
      case 'lock_order': {
        if (!body.orderId) throw new BadRequestException('orderId required');
        const result = await this.operationsService.lockOrder(body.orderId, true, user.id);
        this.operationsService.logActivity(user.id, user.email, action, result);
        return { ok: true, action, ...result };
      }
      case 'unlock_order': {
        if (!body.orderId) throw new BadRequestException('orderId required');
        const result = await this.operationsService.lockOrder(body.orderId, false, user.id);
        this.operationsService.logActivity(user.id, user.email, action, result);
        return { ok: true, action, ...result };
      }
      case 'mark_reconciled': {
        this.operationsService.logActivity(user.id, user.email, action, {
          orderId: body.orderId,
          note: body.note,
          marked: true,
        });
        return { ok: true, action, message: 'Đã đánh dấu đối soát (ghi nhận hoạt động)' };
      }
      case 'rebuild_ledger_summary': {
        this.operationsService.logActivity(user.id, user.email, action, { orderId: body.orderId });
        return { ok: true, action, message: 'Yêu cầu tổng hợp sổ quỹ đã ghi nhận' };
      }
      case 'resend_pin': {
        if (!body.orderId) throw new BadRequestException('orderId required');
        await this.adminOrderService.resendDeliveryEmail(user.id, body.orderId);
        this.operationsService.logActivity(user.id, user.email, action, { orderId: body.orderId });
        return { ok: true, action, message: 'Đã gửi lại email giao PIN' };
      }
      case 'send_telegram':
      case 'create_note': {
        this.operationsService.logActivity(user.id, user.email, action, {
          orderId: body.orderId,
          note: body.note,
        });
        return { ok: true, action, message: 'Đã ghi nhận' };
      }
      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }
  }
}
