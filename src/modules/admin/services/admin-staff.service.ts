import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditTargetType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma.service';
import { BCRYPT_ROUNDS } from '../../auth/auth.constants';
import { NotificationService } from '../../notification/services/notification.service';
import { TokenService } from '../../auth/token.service';
import {
  AdminCreateStaffDto,
  AdminUpdateStaffDto,
} from '../dto/admin-operation.dto';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminAuditService } from './admin-audit.service';

const STAFF_ROLES: UserRole[] = [
  UserRole.SUPPORT,
  UserRole.MARKETING,
  UserRole.ACCOUNTANT,
  UserRole.ADMIN,
];

@Injectable()
export class AdminStaffService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly prisma: PrismaService,
    private readonly adminAudit: AdminAuditService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
  ) {}

  listStaff() {
    return this.repository.findStaffUsers({});
  }

  async createStaff(adminId: string, dto: AdminCreateStaffDto) {
    if (!STAFF_ROLES.includes(dto.role)) {
      throw new BadRequestException('Invalid staff role');
    }
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create SUPER_ADMIN via API');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        passwordHash,
        role: dto.role,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_CREATED,
      AuditTargetType.USER,
      user.id,
      { role: dto.role },
    );

    return user;
  }

  async updateStaff(adminId: string, id: string, dto: AdminUpdateStaffDto) {
    const staff = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!staff || staff.role === UserRole.CUSTOMER || staff.role === UserRole.AGENT) {
      throw new NotFoundException('Staff user not found');
    }
    if (staff.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify SUPER_ADMIN');
    }
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }
    if (dto.role && !STAFF_ROLES.includes(dto.role)) {
      throw new BadRequestException('Invalid staff role');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        role: dto.role,
        status: dto.status,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_UPDATED,
      AuditTargetType.USER,
      id,
      { fields: Object.keys(dto) },
    );

    return updated;
  }

  async disableStaff(adminId: string, id: string) {
    if (adminId === id) {
      throw new ForbiddenException('Cannot disable your own account');
    }

    const staff = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!staff || staff.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot disable this user');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.SUSPENDED },
      select: { id: true, email: true, status: true },
    });

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_DISABLED,
      AuditTargetType.USER,
      id,
      {},
    );

    return updated;
  }

  async enableStaff(adminId: string, id: string) {
    if (adminId === id) {
      throw new ForbiddenException('Cannot modify your own account');
    }
    const staff = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!staff || staff.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot enable this user');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
      select: { id: true, email: true, status: true, role: true },
    });
    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_ENABLED,
      AuditTargetType.USER,
      id,
      {},
    );
    return updated;
  }

  async deleteStaff(adminId: string, id: string) {
    if (adminId === id) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    const staff = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!staff) {
      throw new NotFoundException('Staff user not found');
    }
    if (staff.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot delete SUPER_ADMIN');
    }
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.SUSPENDED },
    });
    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_DELETED,
      AuditTargetType.USER,
      id,
      {},
    );
    return { deleted: true, id };
  }

  async resetStaffPassword(adminId: string, id: string) {
    const staff = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!staff || staff.role === UserRole.CUSTOMER) {
      throw new NotFoundException('Staff user not found');
    }
    if (staff.role === UserRole.SUPER_ADMIN && adminId !== id) {
      throw new ForbiddenException('Cannot reset SUPER_ADMIN password');
    }

    const rawToken = this.tokenService.generateRefreshTokenValue();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: id,
        tokenHash: this.tokenService.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.notificationService.notifyPasswordReset(staff.email, rawToken);

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_STAFF_PASSWORD_RESET,
      AuditTargetType.USER,
      id,
      {},
    );

    return { message: 'Password reset email sent' };
  }
}
