import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, InvoiceType, OrderPaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CreateAgentInvoiceDto,
  CreateCustomerInvoiceDto,
  FinanceListQueryDto,
  VoidInvoiceDto,
} from '../dto/finance.dto';
import { FinanceRepository } from '../repositories/finance.repository';
import { FinanceAuditService } from './finance-audit.service';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly financeAudit: FinanceAuditService,
  ) {}

  listInvoices(query: FinanceListQueryDto) {
    return this.repository.listInvoices(query.skip, query.take);
  }

  async getInvoice(invoiceId: string) {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async createCustomerInvoice(adminId: string, dto: CreateCustomerInvoiceDto) {
    const existing = await this.repository.findNonVoidInvoiceByOrderId(dto.orderId);
    if (existing) {
      return existing;
    }

    const order = await this.repository.findOrderForInvoice(dto.orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException('Order must be PAID to create customer invoice');
    }

    const subtotal = new Decimal(order.totalAmount);
    const taxAmount = new Decimal(0);
    const invoiceNumber = await this.repository.generateInvoiceNumber();

    const invoice = await this.repository.createInvoice({
      invoiceNumber,
      type: InvoiceType.B2C_RECEIPT,
      orderId: order.id,
      userId: order.userId ?? undefined,
      subtotal,
      taxAmount,
      totalAmount: subtotal.add(taxAmount),
      metadata: {
        orderCode: order.orderCode,
        guestEmail: order.guestEmail,
        invoiceRequired: order.invoiceRequired,
      },
    });

    await this.financeAudit.recordInvoiceCreated(adminId, invoice.id, {
      type: InvoiceType.B2C_RECEIPT,
      orderId: order.id,
      invoiceNumber,
    });

    return invoice;
  }

  async createAgentInvoice(adminId: string, dto: CreateAgentInvoiceDto) {
    const existing = await this.repository.findNonVoidAgentInvoiceByLedgerEntryId(
      dto.ledgerEntryId,
    );
    if (existing) {
      return existing;
    }

    const agent = await this.repository.findAgentById(dto.agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const ledgerEntry = await this.repository.findLedgerEntryForInvoice(
      dto.agentId,
      dto.ledgerEntryId,
    );
    if (!ledgerEntry) {
      throw new NotFoundException('Credit ledger entry not found for agent');
    }

    const subtotal = new Decimal(ledgerEntry.amount);
    const taxAmount = new Decimal(0);
    const invoiceNumber = await this.repository.generateInvoiceNumber();

    const invoice = await this.repository.createInvoice({
      invoiceNumber,
      type: InvoiceType.AGENT_TOPUP_RECEIPT,
      agentId: dto.agentId,
      subtotal,
      taxAmount,
      totalAmount: subtotal.add(taxAmount),
      metadata: {
        ledgerEntryId: ledgerEntry.id,
        referenceType: ledgerEntry.referenceType,
        referenceId: ledgerEntry.referenceId,
        description: ledgerEntry.description,
      },
    });

    await this.financeAudit.recordInvoiceCreated(adminId, invoice.id, {
      type: InvoiceType.AGENT_TOPUP_RECEIPT,
      agentId: dto.agentId,
      ledgerEntryId: ledgerEntry.id,
      invoiceNumber,
    });

    return invoice;
  }

  async issueInvoice(adminId: string, invoiceId: string) {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be issued');
    }

    return this.repository.updateInvoiceStatus(invoiceId, InvoiceStatus.ISSUED, {
      issuedAt: new Date(),
    });
  }

  async voidInvoice(adminId: string, invoiceId: string, dto: VoidInvoiceDto) {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice already voided');
    }

    const updated = await this.repository.updateInvoiceStatus(
      invoiceId,
      InvoiceStatus.VOID,
    );

    await this.financeAudit.recordInvoiceVoided(adminId, invoiceId, {
      reason: dto.reason,
      previousStatus: invoice.status,
    });

    return updated;
  }
}
