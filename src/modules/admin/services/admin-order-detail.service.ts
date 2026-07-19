import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuditTargetType, CardAccessAction, UserRole } from '@prisma/client';

import ExcelJS from 'exceljs';

import { CardEncryptionService } from '../../provider/services/card-encryption.service';

import { canAdminViewPin } from '../entities/card-pin.util';

import { mapAdminOrderDetail } from '../entities/admin-order-detail.mapper';

import { mapAdminOrderDelivery } from '../entities/admin-order-delivery.mapper';

import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';

import { CardAccessLogRepository } from '../repositories/card-access-log.repository';

import { AdminRepository } from '../repositories/admin.repository';

import { AdminAuditService } from './admin-audit.service';



@Injectable()

export class AdminOrderDetailService {

  constructor(

    private readonly repository: AdminRepository,

    private readonly cardEncryption: CardEncryptionService,

    private readonly cardAccessLogRepository: CardAccessLogRepository,

    private readonly adminAudit: AdminAuditService,

  ) {}



  async getOrderDetail(

    orderId: string,

    options: {

      gatewayTransaction?: string;

      adminId?: string;

      adminRole?: UserRole;

      ip?: string | null;

      userAgent?: string | null;

    } = {},

  ) {

    const order = await this.repository.findOrderDetailById(orderId);

    if (!order) {

      throw new NotFoundException('Order not found');

    }



    const canViewPin = options.adminRole ? canAdminViewPin(options.adminRole) : false;



    const [auditLogs, pinAccessLogs] = await Promise.all([

      this.repository.findAuditLogsByTarget(orderId, 'ORDER'),

      this.cardAccessLogRepository.findByOrderId(orderId),

    ]);



    let detail = mapAdminOrderDetail({

      order,

      auditLogs,

      pinAccessLogs,

      canViewPin,

      decryptSerial: (enc) => this.cardEncryption.decrypt(enc),

      decryptPin: (enc) => this.cardEncryption.decrypt(enc),

    });



    if (options.gatewayTransaction) {

      const term = options.gatewayTransaction.toLowerCase();

      detail = {

        ...detail,

        paymentTrace: detail.paymentTrace.filter(

          (p) =>

            p.paymentReference.toLowerCase().includes(term) ||

            (p.gatewayTransactionId?.toLowerCase().includes(term) ?? false) ||

            (p.bankTransactionId?.toLowerCase().includes(term) ?? false),

        ),

      };

    }



    return detail;

  }



  async getOrderWithDelivery(

    orderId: string,

    options: {

      adminId?: string;

      adminRole?: UserRole;

      ip?: string | null;

      userAgent?: string | null;

    } = {},

  ) {

    const detail = await this.getOrderDetail(orderId, options);

    return {

      ...detail.order,

      delivery: detail.delivery,

    };

  }



  async recordPinViewed(params: {
    orderId: string;
    cardId: string;
    adminId: string;
    adminRole: UserRole;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    if (!canAdminViewPin(params.adminRole)) {
      throw new ForbiddenException('PIN access denied');
    }

    const card = await this.repository.findCardRecordById(params.cardId);
    if (!card || card.orderItem.orderId !== params.orderId) {
      throw new NotFoundException('Card not found for this order');
    }
    if (card.status !== 'DELIVERED') {
      throw new NotFoundException('Card not found for this order');
    }

    await this.auditCardPinDelivery({
      orderId: params.orderId,
      adminId: params.adminId,
      cardIds: [params.cardId],
      action: CardAccessAction.VIEW_PIN,
      auditAction: ADMIN_AUDIT_ACTIONS.CARD_PIN_VIEWED,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    return { ok: true };
  }



  async recordPinCopied(params: {
    orderId: string;
    cardId: string;
    adminId: string;
    adminRole: UserRole;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    if (!canAdminViewPin(params.adminRole)) {
      throw new ForbiddenException('PIN access denied');
    }

    const card = await this.repository.findCardRecordById(params.cardId);
    if (!card || card.orderItem.orderId !== params.orderId) {
      throw new NotFoundException('Card not found for this order');
    }
    if (card.status !== 'DELIVERED') {
      throw new NotFoundException('Card not found for this order');
    }

    await this.auditCardPinDelivery({
      orderId: params.orderId,
      adminId: params.adminId,
      cardIds: [params.cardId],
      action: CardAccessAction.COPY_PIN,
      auditAction: ADMIN_AUDIT_ACTIONS.CARD_PIN_COPIED,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    return { ok: true };
  }



  async exportDeliveryExcel(params: {
    orderId: string;
    adminId: string;
    adminRole: UserRole;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    if (!canAdminViewPin(params.adminRole)) {
      throw new ForbiddenException('Export access denied');
    }

    const order = await this.repository.findOrderDetailById(params.orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const delivery = mapAdminOrderDelivery({
      order,
      canViewPin: true,
      decryptSerial: (enc) => this.cardEncryption.decrypt(enc),
      decryptPin: (enc) => this.cardEncryption.decrypt(enc),
    });

    if (delivery.type !== 'CARD' || delivery.items.length === 0) {
      throw new BadRequestException('No card delivery to export');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cards');
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Product', key: 'product', width: 24 },
      { header: 'Face Value', key: 'faceValue', width: 16 },
      { header: 'Serial', key: 'serial', width: 24 },
      { header: 'PIN', key: 'pin', width: 20 },
      { header: 'Provider', key: 'provider', width: 16 },
      { header: 'Delivered Time', key: 'deliveredAt', width: 22 },
    ];

    delivery.items.forEach((item, index) => {
      sheet.addRow({
        stt: index + 1,
        product: item.productName,
        faceValue: item.faceValue,
        serial: item.serial ?? '',
        pin: item.pin ?? item.pinMasked ?? '',
        provider: item.providerName ?? '',
        deliveredAt: item.deliveredAt ?? '',
      });
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const cardCount = delivery.items.length;

    await this.adminAudit.record(
      params.adminId,
      ADMIN_AUDIT_ACTIONS.CARD_EXPORT,
      AuditTargetType.ORDER,
      params.orderId,
      { cardCount, source: 'admin_order_export' },
      params.ip ?? undefined,
    );

    return {
      buffer,
      filename: `order-${order.orderCode}-cards.xlsx`,
      cardCount,
    };
  }



  private async auditCardPinDelivery(params: {
    orderId: string;
    adminId: string;
    cardIds: string[];
    action: CardAccessAction;
    auditAction: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    for (const cardId of params.cardIds) {
      await this.cardAccessLogRepository.create({
        cardId,
        orderId: params.orderId,
        adminId: params.adminId,
        action: params.action,
        ip: params.ip,
        userAgent: params.userAgent,
      });

      await this.adminAudit.record(
        params.adminId,
        params.auditAction,
        AuditTargetType.ORDER,
        params.orderId,
        { cardId, source: 'admin_order_detail' },
        params.ip ?? undefined,
      );
    }
  }

}


