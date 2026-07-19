import { UserRole } from '@prisma/client';
import { PermissionCacheService } from './permission-cache.service';
import { RbacService } from './rbac.service';

describe('PermissionCacheService', () => {
  let cache: PermissionCacheService;
  let prisma: { user: { findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
    };
    cache = new PermissionCacheService(prisma as never);
  });

  it('invalidateRole clears cached permissions', () => {
    cache.setRolePermissions(UserRole.SUPPORT, ['orders.read']);
    expect(cache.getRolePermissions(UserRole.SUPPORT)).toEqual(['orders.read']);

    cache.invalidateRole(UserRole.SUPPORT);
    expect(cache.getRolePermissions(UserRole.SUPPORT)).toBeNull();
  });

  it('invalidateUser clears cache for user role', async () => {
    cache.setRolePermissions(UserRole.ADMIN, ['settings.manage']);
    prisma.user.findFirst.mockResolvedValue({ role: UserRole.ADMIN });

    await cache.invalidateUser('user-admin-1');

    expect(cache.getRolePermissions(UserRole.ADMIN)).toBeNull();
  });

  it('onRolePermissionsChanged clears role cache', () => {
    cache.setRolePermissions(UserRole.SUPPORT, ['orders.read']);
    cache.onRolePermissionsChanged(UserRole.SUPPORT);
    expect(cache.getRolePermissions(UserRole.SUPPORT)).toBeNull();
  });
});

describe('RbacService permission invalidation', () => {
  it('reflects DB change immediately after notifyRolePermissionsChanged', async () => {
    const prisma = {
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ permission: { code: 'orders.read' } }])
          .mockResolvedValueOnce([]),
      },
    };
    const permissionCache = new PermissionCacheService({
      user: { findFirst: jest.fn() },
    } as never);
    const rbac = new RbacService(prisma as never, permissionCache);

    expect(
      await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
    ).toBe(true);

    rbac.notifyRolePermissionsChanged(UserRole.SUPPORT);

    expect(
      await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
    ).toBe(false);
  });
});
