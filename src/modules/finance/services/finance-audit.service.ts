import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { AuditService } from '../../auth/audit.service';
import { FINANCE_AUDIT_ACTIONS } from '../entities/finance.constants';

@Injectable()
export class FinanceAuditService {
  constructor(private readonly auditService: AuditService) {}

  recordReconcileCreated(
    adminId: string,
    reportId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.recordEvent({
      actorId: adminId,
      action: FINANCE_AUDIT_ACTIONS.RECONCILE_CREATED,
      targetType: AuditTargetType.ORDER,
      targetId: reportId,
      metadata,
    });
  }

  recordInvoiceCreated(
    adminId: string,
    invoiceId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.recordEvent({
      actorId: adminId,
      action: FINANCE_AUDIT_ACTIONS.INVOICE_CREATED,
      targetType: AuditTargetType.INVOICE,
      targetId: invoiceId,
      metadata,
    });
  }

  recordInvoiceVoided(
    adminId: string,
    invoiceId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.recordEvent({
      actorId: adminId,
      action: FINANCE_AUDIT_ACTIONS.INVOICE_VOIDED,
      targetType: AuditTargetType.INVOICE,
      targetId: invoiceId,
      metadata,
    });
  }
}
