import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface RoleCacheEntry {
  permissions: string[];
  expiresAt: number;
}

@Injectable()
export class PermissionCacheService {
  private readonly roleCache = new Map<UserRole, RoleCacheEntry>();
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  getRolePermissions(role: UserRole): string[] | null {
    const entry = this.roleCache.get(role);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) {
        this.roleCache.delete(role);
      }
      return null;
    }
    return entry.permissions;
  }

  setRolePermissions(role: UserRole, permissions: string[]): void {
    this.roleCache.set(role, {
      permissions,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  invalidateRole(role: UserRole): void {
    this.roleCache.delete(role);
  }

  async invalidateUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { role: true },
    });

    if (user) {
      this.invalidateRole(user.role);
    }
  }

  /** Call after role_permissions rows are created, updated, or deleted. */
  onRolePermissionsChanged(role: UserRole): void {
    this.invalidateRole(role);
  }
}
