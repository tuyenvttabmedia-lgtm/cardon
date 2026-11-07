export const REFUND_PERMISSIONS = {
  REQUEST: 'refund.request',
  APPROVE: 'refund.approve',
  EXECUTE: 'refund.execute',
  RECONCILE: 'refund.reconcile',
} as const;

export const REFUND_READ_PERMISSIONS = [
  REFUND_PERMISSIONS.REQUEST,
  REFUND_PERMISSIONS.APPROVE,
  REFUND_PERMISSIONS.EXECUTE,
  REFUND_PERMISSIONS.RECONCILE,
] as const;

export const REFUND_REQUEST_ROLES = [
  'SUPPORT',
  'ACCOUNTANT',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export const REFUND_APPROVE_ROLES = [
  'ACCOUNTANT',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export const REFUND_EXECUTE_ROLES = [
  'ACCOUNTANT',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export const REFUND_RECONCILE_ROLES = [
  'ACCOUNTANT',
  'SUPER_ADMIN',
] as const;
