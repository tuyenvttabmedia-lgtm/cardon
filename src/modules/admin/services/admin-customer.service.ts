import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditTargetType, UserStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { BCRYPT_ROUNDS } from '../../auth/auth.constants';
import { TokenService } from '../../auth/token.service';
import { AdminCustomerQueryDto, AdminCustomerDetailQueryDto, AdminUpdateCustomerDto } from '../dto/admin-operation.dto';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminCustomerService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly prisma: PrismaService,
    private readonly adminAudit: AdminAuditService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  listCustomers(query: AdminCustomerQueryDto) {
    return this.repository.findCustomers({
      q: query.q,
      status: query.status,
      skip: query.skip,
      take: query.take,
    });
  }

  async getCustomer(id: string, query: AdminCustomerDetailQueryDto = {}) {
    const orderSkip = query.orderSkip ?? 0;
    const orderTake = query.orderTake ?? 10;
    const customer = await this.repository.findCustomerById(id, orderSkip, orderTake);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [spendingAgg] = await Promise.all([
      this.repository.sumCustomerPaidTotal(id),
    ]);

    const totalSpending = spendingAgg._sum.totalAmount ?? new Decimal(0);
    const { orders, _count, ...profile } = customer;

    return {
      profile,
      orders,
      ordersTotal: _count.orders,
      orderSkip,
      orderTake,
      totalSpending: totalSpending.toFixed(2),
    };
  }

  async updateCustomer(adminId: string, id: string, dto: AdminUpdateCustomerDto) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.username) {
      const existing = await this.prisma.user.findFirst({
        where: { username: dto.username.toLowerCase(), deletedAt: null, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Username already taken');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone?.trim(),
        username: dto.username?.trim().toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await this.adminAudit.record(adminId, ADMIN_AUDIT_ACTIONS.ADMIN_CUSTOMER_UPDATED, AuditTargetType.USER, id, {
      fields: Object.keys(dto),
    });

    return updated;
  }

  async lockCustomer(adminId: string, id: string) {
    return this.setCustomerStatus(adminId, id, UserStatus.SUSPENDED, ADMIN_AUDIT_ACTIONS.ADMIN_CUSTOMER_LOCKED);
  }

  async unlockCustomer(adminId: string, id: string) {
    return this.setCustomerStatus(adminId, id, UserStatus.ACTIVE, ADMIN_AUDIT_ACTIONS.ADMIN_CUSTOMER_UNLOCKED);
  }

  private async setCustomerStatus(
    adminId: string,
    id: string,
    status: UserStatus,
    action: string,
  ) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, email: true, status: true },
    });

    await this.adminAudit.record(adminId, action, AuditTargetType.USER, id, { status });

    return updated;
  }

  async resetCustomerPassword(
    adminId: string,
    id: string,
    mode: 'link' | 'temp' = 'link',
  ) {
    const customer = await this.repository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const baseUrl =
      this.configService.get<string>('appPublicUrl')?.replace(/\/$/, '') ??
      'http://localhost';

    if (mode === 'temp') {
      const tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      await this.prisma.user.update({
        where: { id },
        data: { passwordHash },
      });
      await this.adminAudit.record(
        adminId,
        ADMIN_AUDIT_ACTIONS.ADMIN_CUSTOMER_PASSWORD_RESET,
        AuditTargetType.USER,
        id,
        { mode: 'temp' },
      );
      return {
        mode: 'temp' as const,
        email: customer.email,
        tempPassword,
        message: 'Temporary password set',
      };
    }

    const rawToken = this.tokenService.generateRefreshTokenValue();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.prisma.passwordResetToken.create({
      data: {
        userId: id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      await this.notificationService.notifyPasswordReset(customer.email, rawToken);
    } catch {
      // SMTP may fail locally — admin still receives resetLink in response
    }

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_CUSTOMER_PASSWORD_RESET,
      AuditTargetType.USER,
      id,
      { mode: 'link' },
    );

    return {
      mode: 'link' as const,
      email: customer.email,
      resetLink,
      message: 'Password reset link generated',
    };
  }
}
