import {
  ADMIN_PAGINATION_DEFAULT,
  ADMIN_PAGINATION_MAX,
} from '../entities/admin.constants';

export function resolveAdminPagination(
  skip?: number,
  take?: number,
): { skip: number; take: number } {
  const resolvedSkip = skip ?? 0;
  const resolvedTake = Math.min(take ?? ADMIN_PAGINATION_DEFAULT, ADMIN_PAGINATION_MAX);

  return {
    skip: resolvedSkip < 0 ? 0 : resolvedSkip,
    take: resolvedTake < 1 ? ADMIN_PAGINATION_DEFAULT : resolvedTake,
  };
}
