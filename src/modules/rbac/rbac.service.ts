import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PermissionCacheService } from './permission-cache.service';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async getPermissionsForRole(role: UserRole): Promise<string[]> {
    const cached = this.permissionCache.getRolePermissions(role);
    if (cached) {
      return cached;
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    });

    const permissions = rows.map((row) => row.permission.code);
    this.permissionCache.setRolePermissions(role, permissions);

    return permissions;
  }

  async roleHasPermission(role: UserRole, permission: string): Promise<boolean> {
    const permissions = await this.getPermissionsForRole(role);
    return permissions.includes(permission);
  }

  async roleHasAnyPermission(
    role: UserRole,
    required: string[],
  ): Promise<boolean> {
    if (required.length === 0) {
      return true;
    }

    const permissions = await this.getPermissionsForRole(role);
    return required.some((code) => permissions.includes(code));
  }

  /** Invoke after admin mutates role_permissions for a role. */
  notifyRolePermissionsChanged(role: UserRole): void {
    this.permissionCache.onRolePermissionsChanged(role);
  }

  /** Invoke after user role changes (e.g. promotion/demotion). */
  async notifyUserRoleChanged(userId: string): Promise<void> {
    await this.permissionCache.invalidateUser(userId);
  }
}
