import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { mapAdminPayment } from '../../payment/entities/payment.mapper';
import { PaymentService } from '../../payment/services/payment.service';
import { AdminPaymentQueryDto, ResolvePaymentReviewDto } from '../dto/admin.dto';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminPaymentService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly adminAudit: AdminAuditService,
    private readonly repository: AdminRepository,
  ) {}

  listManualReview() {
    return this.paymentService.listManualReviewQueue();
  }

  async listPayments(query: AdminPaymentQueryDto) {
    const filters = {
      gateway: query.gateway,
      status: query.status,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      amount: query.amount,
      skip: query.skip,
      take: query.take,
    };

    const [rows, total] = await Promise.all([
      this.repository.findPaymentsAdmin(filters),
      this.repository.countPaymentsAdmin(filters),
    ]);

    return {
      items: rows.map((row) => mapAdminPayment(row)),
      total,
    };
  }

  async resolveManualReview(
    adminId: string,
    paymentId: string,
    dto: ResolvePaymentReviewDto,
  ) {
    const result =
      dto.action === 'approve'
        ? await this.paymentService.approveManualReview(paymentId, adminId)
        : await this.paymentService.rejectManualReview(
            paymentId,
            adminId,
            dto.reason,
          );

    await this.adminAudit.record(
      adminId,
      dto.action === 'approve'
        ? ADMIN_AUDIT_ACTIONS.ADMIN_PAYMENT_REVIEW_APPROVE
        : ADMIN_AUDIT_ACTIONS.ADMIN_PAYMENT_REVIEW_REJECT,
      AuditTargetType.ORDER,
      result.orderId,
      {
        paymentId: result.paymentId,
        action: dto.action,
        reason: dto.reason,
      },
    );

    return result;
  }
}
