import {
  MaintenanceMode,
  StoredMaintenance,
  createDefaultMaintenanceConfig,
} from '../../settings/entities/settings.constants';

export const MAINTENANCE_MODES: MaintenanceMode[] = [
  'OFF',
  'READ_ONLY',
  'MAINTENANCE',
  'EMERGENCY',
];

export const MAINTENANCE_MODULE_LABELS: Record<string, string> = {
  products: 'Products',
  orders: 'Orders',
  payment: 'Payment',
  topup: 'Topup',
  data: 'Data',
  game_cards: 'Game Cards',
  marketing: 'Marketing',
  partner_api: 'Partner API',
  customer_api: 'Customer API',
  public_api: 'Public API',
};

export function defaultMaintenanceConfig(): StoredMaintenance {
  return createDefaultMaintenanceConfig();
}

export function isStaffRole(role?: string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SUPPORT';
}
